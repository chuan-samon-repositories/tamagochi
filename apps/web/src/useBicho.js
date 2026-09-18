// Everything the UI needs from the brain, in one hook. The adapter underneath
// (mock or live) is chosen in ./api and nothing here knows which one it got.
import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api'

const POLL_MS = 600
const FINISHED = ['done', 'error', 'idle']

export function useBicho() {
  const [docs, setDocs] = useState([])
  const [exchange, setExchange] = useState(null) // { question, text, knows }
  const [asking, setAsking] = useState(false)
  const [progress, setProgress] = useState(null) // the contract's Progress
  const [error, setError] = useState(null)
  const pollRef = useRef(null)

  const refresh = useCallback(async () => {
    try {
      setDocs(await api.learned())
    } catch {
      // A brain we cannot list is not worth an error banner: asking it
      // something will say so far more clearly.
    }
  }, [])

  useEffect(() => {
    // Loading what the creature already knows is exactly what an effect is
    // for: it synchronises with the brain, which is an external system.
    // eslint-disable-next-line react/set-state-in-effect
    refresh()
    return () => clearTimeout(pollRef.current)
  }, [refresh])

  const ask = useCallback(async (question) => {
    setAsking(true)
    setError(null)
    try {
      const { knows, text } = await api.ask(question)
      setExchange({ question, text, knows })
    } catch (e) {
      setExchange(null)
      setError(e)
    } finally {
      setAsking(false)
    }
  }, [])

  // One poll chained to the previous answer rather than an interval: a slow
  // brain must not end up with a queue of requests behind it.
  const poll = useCallback(() => {
    clearTimeout(pollRef.current)
    const tick = async () => {
      try {
        const state = await api.progress()
        setProgress(state)
        if (FINISHED.includes(state.state)) {
          if (state.state === 'done') refresh()
          return
        }
      } catch (e) {
        setError(e)
        return
      }
      pollRef.current = setTimeout(tick, POLL_MS)
    }
    tick()
  }, [refresh])

  const study = useCallback(async (title, text) => {
    setError(null)
    setProgress({ state: 'reading', read: 0, total: 0 })
    try {
      await api.study(title, text)
    } catch (e) {
      setProgress(null)
      setError(e)
      throw e
    }
    poll()
  }, [poll])

  const dismiss = useCallback(() => {
    setExchange(null)
    setError(null)
  }, [])

  return { docs, exchange, asking, progress, error, ask, study, refresh, dismiss }
}
