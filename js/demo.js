// ?demo in the URL: try the whole app without GPS, Spotify or API keys.
import { haversine } from './util.js';

export const DEMO = new URLSearchParams(location.search).has('demo');

const PATH = [
  [30.0444, 31.2357], [30.0462, 31.2338], [30.0490, 31.2312], [30.0522, 31.2281],
  [30.0551, 31.2252], [30.0583, 31.2236], [30.0617, 31.2224], [30.0652, 31.2214], [30.0684, 31.2189],
].map(([lat, lng]) => ({ lat, lng }));

export const DEMO_PLACES = [
  { name: 'Home', label: 'Demo place', lat: PATH[8].lat, lng: PATH[8].lng },
  { name: 'University', label: 'Demo place', lat: 30.0276, lng: 31.2101 },
  { name: 'Fuel station', label: 'Demo place', lat: 30.0510, lng: 31.2400 },
];

export function demoRoute() {
  let d = 0;
  for (let i = 1; i < PATH.length; i++) d += haversine(PATH[i - 1], PATH[i]);
  return {
    coords: PATH,
    steps: [
      { type: 11, instruction: 'Head north', start: 0, end: 2 },
      { type: 5, instruction: 'Slight right onto the main road', start: 2, end: 4 },
      { type: 1, instruction: 'Turn right', start: 4, end: 6 },
      { type: 12, instruction: 'Keep left', start: 6, end: 8 },
      { type: 10, instruction: 'Arrive at your destination', start: 8, end: 8 },
    ],
    distance: d,
    duration: d / 12,
  };
}

/** Fake GPS that "rides" along the demo path at 30–110 km/h. */
export class DemoGps extends EventTarget {
  constructor() {
    super();
    this.status = 'ok'; this.accuracy = 5; this.heading = 0; this.speed = 0;
    this.position = PATH[0]; this.s = 0; this.t = 0; this.lastMoveAt = Date.now();
    this.cum = [0];
    for (let i = 1; i < PATH.length; i++) this.cum[i] = this.cum[i - 1] + haversine(PATH[i - 1], PATH[i]);
    this.resetTrip();
  }
  resetTrip() { this.distance = 0; this.movingTime = 0; this.maxSpeed = 0; this._emit(); }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.t += 1;
      this.speed = (70 + 40 * Math.sin(this.t / 9)) / 3.6;
      this.s = (this.s + this.speed) % this.cum[this.cum.length - 1];
      let i = this.cum.findIndex((c) => c > this.s) - 1;
      if (i < 0) i = 0;
      const f = (this.s - this.cum[i]) / (this.cum[i + 1] - this.cum[i]);
      this.position = { lat: PATH[i].lat + f * (PATH[i + 1].lat - PATH[i].lat), lng: PATH[i].lng + f * (PATH[i + 1].lng - PATH[i].lng) };
      this.distance += this.speed; this.movingTime += 1; this.maxSpeed = Math.max(this.maxSpeed, this.speed);
      this.lastMoveAt = Date.now();
      this._emit();
    }, 1000);
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  _emit() { this.dispatchEvent(new Event('update')); }
}

/** Fake Spotify with the same surface as js/spotify.js. */
export function demoSpotify() {
  const state = { is_playing: true, item: { name: 'Demo track', artists: [{ name: 'Moto Dash' }], album: { images: [] } } };
  return {
    isConfigured: () => true, isLoggedIn: () => true, logout() {}, login() {},
    handleRedirect: async () => false, redirectUri: () => location.origin + location.pathname,
    getPlayer: async () => state,
    play: async () => { state.is_playing = true; }, pause: async () => { state.is_playing = false; },
    next: async () => { state.item = { ...state.item, name: `Demo track ${Math.ceil(Math.random() * 9)}` }; },
    previous: async () => {},
    AuthError: class extends Error {},
  };
}
