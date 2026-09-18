// The data layer. Everything the UI knows about the creature's brain goes
// through here, so there is exactly one place that knows the contract
// (../../../../contract/openapi.yaml).
//
// Which brain answers is decided here too, and only here:
//
//   mock  fixtures recorded from a real brain, replayed in the browser.
//         No server, no network, no tokens. This is the default, so a
//         misconfigured deploy costs nothing instead of costing money.
//   live  an actual bicho over HTTP. Costs tokens if it is the real one.
//
// The choice is a transport, never a flag the server reads: if the client
// could tell the server "this one is free", that would be the bug a stranger
// eventually finds.
import * as live from './live'
import * as mock from './mock'

const STORAGE_KEY = 'bicho:api'
const VALID = ['mock', 'live']

// Reading ?api= happens once, at load, and sticks. Arnau opens
// <preview-url>?api=live when Carlos has the real brain up, and every later
// reload stays there until he asks for ?api=mock again.
function chooseSource() {
  let requested = null
  try {
    requested = new URLSearchParams(window.location.search).get('api')
  } catch {
    // no window (tests, SSR): fall through to the default
  }
  if (VALID.includes(requested)) {
    try {
      localStorage.setItem(STORAGE_KEY, requested)
    } catch {
      // private mode: the choice just does not survive the reload
    }
    return requested
  }
  try {
    const remembered = localStorage.getItem(STORAGE_KEY)
    if (VALID.includes(remembered)) return remembered
  } catch {
    // same
  }
  return VALID.includes(import.meta.env.VITE_BICHO_API)
    ? import.meta.env.VITE_BICHO_API
    : 'mock'
}

export const source = chooseSource()

const adapter = source === 'live' ? live : mock

// The four calls of the contract, plus /health. Same signatures either way.
export const health = adapter.health
export const learned = adapter.learned
export const study = adapter.study
export const progress = adapter.progress
export const ask = adapter.ask

export { ApiError } from './error'
