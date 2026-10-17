// Catalyst's free tier counts every Data Store query (10,000/month), so background polling only
// runs while the tab is visible AND the user touched it in the last 5 minutes.
const IDLE_MS = 5 * 60 * 1000
let last = Date.now()

function mark() {
  const wasIdle = Date.now() - last > IDLE_MS
  last = Date.now()
  if (wasIdle) window.dispatchEvent(new Event('cs:resume'))
}
// Capture phase: scroll doesn't bubble, and chat/list panes scroll inside their own containers.
for (const e of ['pointerdown', 'pointermove', 'keydown', 'scroll']) window.addEventListener(e, mark, { passive: true, capture: true })

export const canPoll = () => document.visibilityState === 'visible' && Date.now() - last < IDLE_MS

// Calls fn when the user comes back (tab shown, window focused, or active again after idle).
// Tab-show fires visibilitychange and focus together, so repeat calls within 2s are dropped.
export function onWake(fn) {
  let at = 0
  const wake = () => {
    if (document.visibilityState !== 'visible' || Date.now() - at < 2000) return
    at = Date.now()
    fn()
  }
  document.addEventListener('visibilitychange', wake)
  window.addEventListener('focus', wake)
  window.addEventListener('cs:resume', wake)
  return () => {
    document.removeEventListener('visibilitychange', wake)
    window.removeEventListener('focus', wake)
    window.removeEventListener('cs:resume', wake)
  }
}
