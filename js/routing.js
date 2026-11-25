import { getKeys } from './keys.js';

const ORS = 'https://api.openrouteservice.org';
// ORS has no motorcycle profile; the car profile follows the same roads
// motorbikes use (no bike lanes, no footpaths).
const PROFILE = 'driving-car';

function key() {
  const k = getKeys().orsKey;
  if (!k) throw new Error('Add your OpenRouteService key in Setup & keys first.');
  return k;
}

export async function geocode(text, near) {
  const p = new URLSearchParams({ api_key: key(), text, size: '10' });
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

export async function route(from, to) {
  const r = await fetch(`${ORS}/v2/directions/${PROFILE}/geojson`, {
    method: 'POST',
    headers: { Authorization: key(), 'Content-Type': 'application/json', Accept: 'application/geo+json' },
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
