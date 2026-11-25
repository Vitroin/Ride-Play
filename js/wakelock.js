// Keep the screen on only while it's useful (riding / navigating).
// Releasing it otherwise is the single biggest battery win we control.
let lock = null;
let wanted = false;

async function acquire() {
  if (!wanted || lock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try {
    lock = await navigator.wakeLock.request('screen');
    lock.addEventListener('release', () => { lock = null; });
  } catch { /* needs a user gesture on some iOS versions — retried on next tap */ }
}

export function setAwake(on) {
  wanted = on;
  if (on) acquire();
  else if (lock) { lock.release().catch(() => {}); lock = null; }
}

export const isAwake = () => !!lock;

document.addEventListener('visibilitychange', acquire);
document.addEventListener('pointerdown', acquire, { passive: true });
