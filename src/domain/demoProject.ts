import type { Project } from './types'

const createdAt = '2026-08-25T19:00:00.000Z'

export function createDemoProject(): Project {
  return {
    schemaVersion: 1,
    id: 'project_wavecraft_demo',
    name: 'The Human Signal — rough cut',
    sampleRate: 44_100,
    duration: 48,
    createdAt,
    updatedAt: createdAt,
    revision: 0,
    sources: [
      { id: 'source_host', name: 'Host — generated dialogue', sampleRate: 44_100, duration: 48, channels: 1, generated: true },
      { id: 'source_guest', name: 'Guest — generated dialogue', sampleRate: 44_100, duration: 48, channels: 1, generated: true },
      { id: 'source_room', name: 'Room tone — generated ambience', sampleRate: 44_100, duration: 48, channels: 1, generated: true },
    ],
    tracks: [
      {
        id: 'track_host', name: 'Host', role: 'dialogue', color: '#59d5c9', gainDb: 0, pan: -0.08, muted: false, solo: false, locked: false, collapsed: false,
        clips: [{ id: 'clip_host_1', trackId: 'track_host', sourceId: 'source_host', name: 'Host rough take', timelineStart: 0, sourceStart: 0, duration: 48, gainDb: 0, fadeIn: 0.08, fadeOut: 0.12, speed: 1, locked: false, manualRevision: 0 }],
      },
      {
        id: 'track_guest', name: 'Guest', role: 'dialogue', color: '#b89cff', gainDb: -5.4, pan: 0.08, muted: false, solo: false, locked: false, collapsed: false,
        clips: [{ id: 'clip_guest_1', trackId: 'track_guest', sourceId: 'source_guest', name: 'Guest remote take', timelineStart: 0, sourceStart: 0, duration: 48, gainDb: 0, fadeIn: 0.08, fadeOut: 0.12, speed: 1, locked: false, manualRevision: 0 }],
      },
      {
        id: 'track_room', name: 'Room tone', role: 'ambience', color: '#e8aa5b', gainDb: -17, pan: 0, muted: false, solo: false, locked: false, collapsed: false,
        clips: [{ id: 'clip_room_1', trackId: 'track_room', sourceId: 'source_room', name: 'Studio ambience', timelineStart: 0, sourceStart: 0, duration: 48, gainDb: 0, fadeIn: 0.8, fadeOut: 1.2, speed: 1, locked: false, manualRevision: 0 }],
      },
    ],
    markers: [
      { id: 'marker_intro', time: 2.4, label: 'Cold open', color: '#59d5c9', locked: false },
      { id: 'marker_story', time: 16.8, label: 'Core story', color: '#b89cff', locked: false },
      { id: 'marker_close', time: 42.6, label: 'Close', color: '#e8aa5b', locked: false },
    ],
    regions: [{ id: 'region_key_quote', start: 18.2, end: 23.4, label: 'Keep: key quote', color: '#e8aa5b', locked: true }],
    locks: [{ id: 'lock_key_quote', kind: 'range', start: 18.2, end: 23.4, targetId: 'region_key_quote', label: 'Human-approved key quote', createdBy: 'human' }],
    proposals: [],
    agentChanges: [],
    analysis: {
      peakDb: -0.2,
      rmsDb: -20.8,
      dynamicRangeDb: 18.6,
      clippingCount: 3,
      silence: [
        { id: 'silence_1', trackId: 'track_host', start: 7.2, end: 9.35, duration: 2.15, confidence: 0.98, kind: 'silence' },
        { id: 'silence_2', trackId: 'track_guest', start: 14.05, end: 16.1, duration: 2.05, confidence: 0.96, kind: 'silence' },
        { id: 'pause_keep', trackId: 'track_guest', start: 20.1, end: 21.15, duration: 1.05, confidence: 0.89, kind: 'dramatic_pause' },
        { id: 'silence_3', trackId: 'track_host', start: 27.6, end: 30.4, duration: 2.8, confidence: 0.99, kind: 'silence' },
        { id: 'silence_4', trackId: 'track_guest', start: 36.15, end: 38.4, duration: 2.25, confidence: 0.97, kind: 'silence' },
      ],
      notes: ['Guest averages 5.4 dB below host', 'Three clipped peaks near 32.8 seconds', 'Four removable pauses exceed 2 seconds'],
    },
  }
}
