import { DEFAULTS } from '../config.js';
import { readJSON, writeJSON } from './util.js';

const KEY = 'md.keys';

export function getKeys() {
  const s = readJSON(KEY, {});
  return {
    spotifyClientId: (s.spotifyClientId || DEFAULTS.SPOTIFY_CLIENT_ID || '').trim(),
    orsKey: (s.orsKey || DEFAULTS.ORS_API_KEY || '').trim(),
  };
}

export function setKeys({ spotifyClientId, orsKey }) {
  writeJSON(KEY, { spotifyClientId: spotifyClientId.trim(), orsKey: orsKey.trim() });
}
