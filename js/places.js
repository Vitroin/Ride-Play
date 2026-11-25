import { readJSON, writeJSON } from './util.js';
import { DEMO } from './demo.js';

// Demo mode keeps its own list so it never touches your real places.
const KEY = DEMO ? 'md.places.demo' : 'md.places';
const uid = () => Math.random().toString(36).slice(2, 10);

export const getPlaces = () => readJSON(KEY, []);

export function savePlace({ name, label, lat, lng }) {
  const list = getPlaces().filter((p) => Math.abs(p.lat - lat) > 1e-5 || Math.abs(p.lng - lng) > 1e-5);
  list.push({ id: uid(), name, label: label || '', lat, lng });
  writeJSON(KEY, list);
  return list;
}

export function removePlace(id) {
  writeJSON(KEY, getPlaces().filter((p) => p.id !== id));
}

export function seedPlaces(list) {
  if (!getPlaces().length) writeJSON(KEY, list.map((p) => ({ id: uid(), ...p })));
}
