import { beforeEach, describe, expect, it } from 'vitest'
import { encodeWav, renderProject } from './exportWav'
import { sourceRepository } from './sourceRepository'
import type { Project } from '../domain/types'

function tinyProject(): Project {
  return {
    schemaVersion: 1, id: 'tiny', name: 'Tiny mix', sampleRate: 100, duration: 1,
    createdAt: '2026-08-25T00:00:00.000Z', updatedAt: '2026-08-25T00:00:00.000Z', revision: 0,
    sources: [{ id: 'tone', name: 'Tone', sampleRate: 100, duration: 1, channels: 1, generated: true }],
    tracks: [{ id: 'track', name: 'Track', role: 'other', color: '#fff', gainDb: 0, pan: 0, muted: false, solo: false, locked: false, collapsed: false, clips: [{ id: 'clip', trackId: 'track', sourceId: 'tone', name: 'Tone', timelineStart: 0, sourceStart: 0, duration: 1, gainDb: 0, fadeIn: 0, fadeOut: 0, speed: 1, locked: false, manualRevision: 0 }] }],
    markers: [], regions: [], locks: [], proposals: [], agentChanges: [],
    analysis: { peakDb: 0, rmsDb: 0, dynamicRangeDb: 0, clippingCount: 0, silence: [], notes: [] },
  }
}

beforeEach(() => {
  sourceRepository.clear()
  sourceRepository.set({ id: 'tone', sampleRate: 100, channels: [new Float32Array(100).fill(0.5)] })
})

describe('WAV export', () => {
  it('renders the live graph and writes a valid stereo 16-bit WAV', async () => {
    const project = tinyProject()
    const mix = renderProject(project)
    expect(mix.left).toHaveLength(100)
    expect(mix.left[50]).toBeCloseTo(0.5 * Math.SQRT1_2, 5)
    expect(mix.right[50]).toBeCloseTo(0.5 * Math.SQRT1_2, 5)
    const blob = encodeWav(mix)
    expect(blob.type).toBe('audio/wav')
    expect(blob.size).toBe(44 + 100 * 2 * 2)
    const header = new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 12))
    expect(header).toContain('RIFF')
    expect(header).toContain('WAVE')
  })

  it('honors mute and selection range during render', () => {
    const project = tinyProject()
    project.tracks[0].muted = true
    const mix = renderProject(project, { start: 0.2, end: 0.7 })
    expect(mix.left).toHaveLength(50)
    expect(Math.max(...mix.left)).toBe(0)
  })
})
