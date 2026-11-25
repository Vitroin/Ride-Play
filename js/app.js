import * as realSpotify from './spotify.js';
import { GpsTracker } from './gps.js';
import { NavSession } from './nav.js';
import * as places from './places.js';
import { geocode } from './routing.js';
import { getKeys, setKeys } from './keys.js';
import { DEFAULTS } from '../config.js';
import { setAwake } from './wakelock.js';
import { hydrateIcons, setIcon, placeIcon, PLACE_COLORS, turnIcon } from './icons.js';
import { DEMO, DemoGps, demoSpotify, demoRoute, DEMO_PLACES } from './demo.js';
import { artPalette } from './artcolor.js';
import { $, $$, h, haversine, fmtDuration, fmtClock, toast, readJSON, writeJSON } from './util.js';

const spotify = DEMO ? demoSpotify() : realSpotify;
const AuthError = realSpotify.AuthError;

// ================================================================ settings
const settings = {
  imperial: false, voice: true, theme: 'auto', saver: false, diag: false,
  glass: false, artTint: true, autoDim: true, dimAfter: '60', mapPanel: 'open',
  ...readJSON('md.settings', {}),
};
const saveSettings = () => writeJSON('md.settings', settings);

const gps = DEMO ? new DemoGps() : new GpsTracker();
let nav = null;
let navigating = false;
let current = null;

/** Re-trigger a one-shot CSS animation class. */
function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

// ================================================================ screens
const SCREENS = ['login', 'dash', 'maps', 'music', 'settings'];
const DEPTH = { login: 0, dash: 1, maps: 2, music: 2, settings: 2 };

function show(name) {
  const prev = current;
  for (const s of SCREENS) $(`#screen-${s}`).hidden = s !== name;
  document.body.classList.toggle('no-dock', name === 'login');
  $$('.dock [data-go]').forEach((b) => { if (b.dataset.go === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });

  const el = $(`#screen-${name}`);
  el.classList.remove('enter-fwd', 'enter-back', 'enter-fade');
  if (!prev) replay(el, 'enter-fade');
  else if (prev !== name) replay(el, DEPTH[name] > DEPTH[prev] ? 'enter-fwd' : DEPTH[name] < DEPTH[prev] ? 'enter-back' : 'enter-fade');
  current = name;

  if (name === 'login') renderLogin();
  if (name === 'dash') renderDestWidget(prev !== 'dash');
  if (name === 'maps') openMaps();
  if (name === 'music') musicUI.open();
  if (name === 'settings') renderSettings();
  updateAwake();
  dimmer.poke();
  music.kick();
  progress.sync();
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) show(go.dataset.go);
});

// ================================================================ dock: rearrange the app icons
// Long-press an icon (like the iPhone Home Screen): the icons jiggle and follow your finger.
// Tap Done, or anywhere outside the dock, to finish. The order is saved on this phone.
const dockApps = $('.dock-apps');
function applyDockOrder() {
  const order = settings.dockOrder || [];
  const rank = (b) => { const i = order.indexOf(b.dataset.go); return i < 0 ? 99 : i; };
  $$('.app-icon', dockApps).sort((a, b) => rank(a) - rank(b)).forEach((b) => dockApps.append(b));
}
const saveDockOrder = () => { settings.dockOrder = $$('.app-icon', dockApps).map((b) => b.dataset.go); saveSettings(); };
const dockEdit = {
  on: false, press: null, drag: null, swallowClick: false,
  start() {
    if (this.on) return;
    this.on = true;
    document.body.classList.add('dock-edit');
    toast('Drag the icons to rearrange them', 1800);
  },
  stop() {
    if (!this.on) return;
    this.on = false;
    document.body.classList.remove('dock-edit');
    saveDockOrder();
  },
  vertical: () => getComputedStyle(dockApps).flexDirection.startsWith('column'),
  offset: (el, v) => (v ? el.offsetTop : el.offsetLeft),

  beginDrag(icon, e) {
    const v = this.vertical();
    this.drag = { icon, id: e.pointerId, v, start: v ? e.clientY : e.clientX, home: this.offset(icon, v) };
    icon.classList.add('dragging');
    icon.style.transition = 'none';
    try { icon.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  },
  moveDrag(e) {
    const d = this.drag;
    const want = d.home + ((d.v ? e.clientY : e.clientX) - d.start);   // where the icon should be (layout px)
    const icons = $$('.app-icon', dockApps);
    const others = icons.filter((b) => b !== d.icon);
    const size = d.v ? d.icon.offsetHeight : d.icon.offsetWidth;
    // New slot = how many other icons have their centre before the dragged icon's centre.
    const slot = others.filter((b) => this.offset(b, d.v) < want).length;
    if (icons.indexOf(d.icon) !== slot) {
      const before = new Map(others.map((b) => [b, this.offset(b, d.v)]));
      dockApps.insertBefore(d.icon, others[slot] || null);
      for (const b of others) {                       // FLIP: neighbours slide into their new place
        const delta = before.get(b) - this.offset(b, d.v);
        if (!delta) continue;
        b.style.transition = 'none';
        b.style.transform = d.v ? `translateY(${delta}px)` : `translateX(${delta}px)`;
        void b.offsetWidth;
        b.style.transition = 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)';
        b.style.transform = '';
      }
    }
    void size;
    const shift = want - this.offset(d.icon, d.v);
    d.icon.style.transform = d.v ? `translateY(${shift}px)` : `translateX(${shift}px)`;
  },
  endDrag() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    d.icon.classList.remove('dragging');
    d.icon.style.transition = 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';
    d.icon.style.transform = '';
    saveDockOrder();
  },
};
dockApps.addEventListener('pointerdown', (e) => {
  const icon = e.target.closest('.app-icon');
  if (!icon) return;
  if (dockEdit.on) { dockEdit.swallowClick = true; dockEdit.beginDrag(icon, e); return; }
  const sx = e.clientX, sy = e.clientY;
  dockEdit.press = {
    sx, sy,
    timer: setTimeout(() => {
      dockEdit.press = null;
      dockEdit.swallowClick = true;
      dockEdit.start();
      dockEdit.beginDrag(icon, e);
    }, 450),
  };
});
window.addEventListener('pointermove', (e) => {
  const pr = dockEdit.press;
  if (pr && Math.hypot(e.clientX - pr.sx, e.clientY - pr.sy) > 10) { clearTimeout(pr.timer); dockEdit.press = null; }
  if (dockEdit.drag && e.pointerId === dockEdit.drag.id) dockEdit.moveDrag(e);
}, { passive: true });
const endPress = (e) => {
  if (dockEdit.press) { clearTimeout(dockEdit.press.timer); dockEdit.press = null; }
  if (dockEdit.drag && e.pointerId === dockEdit.drag.id) dockEdit.endDrag();
};
window.addEventListener('pointerup', endPress);
window.addEventListener('pointercancel', endPress);
// While rearranging (and for the tap that started it), icon taps don't open screens.
dockApps.addEventListener('click', (e) => {
  if (dockEdit.on || dockEdit.swallowClick) { e.stopPropagation(); e.preventDefault(); }
  dockEdit.swallowClick = false;
}, true);
$('#dock-done').addEventListener('click', () => dockEdit.stop());
document.addEventListener('pointerdown', (e) => { if (dockEdit.on && !e.target.closest('.dock')) dockEdit.stop(); }, true);

// ================================================================ theme / saver
const mqLight = matchMedia('(prefers-color-scheme: light)');
const resolvedTheme = () => (settings.theme === 'auto' ? (mqLight.matches ? 'light' : 'dark') : settings.theme);
function applyTheme(animate = false) {
  if (animate) document.documentElement.classList.add('theming');
  document.documentElement.dataset.theme = settings.theme;
  $('meta[name="theme-color"]').setAttribute('content', resolvedTheme() === 'light' ? '#F2F2F7' : '#000000');
  nav?.setTheme(resolvedTheme());
  if (animate) setTimeout(() => document.documentElement.classList.remove('theming'), 400);
}
mqLight.addEventListener('change', () => applyTheme(true));

function applySaver() {
  document.body.classList.toggle('saver', settings.saver);
  nav?.setSaver(settings.saver);
  applyGlass();
}
// Liquid Glass: translucent, blurred surfaces. Off in battery saver (blur costs GPU time).
function applyGlass() { document.body.classList.toggle('glass', settings.glass && !settings.saver); }

/**
 * Screen-on policy.
 * Auto-dim on: the screen never switches off while the app is open; it dims instead.
 * Auto-dim off: on while riding/navigating; off in Settings or after 5 min parked.
 */
function updateAwake() {
  if (settings.autoDim) { setAwake(current && current !== 'login'); return; }
  const parked = Date.now() - gps.lastMoveAt > 5 * 60 * 1000;
  setAwake(navigating || ((current === 'dash' || current === 'maps' || current === 'music') && !parked));
}
setInterval(updateAwake, 30000);

// ================================================================ auto-dim
// A black layer fades in over everything after a quiet spell. On iPhone's OLED screen,
// darker pixels use less power, and the screen never locks. The first touch only wakes it
// (the layer catches that tap so it can't press a button by accident).
const dimmer = {
  el: null, timer: null, dimmed: false,
  enabled() { return settings.autoDim && !!current && current !== 'login'; },
  arm() {
    clearTimeout(this.timer);
    if (this.enabled()) this.timer = setTimeout(() => this.dim(), Number(settings.dimAfter || 60) * 1000);
  },
  poke() { if (this.dimmed) this.wake(); this.arm(); },
  dim() {
    if (!this.enabled() || document.visibilityState !== 'visible') return;
    this.dimmed = true;
    document.body.classList.add('dimmed');
  },
  wake() {
    this.dimmed = false;
    document.body.classList.remove('dimmed');
    // Keep swallowing taps for a moment so the waking touch doesn't reach the button below.
    this.el.classList.add('catch');
    setTimeout(() => this.el.classList.remove('catch'), 400);
  },
};
dimmer.el = $('#dimmer');
document.addEventListener('pointerdown', () => dimmer.poke(), { capture: true, passive: true });
document.addEventListener('keydown', () => dimmer.poke(), { capture: true });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') dimmer.poke(); });

// ================================================================ units
const toUnit = (ms) => ms * (settings.imperial ? 2.236936 : 3.6);
const speedText = (ms) => String(Math.round(toUnit(ms)));
function distParts(m) {
  const v = settings.imperial ? m / 1609.344 : m / 1000;
  return { v: v.toFixed(v < 100 ? 1 : 0), u: settings.imperial ? 'mi' : 'km' };
}
function shortDist(m) {
  if (settings.imperial) {
    const ft = m * 3.28084;
    return ft < 1000 ? `${Math.max(50, Math.round(ft / 50) * 50)} ft` : `${(m / 1609.344).toFixed(1)} mi`;
  }
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  const step = m < 200 ? 10 : 50;
  return `${Math.max(10, Math.round(m / step) * step)} m`;
}
function applyUnits() {
  $$('.speed-unit').forEach((el) => { el.textContent = settings.imperial ? 'mph' : 'km/h'; });
  shownSpeed = Math.round(toUnit(gps.speed));
  renderGps();
}

// ================================================================ GPS / dashboard
const speedBand = (ms) => {
  const kmh = ms * 3.6;
  return kmh < 50 ? 'var(--lime)' : kmh < 90 ? 'var(--cyan)' : kmh < 130 ? 'var(--orange)' : 'var(--magenta)';
};
let lastDestRender = 0;
// The shown number only changes once the smoothed speed has moved ¾ of a unit away from it,
// so a steady 80 doesn't flicker 79-80-81 from tiny GPS noise.
let shownSpeed = 0;
function displaySpeed(ms) {
  const v = toUnit(ms);
  if (ms === 0 || Math.abs(v - shownSpeed) >= 0.75) shownSpeed = Math.round(v);
  return String(shownSpeed);
}
function renderGps() {
  const s = displaySpeed(gps.speed);
  $('#speed').textContent = s;
  $('#nav-speed').textContent = s;
  $('#speed').classList.toggle('three', s.length >= 3);
  $('#nav-speed').classList.toggle('three', s.length >= 3);
  document.documentElement.style.setProperty('--band', speedBand(gps.speed));
  const frac = Math.min(1, (gps.speed * 3.6) / 200); // full scale 200 km/h
  $('#gauge-fill').style.strokeDasharray = `${(frac * 395.84).toFixed(1)} 527.79`;

  const d = distParts(gps.distance);
  $('#stat-dist').textContent = d.v;
  $('#stat-dist-unit').textContent = d.u === 'km' ? 'kilometres' : 'miles';
  $('#stat-time').textContent = fmtDuration(gps.movingTime);
  $('#stat-avg').textContent = gps.movingTime > 10 ? speedText(gps.distance / gps.movingTime) : '0';
  $('#stat-max').textContent = speedText(gps.maxSpeed);

  const [cls, text] = {
    ok: ['pill-ok', 'GPS'], weak: ['pill-weak', 'Weak GPS'], wait: ['pill-wait', 'Finding GPS'],
    off: ['pill-off', 'Location off'], unsupported: ['pill-off', 'No GPS'],
  }[gps.status] || ['pill-wait', 'GPS'];
  $('#gps-pill').className = `pill ${cls}`;
  $('#gps-text').textContent = gps.status === 'ok' && gps.accuracy != null ? `±${Math.round(gps.accuracy)} m` : text;
  $('#gps-dot').className = `gps-dot ${gps.status === 'unsupported' ? 'off' : gps.status}`;

  const diag = $('#gps-diag');
  diag.hidden = !settings.diag;
  if (settings.diag) {
    const src = { gps: 'GPS speed', position: 'From position', none: 'No speed signal' }[gps.source] || 'Demo';
    diag.textContent = `${src} · raw ${speedText(gps.rawSpeed || 0)} · ${gps.moving === false ? 'stopped' : 'moving'}`;
  }

  if (current === 'dash' && Date.now() - lastDestRender > 15000) { lastDestRender = Date.now(); renderDestWidget(); }
}
gps.addEventListener('update', () => {
  renderGps();
  if (current === 'maps' || navigating) nav?.update(gps.position, gps.accuracy);
  if (gps.status === 'off' && !renderGps.warned) {
    renderGps.warned = true;
    toast('Allow location: Settings › Privacy › Location Services › Safari Websites', 5000);
  }
});

// Gauge: tap = units, hold = GPS diagnostics.
let pressTimer = null, longPressed = false;
const gauge = $('#speed-gauge');
gauge.addEventListener('pointerdown', () => {
  longPressed = false;
  pressTimer = setTimeout(() => {
    longPressed = true;
    settings.diag = !settings.diag; saveSettings(); renderGps();
    toast(settings.diag ? 'GPS diagnostics on' : 'GPS diagnostics off', 1400);
  }, 700);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => gauge.addEventListener(ev, () => clearTimeout(pressTimer)));
gauge.addEventListener('contextmenu', (e) => e.preventDefault());
gauge.addEventListener('click', () => {
  if (longPressed) { longPressed = false; return; }
  settings.imperial = !settings.imperial; saveSettings(); applyUnits();
});

// End ride: tap twice to reset trip stats.
let endArmed = null;
$('#btn-end').addEventListener('click', () => {
  const btn = $('#btn-end');
  if (!endArmed) {
    btn.classList.add('armed'); $('#btn-end-label').textContent = 'Tap to reset';
    endArmed = setTimeout(() => { btn.classList.remove('armed'); $('#btn-end-label').textContent = 'End ride'; endArmed = null; }, 3000);
    return;
  }
  clearTimeout(endArmed); endArmed = null;
  btn.classList.remove('armed'); $('#btn-end-label').textContent = 'End ride';
  gps.resetTrip(); toast('Trip reset', 1500);
});

function scheduleClock() { $('#clock').textContent = fmtClock(); setTimeout(scheduleClock, 60000 - (Date.now() % 60000) + 50); }

// ================================================================ places (rows used by dashboard + maps)
function placeChip(p, i) {
  const chip = h('span', { class: `chip ${PLACE_COLORS[i % PLACE_COLORS.length]}` });
  setIcon(chip, placeIcon(p.name));
  return chip;
}
const awayText = (p) => (gps.position ? `${shortDist(haversine(gps.position, p))} away` : 'Tap to navigate');

function destRow(p, i, side, meta) {
  return h('div', { class: 'dest-row' },
    h('button', { class: 'dest-main', type: 'button', onclick: () => previewPlace(p) },
      placeChip(p, i),
      h('span', { class: 'dest-text' }, h('span', { class: 'dest-name' }, p.name), h('span', { class: 'dest-meta' }, meta ?? awayText(p)))),
    side);
}
const cascade = (els, max = 10) => els.forEach((el, i) => { el.classList.add('anim-in'); el.style.setProperty('--i', Math.min(i, max)); });

function renderDestWidget(animate = false) {
  const list = places.getPlaces().slice(0, 2);
  const rows = list.map((p, i) => destRow(p, i, null));
  if (list.length < 2) {
    const chip = h('span', { class: 'chip c-green' }); setIcon(chip, 'plus');
    rows.push(h('div', { class: 'dest-row' }, h('button', { class: 'dest-main', type: 'button', onclick: () => { settings.mapPanel = 'open'; saveSettings(); show('maps'); setTimeout(() => $('#search-input').focus(), 300); } },
      chip, h('span', { class: 'dest-text' }, h('span', { class: 'dest-name' }, 'Add a favourite'), h('span', { class: 'dest-meta' }, 'Search for Home, University…')))));
  }
  if (animate) cascade(rows);
  $('#dest-list').replaceChildren(...rows);
}

function renderPlaces() {
  const rows = places.getPlaces().map((p, i) => {
    const del = h('button', { class: 'dest-side', type: 'button', 'aria-label': `Remove ${p.name}`, onclick: () => {
      if (confirm(`Remove “${p.name}” from favourites?`)) { places.removePlace(p.id); renderPlaces(); }
    } });
    setIcon(del, 'trash');
    return destRow(p, i, del);
  });
  cascade(rows);
  $('#places-list').replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, 'No favourites yet. Search above and tap + to save one. Call it “Home” or “University” to get the matching icon.')]));
}

$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#search-input').value.trim();
  if (!q) return;
  $('#search-input').blur();
  $('#results-block').hidden = false;
  $('#results-list').replaceChildren(h('div', { class: 'empty' }, 'Searching…'));
  try {
    const res = DEMO ? DEMO_PLACES.map((p) => ({ ...p, name: `${q} · ${p.name}` })) : await geocode(q, gps.position);
    const rows = res.map((r, i) => {
      const save = h('button', { class: 'dest-side save', type: 'button', 'aria-label': `Save ${r.name}`, onclick: () => {
        const name = prompt('Name this place (e.g. Home, University)', r.name);
        if (name === null) return;
        places.savePlace({ ...r, name: name.trim() || r.name });
        toast('Saved to favourites', 1300); renderPlaces();
      } });
      setIcon(save, 'plus');
      return destRow(r, i, save, [awayText(r), r.label].filter(Boolean).join(' · '));
    });
    cascade(rows);
    $('#results-list').replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, 'Nothing found. Try adding the city name.')]));
  } catch (err) {
    $('#results-list').replaceChildren(h('div', { class: 'empty' }, err.message));
  }
});
$('#btn-clear').addEventListener('click', () => { $('#results-block').hidden = true; $('#search-input').value = ''; });

// ================================================================ maps & navigation
function speak(text) {
  if (!settings.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = 1.05;
  speechSynthesis.speak(u);
}
let speechReady = false;
function speechUnlock() {
  if (speechReady || !('speechSynthesis' in window)) return;
  speechReady = true;
  speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}
document.addEventListener('pointerdown', speechUnlock, { once: true, passive: true });

function applyVoice() {
  $('#btn-voice').setAttribute('aria-pressed', String(settings.voice));
  setIcon($('#voice-icon'), settings.voice ? 'volume' : 'volumeOff');
}
$('#btn-voice').addEventListener('click', () => {
  settings.voice = !settings.voice; saveSettings(); applyVoice(); renderSettings();
  if (settings.voice) speak('Voice on');
});
$('#btn-recenter').addEventListener('click', () => nav?.recenter());

// The "Where to?" panel can be tucked away for a full-width map, and comes back as a small pill.
// Animated: the panel slides while the map stays perfectly still. Hiding widens the map at once
// (under the sliding panel); showing narrows it only once the panel has slid in. Each time the
// map's box changes, it's panned by the same amount, so the streets don't jump.
let panelTimer = null;
function setMapWide(wide) {
  const el = $('#screen-maps');
  if (el.classList.contains('map-wide') === wide) return;
  const before = $('#map').getBoundingClientRect();
  el.classList.toggle('map-wide', wide);
  if (!nav) return;
  const after = $('#map').getBoundingClientRect();
  nav.map.invalidateSize({ pan: false });
  nav.map.panBy([after.left - before.left, after.top - before.top], { animate: false });
  if (nav.follow && nav.lastPos) setTimeout(() => nav.map.panTo([nav.lastPos.lat, nav.lastPos.lng], { animate: !settings.saver, duration: 0.35 }), 360);
}
function setMapPanel(state) {
  settings.mapPanel = state; saveSettings();
  if (current !== 'maps' || mapMode !== 'browse') return;
  const el = $('#screen-maps');
  clearTimeout(panelTimer);
  if (state === 'hidden') {
    $('#search-input').blur();
    el.classList.add('panel-hidden');
    setMapWide(true);
  } else {
    el.classList.remove('panel-hidden');
    panelTimer = setTimeout(() => setMapWide(false), 340);
  }
}
$('#btn-panel-hide').addEventListener('click', () => setMapPanel('hidden'));
$('#btn-panel-show').addEventListener('click', () => setMapPanel('open'));

function ensureNav() {
  if (nav) return nav;
  nav = new NavSession($('#map'), {
    onUpdate: renderNav,
    onError: (e) => toast(e.message, 4500),
    onArrive: () => {
      navigating = false;
      dimmer.poke();
      renderNav({ state: 'arrived' });
      setTimeout(() => { if (!navigating) setMapMode('browse'); }, 5000);
    },
    speak,
  });
  nav.setTheme(resolvedTheme());
  nav.setSaver(settings.saver);
  return nav;
}

// Maps has three modes: 'browse' (search + favourites), 'preview' (a place and its route,
// with Go), and 'guide' (turn-by-turn).
let mapMode = 'browse';
function setMapMode(mode) {
  mapMode = mode;
  const hidePanel = mode === 'browse' && settings.mapPanel === 'hidden';
  const el = $('#screen-maps');
  clearTimeout(panelTimer);
  el.classList.toggle('browsing', mode !== 'guide');
  el.classList.toggle('panel-hidden', hidePanel);
  el.classList.toggle('map-wide', hidePanel);
  $('#maps-browse').hidden = mode !== 'browse';
  $('#btn-panel-show').hidden = mode !== 'browse';
  $('#maps-place').hidden = mode !== 'preview';
  $('#maps-guide').hidden = mode !== 'guide';
  $('#btn-voice').hidden = mode !== 'guide';
  nav?.resize();
}

function openMaps() {
  ensureNav();
  setMapMode(navigating ? 'guide' : mapMode === 'guide' ? 'browse' : mapMode);
  if (mapMode === 'browse') renderPlaces();
  if (gps.position) nav.update(gps.position, gps.accuracy);
}

// ---- place preview: tap a favourite or a search result → see it and the route on the map
let previewed = null;
function setPlaceStats(r) {
  const has = !!r;
  $('#place-time').textContent = has ? String(Math.max(1, Math.round(r.duration / 60))) : '–';
  const d = has ? distParts(r.distance) : null;
  $('#place-dist').textContent = has ? d.v : '–';
  $('#place-dist-unit').textContent = has ? d.u : (settings.imperial ? 'mi' : 'km');
  $('#place-eta').textContent = has ? fmtClock(new Date(Date.now() + r.duration * 1000)) : '--:--';
}
function placeMsg(text) { $('#place-msg').textContent = text; $('#place-msg').hidden = !text; }

async function previewPlace(place) {
  const mine = { place, route: null };
  previewed = mine;
  mapMode = 'preview';
  show('maps');
  $('#place-name').textContent = place.name;
  $('#place-label').textContent = place.label || (gps.position ? `${shortDist(haversine(gps.position, place))} away` : '');
  setPlaceStats(null);
  placeMsg(DEMO || gps.position ? 'Finding the best route…' : 'Waiting for GPS to plan the route. You can still tap Go.');
  try {
    const r = await nav.preview(place, DEMO ? null : gps.position, css('--blue') || '#0A84FF', DEMO ? demoRoute() : null);
    if (previewed !== mine) return;
    mine.route = r;
    setPlaceStats(r);
    if (r) placeMsg('');
  } catch (e) {
    if (previewed === mine) placeMsg(`${e.message}. Go will try again.`);
  }
}
$('#btn-place-go').addEventListener('click', () => { if (previewed) startNavigation(previewed.place, previewed.route); });
$('#btn-place-apple').addEventListener('click', () => { if (previewed) openInAppleMaps(previewed.place); });
$('#btn-place-back').addEventListener('click', () => {
  previewed = null;
  nav?.clearPreview();
  setMapMode('browse');
  renderPlaces();
});

/**
 * Hand a destination to Apple Maps. On iPhone the maps:// link opens the Maps app directly,
 * so the home-screen app is never navigated away (an https link went through Safari, and
 * coming back could leave Moto Dash stuck until it was restarted).
 */
function openInAppleMaps(p) {
  const q = `daddr=${p.lat},${p.lng}&dirflg=d`;
  const ios = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) location.href = `maps://?${q}`;
  else window.open(`https://maps.apple.com/?${q}`, '_blank', 'noopener');
}

let destName = '';
function renderNav(s) {
  const arrow = $('#turn-arrow');
  const setTurn = (icon, rot, dist, text) => {
    setIcon(arrow, icon); arrow.style.transform = `rotate(${rot}deg)`;
    $('#turn-dist').textContent = dist; $('#turn-text').textContent = text;
  };
  if (s.state === 'waiting') return setTurn('satellite', 0, '—', 'Getting your location…');
  if (s.state === 'routing') return setTurn('route', 0, '…', 'Finding the best route…');
  if (s.state === 'error') return setTurn('info', 0, '!', s.message);
  if (s.state === 'arrived') return setTurn('goal', 0, 'Arrived', destName);
  const [icon, rot] = turnIcon(s.type);
  if (s.toTurn < 250) dimmer.poke();   // brighten the screen for the next turn
  if (s.instruction !== renderNav.last) { renderNav.last = s.instruction; replay($('.turn'), 'bump'); }
  setTurn(icon, rot, shortDist(s.toTurn), s.instruction);
  $('#nav-eta').textContent = fmtClock(new Date(Date.now() + s.remainingTime * 1000));
  $('#nav-time').textContent = String(Math.max(1, Math.round(s.remainingTime / 60)));
  const d = distParts(s.remaining);
  $('#nav-dist').textContent = d.v; $('#nav-dist-unit').textContent = d.u;
}

async function startNavigation(place, route = null) {
  previewed = null;
  destName = place.name;
  $('#nav-dest').textContent = place.name;
  $('#nav-eta').textContent = '--:--'; $('#nav-time').textContent = '–'; $('#nav-dist').textContent = '–';
  navigating = true;
  renderNav.last = null;
  show('maps');
  speechUnlock();
  const accent = css('--blue') || '#0A84FF';
  if (DEMO) {
    await nav.start(place, null, accent, route || demoRoute());
    nav.update(gps.position, 5);
  } else {
    await nav.start(place, gps.position, accent, route);
  }
  updateAwake();
}
$('#btn-nav-end').addEventListener('click', () => {
  navigating = false; nav?.stop(); if ('speechSynthesis' in window) speechSynthesis.cancel();
  setMapMode('browse'); renderPlaces();
  if (gps.position) nav.update(gps.position, gps.accuracy);
  updateAwake();
});

// ================================================================ music: shared state + polling
function setPlaying(on) { document.body.dataset.playing = String(!!on); }
const fmtMs = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
const pickImage = (imgs, prefer = 300) => {
  if (!imgs?.length) return '';
  const sorted = [...imgs].sort((a, b) => (a.width || 0) - (b.width || 0));
  return (sorted.find((i) => (i.width || 0) >= prefer) || sorted[sorted.length - 1]).url;
};

const player = { item: null, isPlaying: false, progress: 0, duration: 0, at: 0, shuffle: false, smartShuffle: false, repeat: 'off', contextUri: '' };
let nowUri = '';
let lastArt = '';

function renderMusic(p) {
  const item = p?.item || null;
  const set = (key, v) => $$(`[data-music="${key}"]`).forEach((el) => { el.textContent = v; });
  const key = item ? `${item.uri || ''}|${item.name}` : '';
  if (key !== renderMusic.key) {
    if (renderMusic.key !== undefined) $$('.np-widget, .mini-music, #tab-now').forEach((el) => replay(el, 'swap'));
    renderMusic.key = key;
  }
  Object.assign(player, {
    item, isPlaying: !!p?.is_playing, progress: p?.progress_ms || 0, duration: item?.duration_ms || 0, at: Date.now(),
    shuffle: modes.settle('shuffle', !!p?.shuffle_state),
    smartShuffle: !!p?.smart_shuffle && !modes.pending.shuffle,
    repeat: modes.settle('repeat', p?.repeat_state || 'off'),
    contextUri: p?.context?.uri || '',
  });
  if (!item) {
    set('title', 'Nothing playing'); set('artist', 'Pick something below or in Spotify'); set('album', ' ');
    set('status', 'Idle');
  } else {
    set('title', item.name);
    set('artist', item.artists?.map((a) => a.name).join(', ') || item.show?.name || '');
    set('album', item.album?.name || '');
    set('status', p.is_playing ? 'Playing' : 'Paused');
  }
  setPlaying(player.isPlaying);
  renderShuffle();
  renderRepeat();

  const images = item?.album?.images || item?.images || [];
  const art = pickImage(images, 300);
  if (art !== lastArt) {
    lastArt = art;
    $$('[data-music="img"]').forEach((img) => { img.hidden = !art; if (art) img.src = art; else img.removeAttribute('src'); });
    updateArtTint(images);
  }
  if ((item?.uri || '') !== nowUri) { nowUri = item?.uri || ''; musicUI.markCurrent(); }
  musicUI.markContext();
  progress.paint();
  progress.sync();
}

function renderShuffle() {
  const b = $('#btn-shuf');
  const smart = player.shuffle && player.smartShuffle;
  b.setAttribute('aria-pressed', String(player.shuffle));
  b.classList.toggle('smart', smart);
  b.setAttribute('aria-label', smart ? 'Smart Shuffle' : player.shuffle ? 'Shuffle: on' : 'Shuffle: off');
  b.lastElementChild.textContent = smart ? 'Smart Shuffle' : 'Shuffle';
}

/**
 * Shuffle & Repeat. Taps change the button at once; the request to Spotify goes out 350 ms
 * after the last tap (so fast tapping sends one request, not a pile that arrive out of order),
 * and until Spotify reports the new value, polls can't flip the button back to the old one.
 */
const modes = {
  pending: {},   // kind → { value, until }
  timers: {},
  /** The value to show: Spotify's, unless we're still waiting for it to apply our change. */
  settle(kind, server) {
    const p = this.pending[kind];
    if (!p) return server;
    if (server === p.value || Date.now() > p.until) { delete this.pending[kind]; return server; }
    return p.value;
  },
  request(kind, value) {
    player[kind] = value;
    if (kind === 'shuffle') player.smartShuffle = false;
    this.pending[kind] = { value, until: Date.now() + 8000 };
    if (kind === 'shuffle') renderShuffle(); else renderRepeat();
    clearTimeout(this.timers[kind]);
    this.timers[kind] = setTimeout(async () => {
      try {
        await (kind === 'shuffle' ? spotify.setShuffle(value) : spotify.setRepeat(value));
        if (this.pending[kind]) this.pending[kind].until = Date.now() + 4000;  // time for Spotify to apply it
        setTimeout(() => music.kick(), 900);
      } catch (e) {
        delete this.pending[kind];
        handleSpotifyError(e);
        music.kick();
      }
    }, 350);
  },
};

function renderRepeat() {
  $('#btn-repeat').setAttribute('aria-pressed', String(player.repeat !== 'off'));
  $('#btn-repeat').setAttribute('aria-label', `Repeat: ${player.repeat}`);
  setIcon($('#repeat-icon'), player.repeat === 'track' ? 'repeatOne' : 'repeat');
  $('#repeat-label').textContent = player.repeat === 'track' ? 'Repeat 1' : 'Repeat';
}

/**
 * Song colours: the Now Playing background (and the dashboard music card) take two
 * colours from the album art, like Apple Music. Uses the small 64 px cover, once per song.
 */
let tintFor = '';
async function updateArtTint(images = player.item?.album?.images || player.item?.images || []) {
  const url = settings.artTint && !settings.saver ? pickImage(images, 60) : '';
  tintFor = url;
  const off = () => document.body.classList.remove('art-tint');
  if (!url) return off();
  const pal = await artPalette(url);
  if (tintFor !== url) return;          // the song changed while we were sampling
  if (!pal) return off();
  document.documentElement.style.setProperty('--art-a', pal.a);
  document.documentElement.style.setProperty('--art-b', pal.b);
  document.body.classList.add('art-tint');
}

/** Progress bar: estimated locally between polls, ticks once a second only while visible and playing. */
const progress = {
  timer: null,
  value() { return Math.min(player.duration, player.progress + (player.isPlaying ? Date.now() - player.at : 0)); },
  paint() {
    const v = this.value();
    const pct = player.duration ? (v / player.duration) * 100 : 0;
    $$('[data-music="progress"]').forEach((el) => { el.style.width = `${pct.toFixed(2)}%`; });
    $$('[data-music="elapsed"]').forEach((el) => { el.textContent = fmtMs(v); });
    $$('[data-music="remaining"]').forEach((el) => { el.textContent = `-${fmtMs(Math.max(0, player.duration - v))}`; });
  },
  sync() {
    const want = player.isPlaying && !settings.saver && document.visibilityState === 'visible' && (current === 'dash' || current === 'music');
    if (want && !this.timer) this.timer = setInterval(() => this.paint(), 1000);
    if (!want && this.timer) { clearInterval(this.timer); this.timer = null; }
  },
};

function handleSpotifyError(e, quiet = false) {
  if (e instanceof AuthError || e.name === 'AuthError') { show('login'); showLoginError(e.message); return; }
  if (!quiet || e.code === 'NO_DEVICE') toast(e.message, 3500);
}

/** Polls Spotify only while a screen that shows music is visible; slower when paused or in saver mode. */
const music = {
  timer: null,
  interval() { return settings.saver ? 15000 : player.isPlaying ? 5000 : 12000; },
  kick() { clearTimeout(this.timer); this.tick(); },
  async tick() {
    clearTimeout(this.timer);
    const visible = document.visibilityState === 'visible' && current && current !== 'login' && current !== 'settings';
    if (!visible || !spotify.isLoggedIn()) return; // restarted by show() / visibilitychange
    try { renderMusic(await spotify.getPlayer()); } catch (e) { handleSpotifyError(e, true); }
    this.timer = setTimeout(() => this.tick(), this.interval());
  },
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') music.kick(); else clearTimeout(music.timer);
  progress.sync();
});

async function control(fn) {
  try { await fn(); setTimeout(() => music.kick(), 650); } catch (err) { handleSpotifyError(err); music.kick(); }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action;
  if (a === 'toggle') {
    const was = player.isPlaying;
    player.progress = progress.value(); player.at = Date.now(); player.isPlaying = !was;   // optimistic
    setPlaying(!was); progress.sync();
    control(() => (was ? spotify.pause() : spotify.play()));
  } else if (a === 'next') control(() => spotify.next());
  else if (a === 'prev') control(() => spotify.previous());
});
$('#btn-shuf').addEventListener('click', () => {
  // Spotify's Web API can only switch normal shuffle on/off; Smart Shuffle is shown but
  // can only be turned on in the Spotify app.
  if (player.smartShuffle) toast('Smart Shuffle can only be changed in the Spotify app', 2600);
  modes.request('shuffle', !player.shuffle);
});
$('#btn-repeat').addEventListener('click', () => {
  modes.request('repeat', { off: 'context', context: 'track', track: 'off' }[player.repeat] || 'off');
  toast({ off: 'Repeat off', context: 'Repeat all', track: 'Repeat this song' }[player.repeat], 1000);
});
$('#seek-bar').addEventListener('click', (e) => {
  if (!player.duration) return;
  const r = e.currentTarget.getBoundingClientRect();
  const ms = ((e.clientX - r.left) / r.width) * player.duration;
  player.progress = ms; player.at = Date.now(); progress.paint();
  control(() => spotify.seek(ms));
});

// ================================================================ music: tabs, liked songs, playlists
const musicUI = {
  tab: 'now',
  liked: { items: [], total: null, next: true, loading: false, at: 0, shown: 0 },
  lists: { items: [], next: true, loading: false, at: 0 },
  observer: null,

  open() { this.select(this.tab, false); },

  select(tab, animate = true) {
    this.tab = tab;
    $$('.music-tabs [role="tab"]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === tab)));
    $('#music-card').classList.toggle('on-now', tab === 'now');
    for (const t of ['now', 'liked', 'playlists']) $(`#tab-${t}`).hidden = t !== tab;
    if (animate) replay($(`#tab-${tab}`), 'enter-fade');
    if (tab === 'liked') this.openLiked();
    if (tab === 'playlists') this.openPlaylists();
  },

  fresh: (o) => o.items.length && Date.now() - o.at < 5 * 60 * 1000,   // reuse for 5 min: no refetch

  errorBox(e, retry) {
    if (e instanceof AuthError || e.name === 'AuthError') { handleSpotifyError(e); return h('div'); }
    const box = h('div', { class: 'list-msg' }, e.message);
    if (e.code === 'SCOPE') box.append(h('button', { class: 'btn-pill green', type: 'button', onclick: () => { spotify.logout(); spotify.login().catch((err) => toast(err.message)); } }, 'Reconnect Spotify'));
    else box.append(h('button', { class: 'btn-pill', type: 'button', onclick: retry }, 'Try again'));
    return box;
  },

  // ---- Liked Songs
  openLiked() {
    const L = this.liked;
    if (this.fresh(L)) { L.shown = 0; this.renderLiked(); return; }
    Object.assign(L, { items: [], total: null, next: true, shown: 0 });
    $('#liked-list').replaceChildren(h('div', { class: 'list-msg' }, 'Loading your Liked Songs…'));
    $('#liked-count').textContent = 'Loading…';
    this.moreLiked();
  },
  async moreLiked() {
    const L = this.liked;
    if (L.loading || !L.next) return;
    L.loading = true;
    try {
      const page = await spotify.getLiked(L.items.length, 50);
      L.items.push(...(page?.items || []).map((x) => x.track).filter((t) => t && t.uri && !t.is_local));
      L.total = page?.total ?? L.items.length; L.next = !!page?.next; L.at = Date.now();
      this.renderLiked();
    } catch (e) {
      $('#liked-list').replaceChildren(this.errorBox(e, () => { L.at = 0; this.openLiked(); }));
      $('#liked-count').textContent = '';
    } finally { L.loading = false; }
  },
  songRow(t, i) {
    const art = h('span', { class: 'song-art' });
    const small = pickImage(t.album?.images, 60);
    if (small && !settings.saver) art.append(h('img', { src: small, alt: '', loading: 'lazy', decoding: 'async' }));
    else { const ph = h('span'); setIcon(ph, 'music'); art.append(ph); }
    const eq = h('span', { class: 'song-eq', hidden: t.uri !== nowUri }); setIcon(eq, 'eq');
    return h('button', { class: `song${t.uri === nowUri ? ' current' : ''}`, type: 'button', role: 'listitem', dataset: { uri: t.uri }, onclick: () => this.playLiked(i) },
      art,
      h('span', { class: 'song-text' }, h('span', { class: 'song-title' }, t.name), h('span', { class: 'song-artist' }, (t.artists || []).map((a) => a.name).join(', '))),
      eq, h('span', { class: 'song-time' }, fmtMs(t.duration_ms || 0)));
  },
  renderLiked() {
    const L = this.liked;
    $('#liked-count').textContent = L.total != null ? `${L.total} song${L.total === 1 ? '' : 's'}` : '';
    if (!L.items.length) { $('#liked-list').replaceChildren(h('div', { class: 'list-msg' }, 'No Liked Songs yet. Tap the heart on a song in Spotify to add it.')); return; }
    const from = L.shown;
    const rows = L.items.map((t, i) => {
      const r = this.songRow(t, i);
      if (i >= from) { r.classList.add('anim-in'); r.style.setProperty('--i', Math.min(i - from, 12)); }
      return r;
    });
    L.shown = L.items.length;
    const sentinel = h('div', { class: 'liked-more' });
    $('#liked-list').replaceChildren(...rows, sentinel);
    this.observer?.disconnect();
    if (L.next) {   // load the next page only when scrolled near the bottom
      this.observer = new IntersectionObserver((es) => { if (es.some((x) => x.isIntersecting)) this.moreLiked(); }, { root: $('#liked-list'), rootMargin: '300px' });
      this.observer.observe(sentinel);
    }
  },
  playLiked(i) { this.playUris(this.liked.items.slice(i).map((t) => t.uri)); },
  playUris(uris) {
    if (!uris.length) return;
    setPlaying(true);
    control(() => spotify.playTracks(uris.slice(0, 100)));
  },
  markCurrent() {
    $$('#liked-list .song').forEach((el) => {
      const on = el.dataset.uri === nowUri;
      el.classList.toggle('current', on);
      const eq = el.querySelector('.song-eq'); if (eq) eq.hidden = !on;
    });
  },

  // ---- Playlists
  openPlaylists() {
    const P = this.lists;
    if (this.fresh(P)) { this.renderPlaylists(); return; }
    Object.assign(P, { items: [], next: true });
    $('#playlist-grid').replaceChildren(h('div', { class: 'list-msg' }, 'Loading your playlists…'));
    this.morePlaylists();
  },
  async morePlaylists() {
    const P = this.lists;
    if (P.loading || !P.next) return;
    P.loading = true;
    try {
      // Up to 200 playlists, fetched in the background page by page.
      while (P.next && P.items.length < 200) {
        const page = await spotify.getPlaylists(P.items.length, 50);
        P.items.push(...(page?.items || []).filter(Boolean));
        P.next = !!page?.next; P.at = Date.now();
        this.renderPlaylists();
      }
    } catch (e) {
      $('#playlist-grid').replaceChildren(this.errorBox(e, () => { P.at = 0; this.openPlaylists(); }));
    } finally { P.loading = false; }
  },
  renderPlaylists() {
    const P = this.lists;
    if (!P.items.length) { $('#playlist-grid').replaceChildren(h('div', { class: 'list-msg' }, 'No playlists yet.')); return; }
    const tiles = P.items.map((pl, i) => {
      const cover = h('span', { class: 'pl-cover' });
      const img = pickImage(pl.images, 200);
      if (img && !settings.saver) cover.append(h('img', { src: img, alt: '', loading: 'lazy', decoding: 'async' }));
      else { const ph = h('span'); setIcon(ph, 'music'); cover.append(ph); }
      const count = pl.tracks?.total ?? pl.items?.total;
      const tile = h('button', { class: `pl-tile${pl.uri === player.contextUri ? ' current' : ''}`, type: 'button', dataset: { uri: pl.uri }, onclick: () => {
        setPlaying(true); toast(`Playing ${pl.name}`, 1400);
        control(() => spotify.playContext(pl.uri));
      } },
      cover, h('span', { class: 'pl-name' }, pl.name),
      h('span', { class: 'pl-meta' }, [pl.owner?.display_name, count != null ? `${count} songs` : ''].filter(Boolean).join(' · ')));
      tile.classList.add('anim-in'); tile.style.setProperty('--i', Math.min(i, 12));
      return tile;
    });
    $('#playlist-grid').replaceChildren(...tiles);
  },
  markContext() {
    $$('#playlist-grid .pl-tile').forEach((el) => el.classList.toggle('current', el.dataset.uri === player.contextUri));
  },
};
$$('.music-tabs [role="tab"]').forEach((t) => t.addEventListener('click', () => musicUI.select(t.dataset.tab)));
$('#btn-play-all').addEventListener('click', () => musicUI.playLiked(0));
$('#btn-shuffle').addEventListener('click', () => {
  const uris = musicUI.liked.items.map((t) => t.uri);
  for (let i = uris.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [uris[i], uris[j]] = [uris[j], uris[i]]; }
  musicUI.playUris(uris);
});

// ================================================================ settings screen
function renderSettings() {
  $$('[data-setting]').forEach((el) => {
    const key = el.dataset.setting;
    if (el.classList.contains('switch')) el.setAttribute('aria-checked', String(!!settings[key]));
    else $$('button', el).forEach((b) => b.setAttribute('aria-pressed', String(String(settings[key]) === b.dataset.val)));
  });
  $('#row-dim-after').hidden = !settings.autoDim;
  $('#spotify-status').textContent = spotify.isLoggedIn() ? (DEMO ? 'Demo mode' : 'Connected') : 'Not connected';
  $('#btn-logout').textContent = spotify.isLoggedIn() ? 'Log out' : 'Log in';
  const k = getKeys();
  // Only Spotify needs a key. Maps work without one (free routing); an ORS key is optional.
  const built = !!DEFAULTS.SPOTIFY_CLIENT_ID;
  $('#keys-status').textContent = built ? 'Built in from GitHub' : k.spotifyClientId ? 'Saved on this phone' : 'Missing — tap Edit';
}
function changeSetting(key, val) {
  settings[key] = val; saveSettings();
  if (key === 'theme') applyTheme(true);
  if (key === 'saver') { applySaver(); music.kick(); progress.sync(); updateArtTint(); }
  if (key === 'glass') applyGlass();
  if (key === 'artTint') updateArtTint();
  if (key === 'autoDim' || key === 'dimAfter') { updateAwake(); dimmer.arm(); if (!settings.autoDim) dimmer.wake(); }
  if (key === 'imperial') applyUnits();
  if (key === 'voice') applyVoice();
  if (key === 'diag') renderGps();
  renderSettings();
}
$$('[data-setting]').forEach((el) => {
  const key = el.dataset.setting;
  if (el.classList.contains('switch')) el.addEventListener('click', () => changeSetting(key, !settings[key]));
  else $$('button', el).forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.val;
    changeSetting(key, v === 'true' ? true : v === 'false' ? false : v);
  }));
});
$('#btn-reset-trip').addEventListener('click', () => { if (confirm('Reset trip distance, time and top speed?')) { gps.resetTrip(); toast('Trip reset', 1400); } });
$('#btn-logout').addEventListener('click', () => {
  if (spotify.isLoggedIn()) { spotify.logout(); renderSettings(); toast('Logged out of Spotify', 1500); }
  else show('login');
});

// ================================================================ login & keys
function showLoginError(msg) { const el = $('#login-error'); el.textContent = msg; el.hidden = !msg; }
function renderLogin() {
  const k = getKeys();
  $('#key-spotify').value = k.spotifyClientId;
  $('#key-ors').value = k.orsKey;
  $('#redirect-uri').textContent = spotify.redirectUri();
  const built = !!DEFAULTS.SPOTIFY_CLIENT_ID;
  $('#keys-badge').textContent = built ? '✓ built in' : k.spotifyClientId ? '✓ saved' : '';
  if (!k.spotifyClientId) $('#setup').open = true;
  $('#btn-login-label').textContent = spotify.isLoggedIn() ? 'Continue' : 'Log in with Spotify';
}
$('#btn-save-keys').addEventListener('click', () => {
  setKeys({ spotifyClientId: $('#key-spotify').value, orsKey: $('#key-ors').value });
  showLoginError(''); renderLogin(); toast('Keys saved on this phone', 1600);
});
$('#btn-login').addEventListener('click', async () => {
  if (spotify.isLoggedIn()) { enterApp(); return; }
  if ($('#key-spotify').value.trim() || $('#key-ors').value.trim()) setKeys({ spotifyClientId: $('#key-spotify').value, orsKey: $('#key-ors').value });
  try { await spotify.login(); } catch (e) { showLoginError(e.message); $('#setup').open = true; }
});

function enterApp() { gps.start(); show('dash'); }

// ================================================================ boot
async function boot() {
  hydrateIcons();
  applyDockOrder();
  applyTheme(); applySaver(); applyVoice(); applyUnits();
  scheduleClock();
  if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('./sw.js').catch(() => {});
  if (DEMO) places.seedPlaces(DEMO_PLACES);

  try {
    if (await spotify.handleRedirect()) toast('Spotify connected', 1800);
  } catch (e) { show('login'); showLoginError(e.message); return; }

  if (!spotify.isLoggedIn()) { show('login'); return; }
  enterApp();
}
boot();
