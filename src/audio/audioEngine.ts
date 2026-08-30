import { sourceRepository } from './sourceRepository'
import type { Project } from '../domain/types'

interface ScheduledNode {
  source: AudioBufferSourceNode
  gain: GainNode
  pan: StereoPannerNode
}

const dbToGain = (db: number) => 10 ** (db / 20)

class AudioEngine {
  private context: AudioContext | null = null
  private nodes: ScheduledNode[] = []
  private buffers = new Map<string, AudioBuffer>()
  private startedAt = 0
  private projectOffset = 0
  private endTimer: number | null = null
  private onEnded: (() => void) | null = null

  private getContext() {
    if (!this.context) this.context = new AudioContext({ latencyHint: 'interactive' })
    return this.context
  }

  private getBuffer(context: AudioContext, sourceId: string) {
    const cached = this.buffers.get(sourceId)
    if (cached) return cached
    const pcm = sourceRepository.get(sourceId)
    if (!pcm) return null
    const buffer = context.createBuffer(pcm.channels.length, pcm.channels[0].length, pcm.sampleRate)
    pcm.channels.forEach((channel, index) => buffer.copyToChannel(channel, index))
    this.buffers.set(sourceId, buffer)
    return buffer
  }

  async play(project: Project, from: number, onEnded: () => void) {
    this.stop()
    const context = this.getContext()
    await context.resume()
    const soloed = project.tracks.some((track) => track.solo)
    this.projectOffset = from
    this.startedAt = context.currentTime
    this.onEnded = onEnded
    for (const track of project.tracks) {
      if (track.muted || (soloed && !track.solo)) continue
      for (const clip of track.clips) {
        const clipEnd = clip.timelineStart + clip.duration
        if (clipEnd <= from) continue
        const buffer = this.getBuffer(context, clip.sourceId)
        if (!buffer) continue
        const source = context.createBufferSource()
        const gain = context.createGain()
        const pan = context.createStereoPanner()
        source.buffer = buffer
        source.playbackRate.value = clip.speed
        const baseGain = dbToGain(track.gainDb + clip.gainDb)
        pan.pan.value = track.pan
        source.connect(gain).connect(pan).connect(context.destination)
        const offsetIntoClip = Math.max(0, from - clip.timelineStart)
        const when = context.currentTime + Math.max(0, clip.timelineStart - from)
        const sourceOffset = clip.sourceStart + offsetIntoClip
        const playable = Math.max(0, clip.duration - offsetIntoClip)
        if (playable > 0) {
          const fadeInGain = clip.fadeIn > 0 ? Math.min(1, offsetIntoClip / clip.fadeIn) : 1
          const fadeOutGain = clip.fadeOut > 0 ? Math.min(1, (clip.duration - offsetIntoClip) / clip.fadeOut) : 1
          gain.gain.setValueAtTime(baseGain * Math.min(fadeInGain, fadeOutGain), when)
          if (clip.fadeIn > offsetIntoClip) gain.gain.linearRampToValueAtTime(baseGain, when + (clip.fadeIn - offsetIntoClip))
          const fadeOutAt = when + Math.max(0, clip.duration - clip.fadeOut - offsetIntoClip)
          if (clip.fadeOut > 0 && fadeOutAt < when + playable) {
            gain.gain.setValueAtTime(baseGain, fadeOutAt)
            gain.gain.linearRampToValueAtTime(0, when + playable)
          }
          source.start(when, sourceOffset, playable)
          this.nodes.push({ source, gain, pan })
        }
      }
    }
    const remaining = Math.max(0, project.duration - from)
    this.endTimer = window.setTimeout(() => { this.stop(); onEnded() }, remaining * 1000 + 80)
  }

  stop() {
    for (const node of this.nodes) {
      try { node.source.stop() } catch { /* already stopped */ }
      node.source.disconnect(); node.gain.disconnect(); node.pan.disconnect()
    }
    this.nodes = []
    if (this.endTimer !== null) window.clearTimeout(this.endTimer)
    this.endTimer = null
    this.onEnded = null
  }

  currentTime() {
    if (!this.context || !this.nodes.length) return this.projectOffset
    return this.projectOffset + (this.context.currentTime - this.startedAt)
  }
}

export const audioEngine = new AudioEngine()
