import { haversine } from './util.js';

// Thresholds (m/s). Hysteresis: it takes a clear signal to start "moving"
// and a clear signal to stop, so GPS noise can't flicker the speed.
const MOVE_ON = 1.4;        // ≈ 5 km/h, must be seen on 2 fixes in a row
const MOVE_OFF = 0.8;       // ≈ 3 km/h, 2 fixes below this → stopped
const HARD_STOP = 0.3;      // ≈ 1 km/h, one fix below this → stopped
const MAX_ACCEL = 7;        // m/s² — a change faster than this needs the next fix to confirm it
const MAX_SPEED = 90;       // m/s ≈ 324 km/h
const DOPPLER_MAX_ACC = 65; // ignore the chip's speed on very poor fixes (m)
const FALLBACK_MAX_ACC = 20; // only estimate speed from positions when they're this precise (m)
const HOLD_MS = 4000;       // a missing reading keeps the last speed this long before falling back
const LOST_MS = 10000;      // no speed signal at all for this long → show 0
const TAU = { gps: 1.0, position: 2.5 }; // smoothing time constants (s)

/**
 * Wraps navigator.geolocation.watchPosition.
 *
 * Speed comes from the GPS chip's Doppler measurement (coords.speed). That's
 * measured from the satellite signal itself, so position jumps and a shaking
 * phone don't affect it. Only when the phone gives no Doppler speed for a few
 * seconds do we estimate from positions, and then only over several seconds
 * and only if the distance moved is bigger than both fixes' error circles.
 *
 * Two rules keep the number steady:
 *  • "No reading" is not "0 km/h". iOS often leaves coords.speed empty on single
 *    fixes; the last speed is held instead of dropping to 0 and jumping back.
 *  • A sudden jump is held back for one fix and only accepted if the next fix
 *    agrees, so one bad reading can't spike the speed or freeze it.
 *
 * Battery: the watch is stopped whenever the app is hidden.
 */
export class GpsTracker extends EventTarget {
  constructor() {
    super();
    this.watchId = null;
    this.wanted = false;
    this.position = null;
    this.accuracy = null;
    this.heading = null;
    this.speed = 0;           // what the UI shows (m/s)
    this.rawSpeed = 0;        // last accepted measurement (m/s), for diagnostics
    this.source = 'none';     // 'gps' (Doppler) | 'position' (fallback) | 'none'
    this.status = 'wait';     // wait | ok | weak | off | unsupported
    this.moving = false;
    this.lastMoveAt = Date.now();
    this.resetTrip();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this._stopWatch();
      else if (this.wanted) this._startWatch();
    });
  }

  resetTrip() {
    this.distance = 0;
    this.movingTime = 0;
    this.maxSpeed = 0;
    this._resetMotion();
    this._emit();
  }

  _resetMotion() {
    this.prev = null;
    this.history = [];       // recent precise fixes for the fallback estimate
    this.onCount = 0;
    this.offCount = 0;
    this.prevSmoothed = 0;
    this.lastRawAt = 0;      // when we last had a usable speed reading
    this.lastDopplerAt = 0;
    this.spike = null;       // a big jump waiting for confirmation
  }

  start() { this.wanted = true; this._startWatch(); }
  stop() { this.wanted = false; this._stopWatch(); }

  _startWatch() {
    if (this.watchId != null) return;
    if (!('geolocation' in navigator)) { this.status = 'unsupported'; this._emit(); return; }
    this.watchId = navigator.geolocation.watchPosition(
      (p) => this._onPos(p),
      (e) => { this.status = e.code === 1 ? 'off' : 'wait'; this._emit(); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }

  _stopWatch() {
    if (this.watchId == null) return;
    navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this._resetMotion();          // don't count the gap as riding
    this.moving = false;
    this.speed = 0;
  }

  /**
   * Speed estimate from positions, used only when the phone gives no Doppler speed.
   * Returns null when it can't tell (not enough history, or movement within the noise
   * that could still be riding slowly); 0 only when it's confidently stationary.
   */
  _fallbackSpeed(pos, acc, ts) {
    if (acc > FALLBACK_MAX_ACC) return null;      // Wi-Fi/cell location: too jumpy to trust
    const old = this.history.find((h) => ts - h.ts >= 3000);  // oldest precise fix, 3–10 s ago
    if (!old) return null;
    const dt = (ts - old.ts) / 1000;
    const d = haversine(old.pos, pos);
    const noise = Math.max(8, old.acc + acc);      // both error circles combined
    if (d > noise) return d / dt;
    return noise / dt < MOVE_OFF ? 0 : null;
  }

  _onPos(p) {
    const c = p.coords;
    const ts = p.timestamp || Date.now();
    if (this.prev && ts <= this.prev.ts) return;   // duplicate / out-of-order fix
    const pos = { lat: c.latitude, lng: c.longitude };
    const acc = c.accuracy ?? 999;
    this.position = pos;
    this.accuracy = acc;
    this.status = acc <= 30 ? 'ok' : 'weak';
    if (typeof c.heading === 'number' && !Number.isNaN(c.heading)) this.heading = c.heading;

    const dt = this.prev ? (ts - this.prev.ts) / 1000 : 0;
    if (acc <= FALLBACK_MAX_ACC) {
      this.history.push({ pos, acc, ts });
      while (this.history.length && ts - this.history[0].ts > 10000) this.history.shift();
    }

    // 1) Measure. null means "no usable reading on this fix" — NOT zero.
    let raw = null;
    let src = 'none';
    const doppler = typeof c.speed === 'number' && Number.isFinite(c.speed) && c.speed >= 0 && acc <= DOPPLER_MAX_ACC;
    if (doppler) { raw = c.speed; src = 'gps'; this.lastDopplerAt = ts; }
    else if (ts - this.lastDopplerAt > HOLD_MS) {
      raw = this._fallbackSpeed(pos, acc, ts);
      if (raw != null) src = 'position';
    }

    // 2) Glitches. Impossible values are dropped. A jump faster than a motorbike can
    //    accelerate or brake waits for the next fix: accepted if the next one continues
    //    the same way (real hard braking), dropped if it snaps back (a glitch).
    if (raw != null && raw > MAX_SPEED) raw = null;
    if (raw != null && this.lastRawAt && ts - this.lastRawAt < 5000) {
      const rdt = Math.max(0.5, (ts - this.lastRawAt) / 1000);
      if (Math.abs(raw - this.rawSpeed) / rdt > MAX_ACCEL) {
        const confirmed = this.spike != null && Math.abs(raw - this.spike) <= Math.abs(raw - this.rawSpeed);
        this.spike = confirmed ? null : raw;
        if (!confirmed) raw = null;
      } else this.spike = null;
    }

    if (raw != null) {
      this.rawSpeed = raw;
      this.lastRawAt = ts;
      this.source = src;

      // 3) Moving / stopped, with hysteresis.
      if (!this.moving) {
        this.onCount = raw >= MOVE_ON ? this.onCount + 1 : 0;
        if (this.onCount >= 2) { this.moving = true; this.offCount = 0; this.speed = raw; }
      } else if (raw < HARD_STOP) {
        this.moving = false;
      } else {
        this.offCount = raw < MOVE_OFF ? this.offCount + 1 : 0;
        if (this.offCount >= 2) this.moving = false;
      }
    } else if (ts - this.lastRawAt > LOST_MS) {
      this.source = 'none';
      this.moving = false;                          // no signal for a long time: don't freeze a speed
    }
    // else: keep showing the last speed for a moment (single empty readings are normal on iOS).

    // 4) Display value: time-based smoothing while moving, a clean 0 when stopped.
    const before = this.speed;
    if (!this.moving) this.speed = 0;
    else if (raw != null) {
      const a = 1 - Math.exp(-Math.max(dt, 0.2) / (TAU[src] || 1));
      this.speed += (raw - this.speed) * a;
    }

    // 5) Trip stats — only while genuinely moving.
    if (this.moving && this.prev && dt > 0) {
      if (dt <= 5) {
        // Integrate speed over time: immune to position zig-zag.
        this.distance += ((before + this.speed) / 2) * dt;
        this.movingTime += dt;
      } else if (dt < 60) {
        // Short signal gap: use the straight line, if it's plausible.
        const d = haversine(this.prev.pos, pos);
        if (d / dt < MAX_SPEED) { this.distance += d; this.movingTime += dt; }
      }
      this.lastMoveAt = Date.now();
    }
    // Top speed must hold for two fixes in a row, so a single spike can't set it.
    if (this.moving && acc <= 30) this.maxSpeed = Math.max(this.maxSpeed, Math.min(this.speed, this.prevSmoothed));
    this.prevSmoothed = this.speed;

    this.prev = { pos, ts };
    this._emit();
  }

  _emit() { this.dispatchEvent(new Event('update')); }
}
