import { useEffect, useRef, useState } from 'react'

/** A clock that re-renders the countdowns without hammering the CPU. */
export const useNow = (intervalMs = 10_000): Date => {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs])
  return now
}

interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: string, listener: () => void) => void
}

/**
 * Keeps the screen on while a leg is running. Unsupported browsers, denied
 * permissions and backgrounded tabs all fail quietly — this is a convenience,
 * never a dependency.
 */
export const useWakeLock = (active: boolean): 'active' | 'idle' | 'unsupported' => {
  const [status, setStatus] = useState<'active' | 'idle' | 'unsupported'>('idle')
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    const wakeLock = (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<WakeLockSentinelLike> } })
      .wakeLock
    if (!wakeLock) {
      setStatus('unsupported')
      return
    }

    let cancelled = false

    const acquire = async () => {
      if (!active || document.visibilityState !== 'visible' || sentinelRef.current) return
      try {
        const sentinel = await wakeLock.request('screen')
        if (cancelled) {
          void sentinel.release()
          return
        }
        sentinelRef.current = sentinel
        setStatus('active')
        sentinel.addEventListener('release', () => {
          sentinelRef.current = null
          setStatus('idle')
        })
      } catch {
        setStatus('idle')
      }
    }

    const release = () => {
      const sentinel = sentinelRef.current
      sentinelRef.current = null
      setStatus('idle')
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined)
    }

    if (active) void acquire()
    else release()

    // iOS drops the lock whenever the app is backgrounded; take it back on return.
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && active) void acquire()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      release()
    }
  }, [active])

  return status
}

let audioContext: AudioContext | null = null

/** Two short beeps — audible over road noise, short enough not to be annoying. */
export const playAlertTone = (): void => {
  try {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    audioContext = audioContext ?? new Ctor()
    void audioContext.resume?.()
    const start = audioContext.currentTime
    for (const offset of [0, 0.28]) {
      const osc = audioContext.createOscillator()
      const gain = audioContext.createGain()
      osc.type = 'sine'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(0.35, start + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.22)
      osc.connect(gain).connect(audioContext.destination)
      osc.start(start + offset)
      osc.stop(start + offset + 0.25)
    }
  } catch {
    /* audio is a nicety, never a hard failure */
  }
}

export const vibrate = (pattern: number | number[] = [180, 90, 180]): void => {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* not supported on iOS Safari today; harmless */
  }
}
