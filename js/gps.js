import { haversine } from './util.js';

/**
 * Wraps navigator.geolocation.watchPosition.
 * - speed: m/s, from the GPS chip (coords.speed) with a position-delta fallback.
 * - distance / movingTime / maxSpeed for the trip.
 * Battery: the watch is stopped whenever the app is hidden (iOS would
 * suspend it anyway, but stopping it explicitly means no stale wake-ups).
 */
export class GpsTracker extends EventTarget {
  constructor() {
    super();
    this.watchId = null;
    this.wanted = false;
    this.position = null;
    this.accuracy = null;
    this.heading = null;
    this.speed = 0;
    this.status = 'wait'; // wait | ok | weak | off | unsupported
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
    this.anchor = null;
    this.prev = null;
    this._emit();
  }

  start() { this.wanted = true; this._startWatch(); }
  stop() { this.wanted = false; this._stopWatch(); }

  _startWatch() {
    if (this.watchId != null) return;
    if (!('geolocation' in navigator)) { this.status = 'unsupported'; this._emit(); return; }
    this.watchId = navigator.geolocation.watchPosition(
      (p) => this._onPos(p),
      (e) => { this.status = e.code === 1 ? 'off' : 'wait'; this._emit(); },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 },
    );
  }

  _stopWatch() {
    if (this.watchId == null) return;
    navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    this.prev = null; // don't count the gap as riding time
  }

  _onPos(p) {
    const c = p.coords;
    const ts = p.timestamp || Date.now();
    const pos = { lat: c.latitude, lng: c.longitude };
    const good = c.accuracy <= 30;
    this.position = pos;
    this.accuracy = c.accuracy;
    this.status = good ? 'ok' : 'weak';
    if (typeof c.heading === 'number' && !Number.isNaN(c.heading)) this.heading = c.heading;

    let v = typeof c.speed === 'number' && c.speed >= 0 ? c.speed : null;
    if (this.prev) {
      const dt = (ts - this.prev.ts) / 1000;
      if (dt > 0 && dt < 30) {
        if (v == null) v = good ? haversine(this.prev.pos, pos) / dt : 0;
        if (v > 1.5) this.movingTime += Math.min(dt, 5);
      }
    }
    v = v ?? 0;
    if (v > 90) v = this.speed;            // > 324 km/h: GPS glitch, ignore
    if (v < 0.6) v = 0;                    // standing still / drift
    this.speed = v === 0 ? 0 : this.speed * 0.35 + v * 0.65;
    if (good && this.speed > this.maxSpeed) this.maxSpeed = this.speed;
    if (this.speed > 1.5) this.lastMoveAt = Date.now();

    // Trip distance: only from accurate fixes, and only once we've moved
    // further than the GPS noise, so a parked bike doesn't "ride".
    if (good) {
      if (!this.anchor) this.anchor = { pos, ts };
      else {
        const d = haversine(this.anchor.pos, pos);
        if (d >= Math.max(5, c.accuracy * 0.6)) {
          const dt = Math.max(1, (ts - this.anchor.ts) / 1000);
          if (d / dt < 90) this.distance += d;
          this.anchor = { pos, ts };
        }
      }
    }
    this.prev = { pos, ts };
    this._emit();
  }

  _emit() { this.dispatchEvent(new Event('update')); }
}
