import * as realSpotify from './spotify.js';
import { GpsTracker } from './gps.js';
import { NavSession } from './nav.js';
import * as places from './places.js';
import { geocode } from './routing.js';
import { getKeys, setKeys } from './keys.js';
import { setAwake } from './wakelock.js';
import { hydrateIcons, setIcon, placeIcon, PLACE_COLORS, turnIcon } from './icons.js';
import { DEMO, DemoGps, demoSpotify, demoRoute, DEMO_PLACES } from './demo.js';
import { $, $$, h, haversine, fmtDuration, fmtMinutes, fmtClock, toast, readJSON, writeJSON } from './util.js';

const spotify = DEMO ? demoSpotify() : realSpotify;
const AuthError = realSpotify.AuthError;

// ---------------------------------------------------------------- settings
const settings = { imperial: false, mapsMode: 'inapp', voice: true, theme: 'auto', saver: false, ...readJSON('md.settings', {}) };
const saveSettings = () => writeJSON('md.settings', settings);

const gps = DEMO ? new DemoGps() : new GpsTracker();
let nav = null;
let navigating = false;
let current = null;

// ---------------------------------------------------------------- screens
const SCREENS = ['login', 'dash', 'places', 'music', 'nav'];
const DEPTH = { login: 0, dash: 1, places: 2, music: 2, nav: 3 };
/** Re-trigger a one-shot CSS animation class. */
export function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function show(name) {
  const prev = current;
  for (const s of SCREENS) $(`#screen-${s}`).hidden = s !== name;
  const el = $(`#screen-${name}`);
  el.classList.remove('enter-fwd', 'enter-back', 'enter-fade');
  if (prev && prev !== name) replay(el, DEPTH[name] >= DEPTH[prev] ? 'enter-fwd' : 'enter-back');
  else if (!prev) replay(el, 'enter-fade');
  current = name;
  if (name === 'login') renderLogin();
  if (name === 'places') renderPlaces();
  if (name === 'dash') renderTiles(prev !== 'dash');
  if (name === 'nav') nav?.resize();
  if (name === 'music') liked.open();
  updateAwake();
  music.kick();
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) show(go.dataset.go);
});

// ---------------------------------------------------------------- theme
const mqLight = matchMedia('(prefers-color-scheme: light)');
const resolvedTheme = () => (settings.theme === 'auto' ? (mqLight.matches ? 'light' : 'dark') : settings.theme);
function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
  const t = resolvedTheme();
  $('meta[name="theme-color"]').setAttribute('content', t === 'light' ? '#EEF0F6' : '#07070D');
  setIcon($('#theme-icon'), settings.theme === 'auto' ? 'auto' : t === 'light' ? 'sun' : 'moon');
  $('#btn-theme').setAttribute('aria-label', `Theme: ${settings.theme}`);
  nav?.setTheme(t);
}
mqLight.addEventListener('change', applyTheme);
$('#btn-theme').addEventListener('click', () => {
  settings.theme = { auto: 'dark', dark: 'light', light: 'auto' }[settings.theme];
  document.documentElement.classList.add('theming');
  saveSettings(); applyTheme();
  setTimeout(() => document.documentElement.classList.remove('theming'), 400);
  toast(`Theme: ${settings.theme === 'auto' ? 'Auto (follows iPhone)' : settings.theme === 'dark' ? 'Dark' : 'Light'}`, 1600);
});
const accent = () => getComputedStyle(document.documentElement).getPropertyValue('--orange').trim() || '#FF5A1F';

// ---------------------------------------------------------------- battery saver
function applySaver() {
  document.body.classList.toggle('saver', settings.saver);
  $('#btn-saver').setAttribute('aria-pressed', String(settings.saver));
  nav?.setSaver(settings.saver);
}
$('#btn-saver').addEventListener('click', () => {
  settings.saver = !settings.saver;
  saveSettings(); applySaver(); music.kick();
  toast(settings.saver ? 'Battery saver on: slower music updates, lighter map' : 'Battery saver off', 2200);
});

/**
 * Screen-on policy: keep it on while riding or navigating, let iOS dim it
 * in menus or after 5 min parked (unless navigating).
 */
function updateAwake() {
  const parked = Date.now() - gps.lastMoveAt > 5 * 60 * 1000;
  setAwake(current === 'nav' || ((current === 'dash' || current === 'music') && !parked));
}
setInterval(updateAwake, 30000);

// ---------------------------------------------------------------- units
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
  return m < 1000 ? `${Math.max(10, Math.round(m / (m < 200 ? 10 : 50)) * (m < 200 ? 10 : 50))} m` : `${(m / 1000).toFixed(1)} km`;
}
function applyUnits() {
  $$('.speed-unit').forEach((el) => { el.textContent = settings.imperial ? 'mph' : 'km/h'; });
  renderGps();
}
$('#speed-card').addEventListener('click', () => {
  settings.imperial = !settings.imperial;
  saveSettings(); applyUnits(); renderTiles();
});

// ---------------------------------------------------------------- GPS / dashboard
function speedBand(ms) {
  const kmh = ms * 3.6;
  return kmh < 50 ? 'var(--lime)' : kmh < 90 ? 'var(--cyan)' : kmh < 130 ? 'var(--orange)' : 'var(--magenta)';
}
let lastTileRender = 0;
function renderGps() {
  const s = speedText(gps.speed);
  $('#speed').textContent = s;
  $('#nav-speed').textContent = s;
  document.documentElement.style.setProperty('--band', speedBand(gps.speed));
  const frac = Math.min(1, (gps.speed * 3.6) / 200); // gauge full scale: 200 km/h
  $('#gauge-fill').style.strokeDasharray = `${(frac * 395.84).toFixed(1)} 527.79`;

  const d = distParts(gps.distance);
  $('#stat-dist').textContent = d.v;
  $('#stat-dist-unit').textContent = d.u;
  $('#stat-time').textContent = fmtDuration(gps.movingTime);
  $('#stat-avg').textContent = gps.movingTime > 10 ? speedText(gps.distance / gps.movingTime) : '0';
  $('#stat-max').textContent = speedText(gps.maxSpeed);

  const pill = $('#gps-pill');
  const [cls, text] = {
    ok: ['pill-ok', 'GPS'], weak: ['pill-weak', 'Weak GPS'], wait: ['pill-wait', 'Finding GPS'],
    off: ['pill-off', 'Location off'], unsupported: ['pill-off', 'No GPS'],
  }[gps.status] || ['pill-wait', 'GPS'];
  pill.className = `pill ${cls}`;
  $('#gps-text').textContent = text;

  if (current === 'dash' && Date.now() - lastTileRender > 15000) { lastTileRender = Date.now(); renderTiles(); }
}
gps.addEventListener('update', () => {
  renderGps();
  if (navigating) nav?.update(gps.position, gps.accuracy);
  if (gps.status === 'off' && !renderGps.warned) { renderGps.warned = true; toast('Allow location in Settings › Privacy › Location Services › Safari Websites'); }
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

function tickClock() { $('#clock').textContent = fmtClock(); }
// Tick on the minute boundary instead of every second.
function scheduleClock() { tickClock(); setTimeout(scheduleClock, 60000 - (Date.now() % 60000) + 50); }

// ---------------------------------------------------------------- places
function placeChip(p, i) {
  const chip = h('span', { class: `chip ${PLACE_COLORS[i % PLACE_COLORS.length]}` });
  setIcon(chip, placeIcon(p.name));
  return chip;
}
function awayText(p) {
  return gps.position ? `${shortDist(haversine(gps.position, p))} away` : 'Tap to navigate';
}

function renderTiles(animate = false) {
  const list = places.getPlaces().slice(0, 2);
  const box = $('#place-tiles');
  const tiles = list.map((p, i) => h('button', { class: 'tile', type: 'button', onclick: () => startNavigation(p) },
    placeChip(p, i), h('span', {}, h('div', { class: 'tile-name' }, p.name), h('div', { class: 'tile-sub' }, awayText(p)))));
  if (list.length < 2) {
    const chip = h('span', { class: 'chip c-lime' }); setIcon(chip, 'plus');
    tiles.push(h('button', { class: 'tile ghost', type: 'button', onclick: () => { show('places'); $('#search-input').focus(); } },
      chip, h('span', {}, h('div', { class: 'tile-name' }, 'Add place'), h('div', { class: 'tile-sub' }, 'Search & save'))));
  }
  const chip = h('span', { class: 'chip c-cyan' }); setIcon(chip, 'search');
  tiles.push(h('button', { class: 'tile ghost', type: 'button', onclick: () => show('places') },
    chip, h('span', {}, h('div', { class: 'tile-name' }, 'More places'), h('div', { class: 'tile-sub' }, 'Saved · search'))));
  if (animate) tiles.forEach((t, i) => { t.classList.add('anim-in'); t.style.setProperty('--i', i); });
  box.replaceChildren(...tiles);
}

function placeRow(p, i, side) {
  return h('div', { class: 'place-row' },
    h('button', { class: 'place-main', type: 'button', onclick: () => startNavigation(p) },
      placeChip(p, i),
      h('span', { class: 'place-text' }, h('span', { class: 'place-name' }, p.name), h('span', { class: 'place-meta' }, [awayText(p), p.label].filter(Boolean).join(' · ')))),
    side);
}

function renderPlaces() {
  $$('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mapsMode)));
  const list = places.getPlaces();
  const rows = list.map((p, i) => {
    const del = h('button', { class: 'place-side', type: 'button', 'aria-label': `Remove ${p.name}`, onclick: () => {
      if (confirm(`Remove “${p.name}” from saved places?`)) { places.removePlace(p.id); renderPlaces(); }
    } });
    setIcon(del, 'trash');
    return placeRow(p, i, del);
  });
  rows.forEach((r, i) => { r.classList.add('anim-in'); r.style.setProperty('--i', Math.min(i, 10)); });
  $('#places-list').replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, 'No saved places yet. Search above and tap + to save one. Name it “Home” or “University” to get the matching icon.')]));
}

$$('.seg button').forEach((b) => b.addEventListener('click', () => {
  settings.mapsMode = b.dataset.mode; saveSettings(); renderPlaces();
}));

$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#search-input').value.trim();
  if (!q) return;
  $('#search-input').blur();
  $('#results-block').hidden = false;
  $('#results-list').replaceChildren(h('div', { class: 'empty' }, 'Searching…'));
  try {
    const res = DEMO ? DEMO_PLACES.map((p) => ({ ...p, name: `${q} — ${p.name}` })) : await geocode(q, gps.position);
    const rows = res.map((r, i) => {
      const save = h('button', { class: 'place-side save', type: 'button', 'aria-label': `Save ${r.name}`, onclick: () => {
        const name = prompt('Name this place (e.g. Home, University)', r.name);
        if (name === null) return;
        places.savePlace({ ...r, name: name.trim() || r.name });
        toast('Saved', 1200); renderPlaces();
      } });
      setIcon(save, 'plus');
      const row = placeRow(r, i, save);
      row.classList.add('anim-in'); row.style.setProperty('--i', Math.min(i, 10));
      return row;
    });
    $('#results-list').replaceChildren(...(rows.length ? rows : [h('div', { class: 'empty' }, 'Nothing found. Try adding the city name.')]));
  } catch (err) {
    $('#results-list').replaceChildren(h('div', { class: 'empty' }, err.message));
  }
});
$('#btn-clear').addEventListener('click', () => {
  $('#results-block').hidden = true; $('#search-input').value = '';
});

// ---------------------------------------------------------------- navigation
function speak(text) {
  if (!settings.voice || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = 1.05; u.volume = 1;
  speechSynthesis.speak(u);
}
function applyVoice() {
  $('#btn-voice').setAttribute('aria-pressed', String(settings.voice));
  setIcon($('#voice-icon'), settings.voice ? 'volume' : 'volumeOff');
}
$('#btn-voice').addEventListener('click', () => {
  settings.voice = !settings.voice; saveSettings(); applyVoice();
  if (settings.voice) speak('Voice on');
});
$('#btn-recenter').addEventListener('click', () => nav?.recenter());

function ensureNav() {
  if (nav) return nav;
  nav = new NavSession($('#map'), {
    onUpdate: renderNav,
    onError: (e) => toast(e.message, 4500),
    onArrive: () => {
      navigating = false;
      renderNav({ state: 'arrived' });
      setTimeout(() => { if (current === 'nav') show('dash'); }, 5000);
    },
    speak,
  });
  nav.setTheme(resolvedTheme());
  nav.setSaver(settings.saver);
  return nav;
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
  if (s.instruction !== renderNav.last) { renderNav.last = s.instruction; replay($('.turn'), 'bump'); }
  setTurn(icon, rot, shortDist(s.toTurn), s.instruction);
  $('#nav-eta').textContent = fmtClock(new Date(Date.now() + s.remainingTime * 1000));
  $('#nav-time').textContent = fmtMinutes(s.remainingTime);
  const d = distParts(s.remaining);
  $('#nav-dist').textContent = `${d.v} ${d.u}`;
}

async function startNavigation(place) {
  if (settings.mapsMode === 'apple') {
    window.open(`https://maps.apple.com/?daddr=${place.lat},${place.lng}&dirflg=d`, '_blank');
    return;
  }
  destName = place.name;
  $('#nav-dest').textContent = `to ${place.name}`;
  $('#nav-eta').textContent = '--:--'; $('#nav-time').textContent = '–'; $('#nav-dist').textContent = '–';
  show('nav');
  ensureNav();
  navigating = true;
  speechUnlock();
  if (DEMO) {
    await nav.start(place, null, accent());
    nav._setRoute(demoRoute());
    nav.update(gps.position, 5);
  } else {
    await nav.start(place, gps.position, accent());
  }
}
$('#btn-nav-end').addEventListener('click', () => {
  navigating = false; nav?.stop(); speechSynthesis?.cancel(); show('dash');
});

// iOS only lets speech start from a tap; prime it once.
let speechReady = false;
function speechUnlock() {
  if (speechReady || !('speechSynthesis' in window)) return;
  speechReady = true;
  speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}
document.addEventListener('pointerdown', speechUnlock, { once: true, passive: true });

// ---------------------------------------------------------------- music
function setPlaying(on) { document.body.dataset.playing = String(!!on); }
let lastArt = '';
let nowUri = '';
function renderMusic(p) {
  const item = p?.item;
  const key = item ? `${item.uri || ''}|${item.name}` : '';
  if (key !== renderMusic.key) {
    if (renderMusic.key !== undefined) $$('.music, .mini-music').forEach((el) => replay(el, 'swap'));
    renderMusic.key = key;
  }
  if ((item?.uri || '') !== nowUri) { nowUri = item?.uri || ''; liked.markCurrent(); }
  const set = (key, v) => $$(`[data-music="${key}"]`).forEach((el) => { el.textContent = v; });
  if (!item) {
    set('title', 'Nothing playing'); set('artist', 'Pick something in Spotify'); set('status', 'IDLE');
    setPlaying(false);
  } else {
    set('title', item.name);
    set('artist', item.artists?.map((a) => a.name).join(', ') || item.show?.name || '');
    set('status', p.is_playing ? 'NOW PLAYING' : 'PAUSED');
    setPlaying(p.is_playing);
  }
  const imgs = item?.album?.images || item?.images || [];
  const art = (imgs[imgs.length > 1 ? imgs.length - 2 : 0] || {}).url || '';   // medium size, not the 640px one
  if (art !== lastArt) {
    lastArt = art;
    $$('[data-music="img"]').forEach((img) => { img.hidden = !art; if (art) img.src = art; else img.removeAttribute('src'); });
  }
}

function handleSpotifyError(e, quiet = false) {
  if (e instanceof AuthError || e.name === 'AuthError') { show('login'); showLoginError(e.message); return; }
  if (!quiet || e.code === 'NO_DEVICE') toast(e.message, 3500);
}

/** Polls Spotify only while a screen that shows music is visible. Slower when paused or in saver mode. */
const music = {
  timer: null,
  playing: false,
  kick() { clearTimeout(this.timer); this.tick(); },
  interval() {
    if (settings.saver) return 15000;
    return this.playing ? 5000 : 12000;
  },
  async tick() {
    clearTimeout(this.timer);
    const visible = document.visibilityState === 'visible' && (current === 'dash' || current === 'nav' || current === 'music');
    if (!visible || !spotify.isLoggedIn()) return; // restarted by show() / visibilitychange
    try {
      const p = await spotify.getPlayer();
      this.playing = !!p?.is_playing;
      renderMusic(p);
    } catch (e) { handleSpotifyError(e, true); }
    this.timer = setTimeout(() => this.tick(), this.interval());
  },
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') music.kick(); else clearTimeout(music.timer);
});

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const action = b.dataset.action;
  try {
    if (action === 'toggle') {
      const playing = document.body.dataset.playing === 'true';
      setPlaying(!playing); // optimistic
      await (playing ? spotify.pause() : spotify.play());
    } else if (action === 'next') await spotify.next();
    else if (action === 'prev') await spotify.previous();
    setTimeout(() => music.kick(), 700);
  } catch (err) {
    handleSpotifyError(err);
    music.kick();
  }
});

// ---------------------------------------------------------------- liked songs
const fmtTrackTime = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

const liked = {
  tracks: [],
  total: null,
  next: true,
  loading: false,
  loadedAt: 0,
  observer: null,

  open() {
    // Re-use the list for 5 min; reopening is instant and costs no network.
    if (this.tracks.length && Date.now() - this.loadedAt < 5 * 60 * 1000) { this.shown = 0; this.render(); return; }
    this.tracks = []; this.total = null; this.next = true; this.shown = 0;
    $('#liked-list').replaceChildren(h('div', { class: 'liked-msg' }, 'Loading your Liked Songs…'));
    $('#liked-count').textContent = 'Loading…';
    this.loadMore();
  },

  async loadMore() {
    if (this.loading || !this.next) return;
    this.loading = true;
    try {
      const page = await spotify.getLiked(this.tracks.length, 50);
      const items = (page?.items || []).map((x) => x.track).filter((t) => t && t.uri && !t.is_local);
      this.tracks.push(...items);
      this.total = page?.total ?? this.tracks.length;
      this.next = !!page?.next;
      this.loadedAt = Date.now();
      this.render();
    } catch (e) {
      this.showError(e);
    } finally {
      this.loading = false;
    }
  },

  showError(e) {
    if (e instanceof AuthError || e.name === 'AuthError') { handleSpotifyError(e); return; }
    const box = h('div', { class: 'liked-msg' }, e.message);
    if (e.code === 'SCOPE') {
      box.append(h('button', { class: 'btn-play', type: 'button', onclick: () => { spotify.logout(); spotify.login().catch((err) => toast(err.message)); } }, 'Reconnect Spotify'));
    } else {
      box.append(h('button', { class: 'btn-secondary', type: 'button', onclick: () => { this.loadedAt = 0; this.open(); } }, 'Try again'));
    }
    $('#liked-list').replaceChildren(box);
    $('#liked-count').textContent = '';
  },

  row(t, i) {
    const imgs = t.album?.images || [];
    const small = imgs[imgs.length - 1]?.url;          // smallest (~64 px) — light on data and memory
    const art = h('span', { class: 'song-art' });
    if (small && !settings.saver) art.append(h('img', { src: small, alt: '', loading: 'lazy', decoding: 'async' }));
    else { const ph = h('span'); setIcon(ph, 'music'); art.append(ph); }
    const eq = h('span', { class: 'song-eq', hidden: t.uri !== nowUri }); setIcon(eq, 'eq');
    return h('button', { class: `song${t.uri === nowUri ? ' current' : ''}`, type: 'button', role: 'listitem', dataset: { uri: t.uri }, onclick: () => this.playFrom(i) },
      art,
      h('span', { class: 'song-text' }, h('span', { class: 'song-title' }, t.name), h('span', { class: 'song-artist' }, (t.artists || []).map((a) => a.name).join(', '))),
      eq,
      h('span', { class: 'song-time' }, fmtTrackTime(t.duration_ms || 0)));
  },

  render() {
    const list = $('#liked-list');
    $('#liked-count').textContent = this.total != null ? `${this.total} song${this.total === 1 ? '' : 's'}` : '';
    if (!this.tracks.length) {
      list.replaceChildren(h('div', { class: 'liked-msg' }, 'No Liked Songs yet. Tap the heart on a song in Spotify to add it.'));
      return;
    }
    const sentinel = h('div', { class: 'liked-more' });
    const from = this.shown || 0;
    const rows = this.tracks.map((t, i) => {
      const r = this.row(t, i);
      if (i >= from) { r.classList.add('anim-in'); r.style.setProperty('--i', Math.min(i - from, 12)); }
      return r;
    });
    this.shown = this.tracks.length;
    list.replaceChildren(...rows, sentinel);
    // Load the next page only when you scroll near the bottom.
    this.observer?.disconnect();
    if (this.next) {
      this.observer = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) this.loadMore(); }, { root: list, rootMargin: '300px' });
      this.observer.observe(sentinel);
    }
  },

  markCurrent() {
    $$('#liked-list .song').forEach((el) => {
      const on = el.dataset.uri === nowUri;
      el.classList.toggle('current', on);
      el.querySelector('.song-eq').hidden = !on;
    });
  },

  async play(uris) {
    if (!uris.length) return;
    try {
      setPlaying(true);
      await spotify.playTracks(uris.slice(0, 100));
      setTimeout(() => music.kick(), 700);
    } catch (e) { handleSpotifyError(e); music.kick(); }
  },

  playFrom(i) { this.play(this.tracks.slice(i).map((t) => t.uri)); },
};

$('#btn-play-all').addEventListener('click', () => liked.playFrom(0));
$('#btn-shuffle').addEventListener('click', () => {
  const uris = liked.tracks.map((t) => t.uri);
  for (let i = uris.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [uris[i], uris[j]] = [uris[j], uris[i]]; }
  liked.play(uris);
});

// ---------------------------------------------------------------- login & keys
function showLoginError(msg) { const el = $('#login-error'); el.textContent = msg; el.hidden = !msg; }
function renderLogin() {
  const k = getKeys();
  $('#key-spotify').value = k.spotifyClientId;
  $('#key-ors').value = k.orsKey;
  $('#redirect-uri').textContent = spotify.redirectUri();
  if (!k.spotifyClientId) $('#setup').open = true;
  $('#btn-login-label').textContent = spotify.isLoggedIn() ? 'Continue' : 'Log in with Spotify';
}
$('#btn-save-keys').addEventListener('click', () => {
  setKeys({ spotifyClientId: $('#key-spotify').value, orsKey: $('#key-ors').value });
  showLoginError(''); toast('Keys saved on this phone', 1600);
});
$('#btn-login').addEventListener('click', async () => {
  if (spotify.isLoggedIn()) { enterApp(); return; }
  setKeys({ spotifyClientId: $('#key-spotify').value, orsKey: $('#key-ors').value });
  try { await spotify.login(); } catch (e) { showLoginError(e.message); $('#setup').open = true; }
});
$('#btn-logout').addEventListener('click', () => {
  spotify.logout(); show('login');
});

function enterApp() {
  gps.start();
  show('dash');
}

// ---------------------------------------------------------------- boot
async function boot() {
  hydrateIcons();
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
