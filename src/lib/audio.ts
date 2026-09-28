/**
 * Fully procedural soundscape — no audio assets, everything is synthesised
 * with the WebAudio API so the bundle stays tiny.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let padGain: GainNode | null = null
let started = false
let muted = false

const SCALE = [0, 2, 3, 7, 9, 12, 14, 15, 19, 21] // pentatonic-ish, always pleasant

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = muted ? 0 : 0.6
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

export function isMuted() {
  return muted
}

export function setMuted(next: boolean) {
  muted = next
  if (master && ctx) master.gain.setTargetAtTime(next ? 0 : 0.6, ctx.currentTime, 0.2)
}

/** Deep, slow evolving drone that gives the "deep space" feeling. */
export function startAmbient() {
  const ac = ensure()
  if (!ac || !master || started) return
  started = true

  padGain = ac.createGain()
  padGain.gain.value = 0
  padGain.connect(master)
  padGain.gain.setTargetAtTime(0.16, ac.currentTime, 6)

  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 520
  filter.Q.value = 0.8
  filter.connect(padGain)

  const roots = [55, 82.4, 110, 164.8] // A1 / E2 / A2 / E3
  roots.forEach((freq, i) => {
    const osc = ac.createOscillator()
    osc.type = i % 2 ? 'sine' : 'triangle'
    osc.frequency.value = freq
    const g = ac.createGain()
    g.gain.value = 0.22 / (i + 1)
    const lfo = ac.createOscillator()
    lfo.frequency.value = 0.03 + i * 0.017
    const lfoGain = ac.createGain()
    lfoGain.gain.value = freq * 0.006
    lfo.connect(lfoGain).connect(osc.frequency)
    osc.connect(g).connect(filter)
    osc.start()
    lfo.start()
  })

  // sparse, random "twinkle" notes far away
  const twinkle = () => {
    if (!ctx || !padGain) return
    const t = setTimeout(twinkle, 4000 + Math.random() * 11000)
    void t
    if (muted) return
    const semi = SCALE[Math.floor(Math.random() * SCALE.length)]
    ping(220 * Math.pow(2, semi / 12), 0.05, 2.6)
  }
  twinkle()
}

/**
 * Soft bell / ping used for every interaction.
 * @param freq base frequency
 * @param vol  0..1
 * @param dur  seconds
 */
export function ping(freq = 880, vol = 0.14, dur = 1.1, type: OscillatorType = 'sine') {
  const ac = ensure()
  if (!ac || !master || muted) return
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, ac.currentTime)
  g.gain.linearRampToValueAtTime(vol, ac.currentTime + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur)
  osc.connect(g).connect(master)
  osc.start()
  osc.stop(ac.currentTime + dur + 0.05)
}

export const sfx = {
  hover: () => ping(1320, 0.035, 0.5),
  click: () => ping(660, 0.09, 0.7),
  land: () => {
    ping(392, 0.1, 1.4)
    ping(587.3, 0.06, 1.1)
  },
  launch: () => {
    ping(261.6, 0.09, 1.6)
    setTimeout(() => ping(880, 0.05, 0.9), 90)
  },
  like: () => ping(1046.5, 0.1, 0.6),
  signal: () => {
    ping(783.99, 0.08, 0.8)
    setTimeout(() => ping(1174.66, 0.06, 0.9), 110)
  },
  supernova: () => {
    ;[523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) =>
      setTimeout(() => ping(f, 0.14, 2.4, 'triangle'), i * 120),
    )
  },
}

export function resumeAudio() {
  ensure()
}
