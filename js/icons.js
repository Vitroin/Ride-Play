// Inline stroke icons (24×24). Static, trusted strings — safe for innerHTML.
const S = (body, fill = false) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" ${fill
    ? 'fill="currentColor" stroke="none"'
    : 'fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;

export const ICONS = {
  moto: S('<circle cx="5" cy="16" r="3.2"/><circle cx="19" cy="16" r="3.2"/><path d="M5 16h4.5l3.5-6h4l2 6"/><path d="M13 10l-1.5-3H8.5"/><path d="M15.5 6.5h2.5l1 3.5"/>'),
  gauge: S('<path d="M4.5 18a9 9 0 1 1 15 0"/><path d="M12 13l4-4"/><circle cx="12" cy="13" r="1.4"/>'),
  route: S('<circle cx="6" cy="19" r="2.2"/><circle cx="18" cy="5" r="2.2"/><path d="M8.2 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8"/>'),
  timer: S('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2"/><path d="M9.5 2.5h5"/>'),
  avg: S('<path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/>'),
  peak: S('<path d="M3 20l6.5-11 4 6 2.5-4L21 20z"/><path d="M9.5 9V4.5l3 1.5-3 1.5"/>'),
  music: S('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  check: S('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  info: S('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.4"/>'),
  key: S('<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2L19 4M16 7l2.5 2.5M14 9l2 2"/>'),
  satellite: S('<path d="M13 7l4 4-6 6-4-4z"/><path d="M15 5l2-2 4 4-2 2M5 15l-2 2 4 4 2-2"/><path d="M15.5 17.5a4 4 0 0 0 2-2M17 21a7.5 7.5 0 0 0 4-4"/>'),
  clock: S('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  settings: S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  flag: S('<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'),
  sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: S('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
  auto: S('<circle cx="12" cy="12" r="9"/><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/>'),
  leaf: S('<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19l7-7"/>'),
  play: S('<path d="M7 4.5v15l13-7.5z"/>', true),
  pause: S('<rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/>', true),
  prev: S('<path d="M19 5v14L9 12z"/><rect x="5" y="5" width="3" height="14" rx="1"/>', true),
  next: S('<path d="M5 5v14l10-7z"/><rect x="16" y="5" width="3" height="14" rx="1"/>', true),
  back: S('<path d="M15 5l-7 7 7 7"/>'),
  chevron: S('<path d="M9 5l7 7-7 7"/>'),
  search: S('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
  external: S('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  star: S('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>'),
  logout: S('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  trash: S('<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  plus: S('<path d="M12 5v14M5 12h14"/>'),
  volume: S('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>'),
  volumeOff: S('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>'),
  crosshair: S('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'),
  arrow: S('<path d="M12 20V5"/><path d="M6 11l6-6 6 6"/>'),
  roundabout: S('<circle cx="12" cy="10" r="4.5"/><path d="M12 14.5V21"/><path d="M15.5 7l3-3M16 4h2.5v2.5"/>'),
  uturn: S('<path d="M8 20V9a4 4 0 0 1 8 0v4"/><path d="M12.5 10l3.5 3.5 3.5-3.5"/>'),
  pin: S('<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>'),
  home: S('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
  cap: S('<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c2 2 10 2 12 0v-5"/><path d="M22 9v5"/>'),
  work: S('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>'),
  fuel: S('<path d="M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10"/><path d="M14 8l3 3v6a1.5 1.5 0 0 0 3 0V9l-3-3"/>'),
  coffee: S('<path d="M4 8h13v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 2.5v2.5M12 2.5v2.5"/>'),
  wrench: S('<path d="M14.5 6.5a4 4 0 0 0 5 5l-9 9a2.1 2.1 0 0 1-3-3l9-9a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z"/>'),
  heart: S('<path d="M12 20.5s-8-4.7-8-10.5a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 10.5-8 10.5z"/>', true),
  shuffle: S('<path d="M16 4h4v4M4 20L20 4M20 16v4h-4M14.5 14.5L20 20M4 4l5 5"/>'),
  eq: S('<rect x="4" y="10" width="3" height="10" rx="1"/><rect x="10.5" y="4" width="3" height="16" rx="1"/><rect x="17" y="13" width="3" height="7" rx="1"/>', true),
  goal: S('<path d="M5 21V4"/><path d="M5 4h7v3h7v8h-7v-3H5"/>'),
};

export const icon = (name) => ICONS[name] || ICONS.pin;

/** Fill every [data-icon] placeholder under root. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.dataset.iconDone === el.dataset.icon) return;
    el.innerHTML = icon(el.dataset.icon);
    el.dataset.iconDone = el.dataset.icon;
  });
}

export function setIcon(el, name) {
  el.dataset.icon = name;
  el.innerHTML = icon(name);
  el.dataset.iconDone = name;
}

/** Pick an icon for a saved place from its name. */
export function placeIcon(name = '') {
  const n = name.toLowerCase();
  if (/home|house|بيت/.test(n)) return 'home';
  if (/uni|college|school|campus|faculty|جامعة/.test(n)) return 'cap';
  if (/work|office|company/.test(n)) return 'work';
  if (/gas|fuel|petrol|station|بنزين/.test(n)) return 'fuel';
  if (/caf|coffee|قهوة/.test(n)) return 'coffee';
  if (/garage|mechanic|service|repair|shop/.test(n)) return 'wrench';
  return 'pin';
}

export const PLACE_COLORS = ['c-orange', 'c-cyan', 'c-lime', 'c-magenta', 'c-yellow'];

/** ORS step type → [icon, rotation in degrees]. */
export function turnIcon(type) {
  switch (type) {
    case 0: return ['arrow', -90];   // left
    case 1: return ['arrow', 90];    // right
    case 2: return ['arrow', -135];  // sharp left
    case 3: return ['arrow', 135];   // sharp right
    case 4: return ['arrow', -45];   // slight left
    case 5: return ['arrow', 45];    // slight right
    case 7: case 8: return ['roundabout', 0];
    case 9: return ['uturn', 0];
    case 10: return ['goal', 0];
    case 12: return ['arrow', -25];  // keep left
    case 13: return ['arrow', 25];   // keep right
    default: return ['arrow', 0];    // straight / depart
  }
}
