/* global L */
import { haversine, projectOnSegment } from './util.js';
import { route as fetchRoute } from './routing.js';

import { DEFAULTS } from '../config.js';

// Map tiles. CARTO's basemaps (the nicer dark/light styles) now need a free key; without one
// they're covered in an "API KEY REQUIRED" watermark. So:
//   • CARTO_KEY set (GitHub secret) → CARTO Dark Matter / Voyager.
//   • no key → OpenStreetMap's standard tiles, darkened with a CSS filter in dark mode.
const CARTO_KEY = (DEFAULTS.CARTO_KEY || '').trim();
const CARTO = {
  dark: `https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
  light: `https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`,
};
const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const ATTR = CARTO_KEY ? `${OSM_ATTR} &copy; <a href="https://carto.com/attributions">CARTO</a>` : OSM_ATTR;

/**
 * Map + turn-by-turn guidance.
 * cb: { onUpdate(state), onArrive(), onError(err), speak(text) }
 */
export class NavSession {
  constructor(el, cb) {
    this.cb = cb;
    this.active = false;
    this.follow = true;
    this.theme = 'dark';
    this.saver = false;
    // preferCanvas: one canvas for route/markers instead of SVG DOM — cheaper to redraw.
    this.map = L.map(el, { zoomControl: false, preferCanvas: true, fadeAnimation: false, zoomSnap: 1 })
      .setView([20, 10], 3);
    this.map.attributionControl.setPrefix(false);
    this.tiles = L.tileLayer(this._tileUrl(), { subdomains: 'abcd', maxZoom: 19, attribution: ATTR, keepBuffer: 1 }).addTo(this.map);
    this._applyTileFilter();
    this.map.on('dragstart', () => { this.follow = false; });
    this.user = L.circleMarker([0, 0], { radius: 9, color: '#FFFFFF', weight: 3, fillColor: '#00C8E6', fillOpacity: 1 });
    this.lastView = null;
  }

  _tileUrl() {
    if (!CARTO_KEY) return OSM;
    const url = CARTO[this.theme];
    return this.saver ? url.replace('{r}', '') : url; // saver: standard-res tiles, ¼ the data
  }

  /** OSM tiles only come in a light style: invert them for the dark theme (styles.css). */
  _applyTileFilter() {
    this.map.getContainer().classList.toggle('osm-dark', !CARTO_KEY && this.theme === 'dark');
  }

  setTheme(theme) { this.theme = theme; this.tiles.setUrl(this._tileUrl()); this._applyTileFilter(); }
  setSaver(on) { this.saver = on; this.tiles.setUrl(this._tileUrl()); }
  resize() { setTimeout(() => this.map.invalidateSize(), 60); }

  async start(dest, pos, accent) {
    this.stop();
    this.accent = accent;
    this.dest = dest;
    this.active = true;
    this.follow = true;
    this.route = null;
    this.offCount = 0;
    this.lastReroute = 0;
    this.announced = new Set();
    this.destMarker = L.circleMarker([dest.lat, dest.lng], { radius: 10, color: '#07070D', weight: 4, fillColor: '#FFFFFF', fillOpacity: 1 }).addTo(this.map);
    if (pos) await this._route(pos);
    else {
      this.map.setView([dest.lat, dest.lng], 15, { animate: false });
      this.cb.onUpdate({ state: 'waiting' });
    }
  }

  stop() {
    this.active = false;
    this.lastView = null;
    for (const l of [this.casing, this.line, this.destMarker]) l?.remove();
    this.user.remove();
    this.casing = this.line = this.destMarker = null;
    this.route = null;
  }

  recenter() {
    this.follow = true;
    if (this.lastPos) this.map.setView([this.lastPos.lat, this.lastPos.lng], this.active ? 17 : 15, { animate: false });
  }

  async _route(pos) {
    if (this.routing) return;
    this.routing = true;
    this.cb.onUpdate({ state: 'routing' });
    try {
      const r = await fetchRoute(pos, this.dest);
      if (!this.active) return;
      this._setRoute(r);
      this.update(pos, null);
    } catch (e) {
      this.cb.onError(e);
      this.cb.onUpdate({ state: 'error', message: e.message });
    } finally {
      this.routing = false;
    }
  }

  /** Also used by demo mode to inject a ready-made route. */
  _setRoute(r) {
    this.route = r;
    this.cum = [0];
    for (let i = 1; i < r.coords.length; i++) this.cum[i] = this.cum[i - 1] + haversine(r.coords[i - 1], r.coords[i]);
    this.total = this.cum[this.cum.length - 1] || 0;
    this.hint = 0;
    this.announced = new Set();
    const ll = r.coords.map((c) => [c.lat, c.lng]);
    this.casing?.remove(); this.line?.remove();
    this.casing = L.polyline(ll, { color: '#07070D', weight: 13, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.map);
    this.line = L.polyline(ll, { color: this.accent || '#FF5A1F', weight: 8, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(this.map);
  }

  _match(p) {
    const c = this.route.coords;
    if (c.length < 2) return { dist: haversine(p, c[0]), index: 0, along: 0 };
    let best = { dist: Infinity, index: 0, along: 0 };
    const scan = (from, to) => {
      for (let i = from; i < to; i++) {
        const pr = projectOnSegment(p, c[i], c[i + 1]);
        if (pr.dist < best.dist) best = { dist: pr.dist, index: i, along: this.cum[i] + pr.t * (this.cum[i + 1] - this.cum[i]) };
      }
    };
    // Search near where we were last time first (cheap), full scan only if lost.
    scan(Math.max(0, this.hint - 3), Math.min(c.length - 1, this.hint + 80));
    if (best.dist > 60) scan(0, c.length - 1);
    this.hint = best.index;
    return best;
  }

  update(pos, accuracy) {
    if (!pos) return;
    this.lastPos = pos;
    this.user.setLatLng([pos.lat, pos.lng]);
    if (!this.map.hasLayer(this.user)) this.user.addTo(this.map);

    // Only move the map when we've actually moved a few metres (fewer repaints).
    if (this.follow && (!this.lastView || haversine(this.lastView, pos) > 4)) {
      const z = this.active ? Math.max(this.map.getZoom(), 16) : Math.max(this.map.getZoom(), 14);
      this.map.setView([pos.lat, pos.lng], z, { animate: !this.saver && !!this.lastView });
      this.lastView = pos;
    }
    if (!this.active) return;

    if (!this.route) { if (!this.routing) this._route(pos); return; }

    const m = this._match(pos);
    const remaining = Math.max(0, this.total - m.along);
    if (haversine(pos, this.dest) < 30 || (remaining < 25 && m.dist < 40)) {
      this.active = false;
      this.cb.speak?.('You have arrived.');
      this.cb.onArrive();
      return;
    }

    // Off-route → reroute (3 bad fixes in a row, at most every 20 s).
    if (m.dist > 45 && (accuracy == null || accuracy < 30)) this.offCount++;
    else this.offCount = 0;
    if (this.offCount >= 3 && Date.now() - this.lastReroute > 20000) {
      this.offCount = 0;
      this.lastReroute = Date.now();
      this.cb.speak?.('Rerouting.');
      this._route(pos);
      return;
    }

    const steps = this.route.steps;
    let k = steps.findIndex((s) => m.index >= s.start && m.index < s.end);
    if (k < 0) k = Math.max(0, steps.length - 1);
    const upcoming = steps[Math.min(k + 1, steps.length - 1)] || { type: 10, instruction: 'Arrive' };
    const toTurn = steps.length ? Math.max(0, this.cum[steps[k].end] - m.along) : remaining;

    // Voice prompts at ~400 m and ~80 m before each manoeuvre (motorbike speeds).
    for (const th of [400, 80]) {
      const key = `${k}:${th}`;
      if (toTurn <= th && !this.announced.has(key)) {
        this.announced.add(key);
        if (th === 400 && toTurn < 150) continue;
        this.cb.speak?.(`In ${spokenDistance(toTurn)}, ${upcoming.instruction}`);
      }
    }

    this.cb.onUpdate({
      state: 'guiding',
      type: upcoming.type,
      instruction: upcoming.instruction,
      toTurn,
      remaining,
      remainingTime: this.total ? this.route.duration * (remaining / this.total) : 0,
    });
  }
}

function spokenDistance(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} kilometres`;
  return `${Math.max(50, Math.round(m / 50) * 50)} metres`;
}
