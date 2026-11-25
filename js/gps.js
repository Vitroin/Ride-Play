import { haversine } from './util.js';

// Thresholds (m/s). Hysteresis: it takes a clear signal to start "moving"
// and a clear signal to stop, so GPS noise can't flicker the speed.
const MOVE_ON = 1.4;        // ≈ 5 km/h, must be seen on 2 fixes in a row
const MOVE_OFF = 0.8;       // ≈ 3 km/h, 2 fixes below this → stopped
const HARD_STOP = 0.3;      // ≈ 1 km/h, one fix below this → stopped
const MAX_ACCEL = 12;       // m/s² — faster changes are glitches, not a motorbike
const MAX_SPEED = 90;       // m/s ≈ 324 km/h
const FALLBACK_MAX_ACC = 20; // only estimate speed from positions when they're this precise (m)

/**
 * Wraps navigator.geolocation.watchPosition.
 *
 * Speed comes from the GPS chip's Doppler measurement (coords.speed). That's
 * measured from the satellite signal itself, so position jumps and a shaking
 * phone don't affect it. Only when the phone gives no Doppler speed do we
 * estimate from positions, and then only over several seconds and only if
 * the distance moved is bigger than both fixes' error circles combined.
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

  /** Speed estimate from positions, used only when the phone gives no Doppler speed. */
  _fallbackSpeed(pos, acc, ts) {
    if (acc > FALLBACK_MAX_ACC) return 0;          // Wi-Fi/cell location: too jumpy to trust
    this.history.push({ pos, acc, ts });
    while (this.history.length && ts - this.history[0].ts > 10000) this.history.shift();
    // Compare with the oldest precise fix from 3–10 s ago.
    const old = this.history.find((h) => ts - h.ts >= 3000);
    if (!old) return 0;
    const d = haversine(old.pos, pos);
    const noise = Math.max(8, old.acc + acc);      // both error circles combined
    if (d <= noise) return 0;                      // could be pure jitter → not moving
    return d / ((ts - old.ts) / 1000);
  }

  _onPos(p) {
    const c = p.coords;
    const ts = p.timestamp || Date.now();
    const pos = { lat: c.latitude, lng: c.longitude };
    const acc = c.accuracy ?? 999;
    this.position = pos;
    this.accuracy = acc;
    this.status = acc <= 30 ? 'ok' : 'weak';
    if (typeof c.heading === 'number' && !Number.isNaN(c.heading)) this.heading = c.heading;

    const dt = this.prev ? (ts - this.prev.ts) / 1000 : 0;

    // 1) Measure.
    const doppler = typeof c.speed === 'number' && !Number.isNaN(c.speed) && c.speed >= 0;
    let raw;
    if (doppler) { raw = c.speed; this.source = 'gps'; }
    else { raw = this._fallbackSpeed(pos, acc, ts); this.source = raw > 0 ? 'position' : 'none'; }

    // 2) Reject glitches: impossible speed or impossible acceleration.
    if (raw > MAX_SPEED) raw = this.rawSpeed;
    if (dt > 0 && dt < 5 && Math.abs(raw - this.rawSpeed) / dt > MAX_ACCEL) raw = this.rawSpeed;
    this.rawSpeed = raw;

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

    // 4) Display value: smoothed while moving, a clean 0 when stopped.
    const before = this.speed;
    this.speed = this.moving ? this.speed * 0.3 + raw * 0.7 : 0;

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
