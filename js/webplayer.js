// "Play music in RidePlay": Spotify's Web Playback SDK turns this page into a Spotify Connect
// device, so the sound comes from RidePlay instead of the Spotify app. Nothing has to stay awake
// in the background, so long pauses can't break play/pause. The catch: the page has to stay
// open (on screen) for the music to keep playing.
//
// Docs: https://developer.spotify.com/documentation/web-playback-sdk

const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

let sdk = null;          // Promise for the SDK script
let player = null;       // Spotify.Player
let deviceId = null;     // set once the player is 'ready'
let waiting = null;      // { resolve, reject, timer } for the current start()
let starting = null;     // Promise for the current start()
let handlers = {};

const MESSAGES = {
  initialization_error: "This phone's browser can't play Spotify inside RidePlay.",
  authentication_error: 'RidePlay needs Spotify’s playback permission. Reconnect Spotify.',
  account_error: 'Playing inside RidePlay needs Spotify Premium.',
  playback_error: 'Spotify couldn’t play that track.',
};

function loadSdk() {
  sdk ??= new Promise((resolve, reject) => {
    if (window.Spotify?.Player) { resolve(); return; }
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onerror = () => { sdk = null; reject(new Error('Couldn’t load Spotify’s player. Check your connection.')); };
    document.head.append(s);
  });
  return sdk;
}

function settle(err, id) {
  if (!waiting) return;
  clearTimeout(waiting.timer);
  if (err) waiting.reject(err); else waiting.resolve(id);
  waiting = null;
}

function createPlayer(getToken) {
  player = new window.Spotify.Player({
    name: 'RidePlay',
    getOAuthToken: (cb) => { getToken().then(cb, () => cb('')); },
    volume: 1,
  });
  player.addListener('ready', ({ device_id: id }) => { deviceId = id; settle(null, id); });
  player.addListener('not_ready', () => { deviceId = null; });
  for (const code of Object.keys(MESSAGES)) {
    player.addListener(code, ({ message }) => {
      const e = new Error(MESSAGES[code]);
      e.code = code;
      e.detail = message;
      if (waiting && code !== 'playback_error') settle(e);
      else handlers.onError?.(e);
    });
  }
  player.addListener('player_state_changed', (state) => handlers.onState?.(state));
}

/**
 * Connect RidePlay as a Spotify device. Resolves with its device id.
 * opts: { onError(err) for problems after start, onState(state) on every playback change }
 */
export function start(getToken, opts = {}) {
  handlers = opts;
  if (player && deviceId) return Promise.resolve(deviceId);
  starting ??= (async () => {
    await loadSdk();
    if (!player) createPlayer(getToken);
    const ready = new Promise((resolve, reject) => {
      waiting = {
        resolve, reject,
        timer: setTimeout(() => settle(new Error('Spotify’s player didn’t start on this phone.')), 15000),
      };
    });
    const ok = await player.connect();
    if (!ok) settle(new Error('Spotify’s player couldn’t connect.'));
    return ready;
  })().finally(() => { starting = null; });
  return starting;
}

/**
 * iPhone only lets a page start sound from a tap. Call this synchronously inside a tap on a
 * play control, before any network request, so the following playback is allowed.
 */
export function activate() {
  try { player?.activateElement?.(); } catch { /* older SDK: nothing to do */ }
}

export function stop() {
  try { player?.disconnect(); } catch { /* already gone */ }
  player = null;
  deviceId = null;
  settle(new Error('stopped'));
}

export const device = () => deviceId;
export const isStarted = () => !!player;
