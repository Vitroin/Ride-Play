import { DEFAULTS } from '../config.js';
import { readJSON, writeJSON } from './util.js';

const KEY = 'md.keys';

export function getKeys() {
  const s = readJSON(KEY, {});
  return {
    // Keys built in at deploy time (GitHub secrets) win, so rotating a key there just works.
    spotifyClientId: (DEFAULTS.SPOTIFY_CLIENT_ID || s.spotifyClientId || '').trim(),
    orsKey: (DEFAULTS.ORS_API_KEY || s.orsKey || '').trim(),
  };
}

export function setKeys({ spotifyClientId, orsKey }) {
  writeJSON(KEY, { spotifyClientId: spotifyClientId.trim(), orsKey: orsKey.trim() });
}
