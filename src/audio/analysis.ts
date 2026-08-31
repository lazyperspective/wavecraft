import type { AnalysisSummary, Project, SilenceRange, Track } from '../domain/types'
import { sourceRepository } from './sourceRepository'

const db = (value: number) => value > 0 ? 20 * Math.log10(value) : -120
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && aEnd > bStart

function amplitudeAt(track: Track, projectTime: number) {
  for (const clip of track.clips) {
    if (projectTime < clip.timelineStart || projectTime >= clip.timelineStart + clip.duration) continue
    const source = sourceRepository.get(clip.sourceId)
    if (!source) continue
    const clipTime = projectTime - clip.timelineStart
    const sourceIndex = Math.floor((clip.sourceStart + clipTime * clip.speed) * source.sampleRate)
    const radius = Math.max(1, Math.floor(source.sampleRate * 0.006))
    let peak = 0
    for (let index = Math.max(0, sourceIndex - radius); index < Math.min(source.channels[0].length, sourceIndex + radius); index += 24) peak = Math.max(peak, Math.abs(source.channels[0][index]))
    return peak * 10 ** ((track.gainDb + clip.gainDb) / 20)
  }
  return 0
}

function detectDialogueSilence(project: Project): SilenceRange[] {
  const dialogue = project.tracks.filter((track) => track.role === 'dialogue' && !track.muted)
  if (!dialogue.length) return []
  const step = 0.04
  const threshold = 0.009
  const raw: Array<{ start: number; end: number }> = []
  let silenceStart: number | null = null
  for (let time = 0; time <= project.duration + step / 2; time += step) {
    const active = Math.max(...dialogue.map((track) => amplitudeAt(track, time))) >= threshold
    if (!active && silenceStart === null) silenceStart = time
    if ((active || time >= project.duration) && silenceStart !== null) {
      const end = Math.min(time, project.duration)
      if (end - silenceStart >= 0.72) raw.push({ start: silenceStart, end })
      silenceStart = null
    }
  }
  return raw.map((range, index) => {
    const locked = project.locks.some((lock) => lock.kind === 'range' && lock.start !== undefined && lock.end !== undefined && overlaps(range.start, range.end, lock.start, lock.end))
    const start = Math.round(range.start * 1000) / 1000
    const end = Math.round(range.end * 1000) / 1000
    return { id: locked ? `pause_locked_${index + 1}` : `silence_${index + 1}`, trackId: 'dialogue_bus', start, end, duration: Math.round((end - start) * 1000) / 1000, confidence: locked ? 0.9 : 0.97, kind: locked ? 'dramatic_pause' : 'silence' }
  })
}

export interface ClippingRange {
  start: number
  end: number
  trackId: string
  peakDb: number
  samples: number
}

export function analyzeTrackLevel(project: Project, track: Track) {
  if (track.muted) return -120
  let squareSum = 0
  let sampleCount = 0
  for (const clip of track.clips) {
    const source = sourceRepository.get(clip.sourceId)
    if (!source) continue
    const gain = 10 ** ((track.gainDb + clip.gainDb) / 20)
    const first = Math.floor(clip.sourceStart * source.sampleRate)
    const last = Math.min(source.channels[0].length, Math.ceil((clip.sourceStart + clip.duration * clip.speed) * source.sampleRate))
    for (let index = first; index < last; index += 8) {
      const sample = source.channels[0][index] * gain
      squareSum += sample * sample
      sampleCount += 1
    }
  }
  return Math.round(db(Math.sqrt(squareSum / Math.max(1, sampleCount))) * 10) / 10
}

export function detectProjectClipping(project: Project): ClippingRange[] {
  const ranges: ClippingRange[] = []
  for (const track of project.tracks) {
    if (track.muted) continue
    for (const clip of track.clips) {
      const source = sourceRepository.get(clip.sourceId)
      if (!source) continue
      const gain = 10 ** ((track.gainDb + clip.gainDb) / 20)
      const first = Math.floor(clip.sourceStart * source.sampleRate)
      const last = Math.min(source.channels[0].length, Math.ceil((clip.sourceStart + clip.duration * clip.speed) * source.sampleRate))
      let current: ClippingRange | null = null
      for (let index = first; index < last; index += 8) {
        const absolute = Math.abs(source.channels[0][index] * gain)
        if (absolute < 0.999) continue
        const time = clip.timelineStart + (index / source.sampleRate - clip.sourceStart) / clip.speed
        if (!current || time - current.end > 0.02) {
          current = { start: time, end: time + 8 / source.sampleRate, trackId: track.id, peakDb: db(absolute), samples: 8 }
          ranges.push(current)
        } else {
          current.end = time + 8 / source.sampleRate
          current.peakDb = Math.max(current.peakDb, db(absolute))
          current.samples += 8
        }
      }
    }
  }
  return ranges.sort((a, b) => a.start - b.start).map((range) => ({ ...range, start: Math.round(range.start * 1_000_000) / 1_000_000, end: Math.round(range.end * 1_000_000) / 1_000_000, peakDb: Math.round(range.peakDb * 10) / 10 }))
}

export function analyzeProjectAudio(project: Project): AnalysisSummary {
  let peak = 0
  let squareSum = 0
  let sampleCount = 0
  for (const track of project.tracks) {
    if (track.muted) continue
    const gain = 10 ** (track.gainDb / 20)
    for (const clip of track.clips) {
      const source = sourceRepository.get(clip.sourceId)
      if (!source) continue
      const clipGain = gain * 10 ** (clip.gainDb / 20)
      const data = source.channels[0]
      const first = Math.floor(clip.sourceStart * source.sampleRate)
      const last = Math.min(data.length, Math.ceil((clip.sourceStart + clip.duration * clip.speed) * source.sampleRate))
      for (let index = first; index < last; index += 8) {
        const sample = data[index] * clipGain
        const absolute = Math.abs(sample)
        peak = Math.max(peak, absolute)
        squareSum += sample * sample
        sampleCount += 1
      }
    }
  }
  const rms = Math.sqrt(squareSum / Math.max(1, sampleCount))
  const silence = detectDialogueSilence(project)
  const clippingCount = detectProjectClipping(project).reduce((sum, range) => sum + range.samples, 0)
  const removable = silence.filter((range) => range.kind === 'silence' && range.duration >= 1.5)
  const host = project.tracks.find((track) => track.id === 'track_host')
  const guest = project.tracks.find((track) => track.id === 'track_guest')
  const gap = host && guest ? Math.abs(host.gainDb - guest.gainDb) : 0
  return {
    peakDb: Math.round(db(peak) * 10) / 10,
    rmsDb: Math.round(db(rms) * 10) / 10,
    dynamicRangeDb: Math.round((db(peak) - db(rms)) * 10) / 10,
    clippingCount,
    silence,
    notes: [
      ...(host && guest ? [`${guest.name} averages about ${gap.toFixed(1)} dB below ${host.name}`] : []),
      ...(clippingCount ? [`${clippingCount} clipped source samples detected`] : []),
      `${removable.length} removable pauses exceed 1.5 seconds`,
    ],
  }
}
