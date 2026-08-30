import type { Project } from '../domain/types'
import { sourceRepository } from './sourceRepository'

const dbToGain = (db: number) => 10 ** (db / 20)

export interface RenderedMix {
  sampleRate: number
  left: Float32Array
  right: Float32Array
}

export function renderProject(project: Project, range: { start: number; end: number } = { start: 0, end: project.duration }): RenderedMix {
  const sampleRate = project.sampleRate
  const duration = Math.max(0, range.end - range.start)
  const length = Math.ceil(duration * sampleRate)
  const left = new Float32Array(length)
  const right = new Float32Array(length)
  const hasSolo = project.tracks.some((track) => track.solo)

  for (const track of project.tracks) {
    if (track.muted || (hasSolo && !track.solo)) continue
    const pan = Math.max(-1, Math.min(1, track.pan))
    const leftPan = Math.cos((pan + 1) * Math.PI / 4)
    const rightPan = Math.sin((pan + 1) * Math.PI / 4)
    for (const clip of track.clips) {
      const source = sourceRepository.get(clip.sourceId)
      if (!source) continue
      const clipEnd = clip.timelineStart + clip.duration
      const visibleStart = Math.max(range.start, clip.timelineStart)
      const visibleEnd = Math.min(range.end, clipEnd)
      if (visibleEnd <= visibleStart) continue
      const gain = dbToGain(track.gainDb + clip.gainDb)
      const mono = source.channels[0]
      for (let outputIndex = Math.floor((visibleStart - range.start) * sampleRate); outputIndex < Math.ceil((visibleEnd - range.start) * sampleRate) && outputIndex < length; outputIndex += 1) {
        const timelineTime = range.start + outputIndex / sampleRate
        const clipTime = timelineTime - clip.timelineStart
        const sourceIndex = Math.floor((clip.sourceStart + clipTime * clip.speed) * source.sampleRate)
        if (sourceIndex < 0 || sourceIndex >= mono.length) continue
        const fadeIn = clip.fadeIn > 0 ? Math.min(1, clipTime / clip.fadeIn) : 1
        const fadeOut = clip.fadeOut > 0 ? Math.min(1, (clip.duration - clipTime) / clip.fadeOut) : 1
        const sample = mono[sourceIndex] * gain * Math.max(0, Math.min(fadeIn, fadeOut))
        left[outputIndex] += sample * leftPan
        right[outputIndex] += sample * rightPan
      }
    }
  }
  return { sampleRate, left, right }
}

export function encodeWav(mix: RenderedMix): Blob {
  const { sampleRate, left, right } = mix
  const channels = 2
  const bytesPerSample = 2
  const dataLength = left.length * channels * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataLength)
  const view = new DataView(buffer)
  const write = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)))
  write(0, 'RIFF'); view.setUint32(4, 36 + dataLength, true); write(8, 'WAVE')
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * channels * bytesPerSample, true)
  view.setUint16(32, channels * bytesPerSample, true); view.setUint16(34, 16, true); write(36, 'data'); view.setUint32(40, dataLength, true)
  let offset = 44
  for (let index = 0; index < left.length; index += 1) {
    const leftSample = Math.max(-1, Math.min(1, left[index]))
    const rightSample = Math.max(-1, Math.min(1, right[index]))
    view.setInt16(offset, leftSample < 0 ? leftSample * 0x8000 : leftSample * 0x7fff, true); offset += 2
    view.setInt16(offset, rightSample < 0 ? rightSample * 0x8000 : rightSample * 0x7fff, true); offset += 2
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url; anchor.download = filename; anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
