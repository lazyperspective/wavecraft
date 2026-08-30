import type { Project } from '../domain/types'

export interface PCMSource {
  id: string
  sampleRate: number
  channels: Float32Array[]
}

const sources = new Map<string, PCMSource>()

export const sourceRepository = {
  get(id: string) { return sources.get(id) },
  set(source: PCMSource) { sources.set(source.id, source) },
  clear() { sources.clear() },
  has(id: string) { return sources.has(id) },
  list() { return [...sources.values()] },
}

const hostWindows: Array<[number, number]> = [[0.4, 4.9], [5.2, 7.15], [9.4, 13.7], [16.2, 19.4], [23.8, 27.55], [30.45, 35.7], [38.5, 42.1], [43.1, 47.3]]
const guestWindows: Array<[number, number]> = [[1.7, 3.7], [4.95, 7.1], [9.55, 14], [16.15, 20.05], [21.2, 27.5], [30.4, 36.1], [38.45, 43.05], [44.1, 47.1]]

function envelopeAt(time: number, windows: Array<[number, number]>) {
  for (const [start, end] of windows) {
    if (time >= start && time <= end) {
      const attack = Math.min(1, (time - start) / 0.045)
      const release = Math.min(1, (end - time) / 0.07)
      const phrase = 0.72 + 0.28 * Math.sin(time * 5.7) ** 2
      return Math.max(0, Math.min(attack, release)) * phrase
    }
  }
  return 0
}

function createDialogue(duration: number, sampleRate: number, role: 'host' | 'guest') {
  const data = new Float32Array(Math.ceil(duration * sampleRate))
  let random = role === 'host' ? 0x92ab31 : 0x47ce19
  const windows = role === 'host' ? hostWindows : guestWindows
  const base = role === 'host' ? 118 : 172
  const amplitude = role === 'host' ? 0.54 : 0.36
  for (let index = 0; index < data.length; index += 1) {
    random ^= random << 13; random ^= random >>> 17; random ^= random << 5
    const noise = ((random >>> 0) / 0xffffffff) * 2 - 1
    const time = index / sampleRate
    const env = envelopeAt(time, windows)
    if (env === 0) {
      data[index] = noise * 0.0018
      continue
    }
    const pitch = base + 9 * Math.sin(time * 2.2) + 4 * Math.sin(time * 6.1)
    const voiced = Math.sin(2 * Math.PI * pitch * time) * 0.54
      + Math.sin(2 * Math.PI * pitch * 2.01 * time) * 0.26
      + Math.sin(2 * Math.PI * pitch * 3.03 * time) * 0.12
    const consonants = noise * (0.08 + 0.08 * Math.sin(time * 17) ** 12)
    data[index] = Math.tanh((voiced + consonants) * env * amplitude * 1.8)
  }
  if (role === 'host') {
    const spike = Math.floor(32.82 * sampleRate)
    for (let index = spike; index < spike + 18 && index < data.length; index += 1) data[index] = index % 2 ? -1 : 1
  }
  return data
}

function createRoomTone(duration: number, sampleRate: number) {
  const data = new Float32Array(Math.ceil(duration * sampleRate))
  let random = 0x6d2b79f5
  let low = 0
  for (let index = 0; index < data.length; index += 1) {
    random ^= random << 13; random ^= random >>> 17; random ^= random << 5
    const noise = ((random >>> 0) / 0xffffffff) * 2 - 1
    low = low * 0.997 + noise * 0.003
    const time = index / sampleRate
    data[index] = low * 0.14 + Math.sin(2 * Math.PI * 60 * time) * 0.004
  }
  return data
}

export function ensureDemoSources(project: Project) {
  if (sourceRepository.has('source_host')) return
  const sampleRate = project.sampleRate
  sourceRepository.set({ id: 'source_host', sampleRate, channels: [createDialogue(48, sampleRate, 'host')] })
  sourceRepository.set({ id: 'source_guest', sampleRate, channels: [createDialogue(48, sampleRate, 'guest')] })
  sourceRepository.set({ id: 'source_room', sampleRate, channels: [createRoomTone(48, sampleRate)] })
}

export function getPeaks(sourceId: string, sourceStart: number, duration: number, bucketCount: number): Float32Array {
  const source = sourceRepository.get(sourceId)
  const peaks = new Float32Array(Math.max(1, bucketCount) * 2)
  if (!source) return peaks
  const data = source.channels[0]
  const first = Math.floor(sourceStart * source.sampleRate)
  const last = Math.min(data.length, Math.ceil((sourceStart + duration) * source.sampleRate))
  const stride = Math.max(1, Math.floor((last - first) / bucketCount))
  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    let min = 0
    let max = 0
    const bucketStart = first + bucket * stride
    const bucketEnd = Math.min(last, bucketStart + stride)
    for (let sample = bucketStart; sample < bucketEnd; sample += Math.max(1, Math.floor(stride / 48))) {
      min = Math.min(min, data[sample] ?? 0)
      max = Math.max(max, data[sample] ?? 0)
    }
    peaks[bucket * 2] = min
    peaks[bucket * 2 + 1] = max
  }
  return peaks
}
