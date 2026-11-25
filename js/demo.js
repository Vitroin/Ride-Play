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
      this.rawSpeed = this.speed; this.source = 'gps'; this.moving = true;
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

/** A generated cover in two colours, so demo mode shows the Song colours feature. */
const COVERS = [['#FF5A1F', '#7A1FA2'], ['#18C8A8', '#0B3D91'], ['#FFD23F', '#E0115F'], ['#4D9DE0', '#1B998B'], ['#F5F5F5', '#C33C54']];
function demoCover(i) {
  const [a, b] = COVERS[i % COVERS.length];
  const c = document.createElement('canvas'); c.width = c.height = 300;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 300, 300); g.addColorStop(0, a); g.addColorStop(1, b);
  x.fillStyle = g; x.fillRect(0, 0, 300, 300);
  x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.arc(150, 150, 58, 0, Math.PI * 2); x.fill();
  x.fillStyle = b; x.beginPath(); x.arc(150, 150, 14, 0, Math.PI * 2); x.fill();
  return [{ url: c.toDataURL('image/png'), width: 300, height: 300 }];
}

/** Fake Spotify with the same surface as js/spotify.js. */
export function demoSpotify() {
  let cover = 0;
  const state = {
    is_playing: true, progress_ms: 42000, shuffle_state: false, repeat_state: 'off', context: null,
    item: { uri: 'demo:x', name: 'Demo track', duration_ms: 214000, artists: [{ name: 'Moto Dash' }], album: { name: 'Demo album', images: demoCover(0) } },
  };
  let t0 = Date.now();
  const snapshot = () => {
    if (state.is_playing) { state.progress_ms = Math.min(state.item.duration_ms, state.progress_ms + (Date.now() - t0)); }
    t0 = Date.now();
    return { ...state };
  };
  return {
    isConfigured: () => true, isLoggedIn: () => true, logout() {}, login() {},
    handleRedirect: async () => false, redirectUri: () => location.origin + location.pathname,
    getPlayer: async () => snapshot(),
    play: async () => { snapshot(); state.is_playing = true; }, pause: async () => { snapshot(); state.is_playing = false; },
    next: async () => { cover += 1; state.item = { ...state.item, uri: `demo:n${Date.now()}`, name: `Demo track ${Math.ceil(Math.random() * 9)}`, album: { name: 'Demo album', images: demoCover(cover) } }; state.progress_ms = 0; t0 = Date.now(); },
    previous: async () => {},
    getLiked: async (offset = 0) => {
      const total = 64;
      const items = Array.from({ length: Math.max(0, Math.min(50, total - offset)) }, (_, i) => ({
        track: { uri: `demo:${offset + i}`, name: `Demo song ${offset + i + 1}`, duration_ms: 150000 + ((offset + i) * 7919) % 120000,
          artists: [{ name: ['Moto Dash', 'Night Riders', 'Open Road'][(offset + i) % 3] }], album: { images: [] } },
      }));
      return { items, total, next: offset + 50 < total ? 'more' : null };
    },
    playTracks: async (uris) => { state.is_playing = true; state.progress_ms = 0; t0 = Date.now(); state.context = null; state.item = { ...state.item, uri: uris[0], name: `Demo song ${Number(uris[0].split(':')[1]) + 1}` }; },
    getPlaylists: async () => ({
      items: ['Road Trip', 'Night Ride', 'Focus', 'Throwbacks', 'Chill', 'Workout', 'Arabic Hits', 'Discover'].map((name, i) => ({ uri: `demo:pl${i}`, name, owner: { display_name: 'You' }, tracks: { total: 20 + i * 7 }, images: [] })),
      total: 8, next: null,
    }),
    playContext: async (uri) => { state.is_playing = true; state.progress_ms = 0; t0 = Date.now(); state.context = { uri }; state.item = { ...state.item, uri: `demo:c${Date.now()}`, name: 'Playlist song 1' }; },
    setShuffle: async (on) => { state.shuffle_state = on; },
    setRepeat: async (s) => { state.repeat_state = s; },
    seek: async (ms) => { state.progress_ms = ms; t0 = Date.now(); },
    AuthError: class extends Error {},
  };
}
