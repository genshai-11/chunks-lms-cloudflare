import type { ResultColor } from '../modules/result-lifecycle/types'

const EXISTING_RESULT_AUDIO: Record<ResultColor, string> = {
  red: '/audio/red.wav',
  orange: '/audio/yellow.wav',
  yellow: '/audio/yellow.wav',
  green: '/audio/green.wav',
  blue: '/audio/green.wav',
  indigo: '/audio/purple.wav',
  purple: '/audio/purple.wav',
}

const TONE_FREQUENCY: Record<ResultColor, number> = {
  red: 196,
  orange: 247,
  yellow: 294,
  green: 392,
  blue: 494,
  indigo: 587,
  purple: 784,
}

export function resultAudioUrl(color: ResultColor): string {
  return EXISTING_RESULT_AUDIO[color]
}

export function playColorClick(color: ResultColor): void {
  if (typeof window === 'undefined') return
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) return
  try {
    const ctx = new AudioContextCtor()
    const gain = ctx.createGain()
    const osc = ctx.createOscillator()
    const now = ctx.currentTime
    osc.type = 'sine'
    osc.frequency.setValueAtTime(TONE_FREQUENCY[color], now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.14)
    window.setTimeout(() => void ctx.close().catch(() => undefined), 180)
  } catch (e) {
    console.warn('[audio] color tone failed:', e)
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
