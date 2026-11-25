import { getKeys } from './keys.js';
import { haversine } from './util.js';

// Two backends behind one interface, so the rest of the app never knows which ran:
//   • Free, no key: Valhalla (FOSSGIS public server) for routes, Photon (komoot) for search.
//     Valhalla has a real motorcycle profile. Fair use: about 1 request per second.
//   • OpenRouteService, only if you've added an ORS key. If ORS fails (bad key,
//     quota, outage) we fall back to the free backend instead of leaving you stuck.
const ORS = 'https://api.openrouteservice.org';
const ORS_PROFILE = 'driving-car'; // ORS has no motorcycle profile
const VALHALLA = 'https://valhalla1.openstreetmap.de';
const PHOTON = 'https://photon.komoot.io';

const orsKey = () => getKeys().orsKey;

async function withFallback(primary, fallback) {
  if (!orsKey()) return fallback();
  try {
    return await primary();
  } catch (e) {
    console.warn('OpenRouteService failed, using the free backend:', e.message);
    return fallback();
  }
}

export const geocode = (text, near) => withFallback(() => orsGeocode(text, near), () => photonGeocode(text, near));
export const route = (from, to) => withFallback(() => orsRoute(from, to), () => valhallaRoute(from, to));

// ---------------------------------------------------------------- free: Photon + Valhalla

async function photonGeocode(text, near) {
  const p = new URLSearchParams({ q: text, limit: '10', lang: 'en' });
  if (near) { p.set('lat', near.lat); p.set('lon', near.lng); }
  const r = await fetch(`${PHOTON}/api/?${p}`);
  if (!r.ok) throw new Error(`Search failed (${r.status})`);
  const j = await r.json();
  const results = (j.features || []).map((f) => {
    const pr = f.properties || {};
    const street = [pr.street, pr.housenumber].filter(Boolean).join(' ');
    const name = pr.name || street || pr.city || 'Unnamed place';
    const label = [...new Set([street, pr.district, pr.city, pr.state, pr.country])]
      .filter((s) => s && s !== name)
      .join(', ');
    return { name, label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
  });
  // OSM often maps one place several times (campus outline, gate, building): keep the first.
  return results.filter((r, i) => !results.slice(0, i).some((q) => q.name === r.name && haversine(q, r) < 1000));
}

async function valhallaRoute(from, to) {
  const r = await fetch(`${VALHALLA}/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      locations: [{ lat: from.lat, lon: from.lng }, { lat: to.lat, lon: to.lng }],
      costing: 'motorcycle',
      directions_options: { units: 'kilometers', language: 'en-US' },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.trip) {
    const msg = j.error || (r.status === 429 ? 'too many requests, wait a few seconds' : '');
    throw new Error(`Couldn't get a route${msg ? `: ${msg}` : ` (${r.status})`}`);
  }
  const leg = j.trip.legs[0];
  return {
    coords: decodePolyline6(leg.shape),
    steps: leg.maneuvers.map((m) => ({
      distance: m.length * 1000,
      duration: m.time,
      type: VALHALLA_TO_ORS[m.type] ?? 6,
      instruction: (m.instruction || '').replace(/\.$/, ''),
      name: (m.street_names || []).join(', '),
      start: m.begin_shape_index,
      end: m.end_shape_index,
    })),
    distance: (j.trip.summary?.length || 0) * 1000,
    duration: j.trip.summary?.time || 0,
  };
}

// Valhalla manoeuvre type → ORS step type, which is what icons.js/turnIcon understands.
const VALHALLA_TO_ORS = {
  1: 11, 2: 11, 3: 11,          // start
  4: 10, 5: 10, 6: 10,          // destination
  7: 6, 8: 6, 17: 6, 22: 6, 25: 6, // becomes / continue / ramp straight / stay straight / merge
  9: 5, 10: 1, 11: 3,           // slight right, right, sharp right
  12: 9, 13: 9,                 // u-turn
  14: 2, 15: 0, 16: 4,          // sharp left, left, slight left
  18: 5, 19: 4,                 // ramp right / left
  20: 13, 21: 12, 23: 13, 24: 12, // exit / stay right & left → keep right & left
  26: 7, 27: 8,                 // roundabout enter / exit
  37: 5, 38: 4,                 // merge right / left
};

/** Valhalla shapes are Google-style polylines with 6 decimal places. */
function decodePolyline6(str) {
  const out = [];
  let i = 0, lat = 0, lng = 0;
  const next = () => {
    let shift = 0, result = 0, b;
    do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < str.length) {
    lat += next(); lng += next();
    out.push({ lat: lat / 1e6, lng: lng / 1e6 });
  }
  return out;
}

// ---------------------------------------------------------------- OpenRouteService (optional key)

async function orsGeocode(text, near) {
  const p = new URLSearchParams({ api_key: orsKey(), text, size: '10' });
  if (near) { p.set('focus.point.lat', near.lat); p.set('focus.point.lon', near.lng); }
  const r = await fetch(`${ORS}/geocode/search?${p}`);
  if (!r.ok) throw new Error(`Search failed (${r.status})`);
  const j = await r.json();
  return (j.features || []).map((f) => ({
    name: f.properties.name || f.properties.label,
    label: f.properties.label || '',
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
  }));
}

async function orsRoute(from, to) {
  const r = await fetch(`${ORS}/v2/directions/${ORS_PROFILE}/geojson`, {
    method: 'POST',
    headers: { Authorization: orsKey(), 'Content-Type': 'application/json', Accept: 'application/geo+json' },
    body: JSON.stringify({
      coordinates: [[from.lng, from.lat], [to.lng, to.lat]],
      instructions: true,
      units: 'm',
      language: 'en',
    }),
  });
  if (!r.ok) {
    let msg = '';
    try { msg = (await r.json()).error?.message || ''; } catch { /* ignore */ }
    throw new Error(`Couldn't get a route${msg ? `: ${msg}` : ` (${r.status})`}`);
  }
  const f = (await r.json()).features[0];
  const seg = f.properties.segments?.[0] || { steps: [] };
  return {
    coords: f.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
    steps: seg.steps.map((s) => ({
      distance: s.distance, duration: s.duration, type: s.type,
      instruction: s.instruction, name: s.name, start: s.way_points[0], end: s.way_points[1],
    })),
    distance: f.properties.summary?.distance || 0,
    duration: f.properties.summary?.duration || 0,
  };
}
