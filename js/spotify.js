// Spotify Web API with Authorization Code + PKCE — no server, no client secret.
// Playback actually happens in the Spotify app; this is a remote control.
import { getKeys } from './keys.js';
import { readJSON, writeJSON } from './util.js';

const AUTH = 'https://accounts.spotify.com/authorize';
const TOKEN = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read';
const TOKENS = 'md.spotify';
const PKCE = 'md.pkce';

export class AuthError extends Error {
  constructor(msg = 'Please log in to Spotify again.') { super(msg); this.name = 'AuthError'; }
}

/** Must match the Redirect URI registered in the Spotify dashboard exactly. */
export const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');
const clientId = () => getKeys().spotifyClientId;
export const isConfigured = () => !!clientId();
export const isLoggedIn = () => !!readJSON(TOKENS, null)?.refresh_token;
export const logout = () => localStorage.removeItem(TOKENS);

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function randomString(n) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => chars[x % chars.length]).join('');
}

export async function login() {
  if (!isConfigured()) throw new Error('Add your Spotify Client ID in Setup & keys first.');
  const verifier = randomString(64);
  const state = randomString(16);
  writeJSON(PKCE, { verifier, state });
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const q = new URLSearchParams({
    client_id: clientId(), response_type: 'code', redirect_uri: redirectUri(),
    code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES, state,
  });
  // Same-window navigation so the tokens land in the home-screen app's storage.
  location.assign(`${AUTH}?${q}`);
}

/** Call on boot. Returns true if we just finished logging in. */
export async function handleRedirect() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return false;
  history.replaceState(null, '', redirectUri());
  if (q.has('error')) throw new Error(q.get('error') === 'access_denied' ? 'Spotify login was cancelled.' : `Spotify: ${q.get('error')}`);
  const saved = readJSON(PKCE, null);
  localStorage.removeItem(PKCE);
  if (!saved || saved.state !== q.get('state')) throw new Error('Login check failed. Please try again.');
  await tokenRequest({
    grant_type: 'authorization_code', code: q.get('code'), redirect_uri: redirectUri(),
    client_id: clientId(), code_verifier: saved.verifier,
  });
  return true;
}

async function tokenRequest(params) {
  const r = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (j.error === 'invalid_grant') { logout(); throw new AuthError(); }
    throw new Error(`Spotify login error: ${j.error_description || j.error || r.status}`);
  }
  const prev = readJSON(TOKENS, {});
  writeJSON(TOKENS, {
    access_token: j.access_token,
    refresh_token: j.refresh_token || prev.refresh_token,   // refresh tokens may rotate
    expires_at: Date.now() + (j.expires_in - 60) * 1000,
  });
}

let refreshing = null;
async function accessToken(force = false) {
  const t = readJSON(TOKENS, null);
  if (!t?.refresh_token) throw new AuthError();
  if (!force && Date.now() < t.expires_at) return t.access_token;
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: clientId() })
    .finally(() => { refreshing = null; });
  await refreshing;
  return readJSON(TOKENS, null).access_token;
}

async function api(path, { method = 'GET', body } = {}, retried = false) {
  const token = await accessToken(retried);
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401 && !retried) return api(path, { method, body }, true);
  if (r.status === 204 || r.status === 202) return null;
  const text = await r.text();
  const j = text ? (() => { try { return JSON.parse(text); } catch { return null; } })() : null;
  if (!r.ok) {
    const e = new Error(j?.error?.message || `Spotify error ${r.status}`);
    e.status = r.status;
    e.reason = j?.error?.reason;
    if (r.status === 403 && e.reason === 'PREMIUM_REQUIRED') e.message = 'Playback control needs Spotify Premium.';
    if (r.status === 403 && /scope/i.test(e.message)) {
      e.code = 'SCOPE';
      e.message = 'Reconnect Spotify to allow access to your Liked Songs.';
    }
    throw e;
  }
  return j;
}

export const getPlayer = () => api('/me/player');

/** If no device is active, wake the phone's Spotify app (or the first device). */
async function withDevice(fn) {
  try { return await fn(); } catch (e) {
    if (e.status !== 404 && e.reason !== 'NO_ACTIVE_DEVICE') throw e;
    const { devices = [] } = (await api('/me/player/devices')) || {};
    const d = devices.find((x) => x.type === 'Smartphone') || devices[0];
    if (!d) {
      const err = new Error('Open the Spotify app once so it shows up as a device.');
      err.code = 'NO_DEVICE';
      throw err;
    }
    await api('/me/player', { method: 'PUT', body: { device_ids: [d.id], play: false } });
    await new Promise((r) => setTimeout(r, 600));
    return fn();
  }
}

export const play = () => withDevice(() => api('/me/player/play', { method: 'PUT' }));
export const pause = () => api('/me/player/pause', { method: 'PUT' });
export const next = () => withDevice(() => api('/me/player/next', { method: 'POST' }));
export const previous = () => withDevice(() => api('/me/player/previous', { method: 'POST' }));

/** One page of the user's Liked Songs (max 50 per request). */
export const getLiked = (offset = 0, limit = 50) => api(`/me/tracks?limit=${limit}&offset=${offset}`);

/** Play a list of track URIs, starting with the first. */
export const playTracks = (uris) => withDevice(() => api('/me/player/play', { method: 'PUT', body: { uris } }));
