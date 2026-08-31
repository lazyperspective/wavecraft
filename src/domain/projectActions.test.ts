import { describe, expect, it } from 'vitest'
import { createDemoProject } from './demoProject'
import { applyProjectAction, findClip } from './projectActions'
import { createBalanceProposal, createTightenProposal } from './proposals'
import { ProjectError } from './types'

describe('Wavecraft project actions', () => {
  it('splits a real clip non-destructively at an unlocked time', () => {
    const project = createDemoProject()
    const next = applyProjectAction(project, { type: 'split_clip', clipId: 'clip_host_1', time: 12.5 })
    const clips = next.tracks[0].clips
    expect(clips).toHaveLength(2)
    expect(clips[0]).toMatchObject({ timelineStart: 0, duration: 12.5, sourceStart: 0 })
    expect(clips[1]).toMatchObject({ timelineStart: 12.5, duration: 35.5, sourceStart: 12.5 })
    expect(project.tracks[0].clips).toHaveLength(1)
  })

  it('refuses an edit that intersects a human-locked range', () => {
    const project = createDemoProject()
    expect(() => applyProjectAction(project, { type: 'ripple_delete_range', start: 19, end: 21 }))
      .toThrowError(ProjectError)
    try {
      applyProjectAction(project, { type: 'ripple_delete_range', start: 19, end: 21 })
    } catch (error) {
      expect(error).toMatchObject({ code: 'LOCKED_REGION' })
    }
  })

  it('treats a locked track as a hard constraint for agent edits', () => {
    const project = applyProjectAction(createDemoProject(), { type: 'toggle_track_lock', trackId: 'track_host' })
    const actions = [
      { type: 'ripple_delete_range', start: 7.4, end: 9.2 },
      { type: 'toggle_track_mute', trackId: 'track_host' },
      { type: 'toggle_track_solo', trackId: 'track_host' },
      { type: 'rename_track', trackId: 'track_host', name: 'Changed through a lock' },
    ] as const

    for (const action of actions) {
      expect(() => applyProjectAction(project, action, 'agent')).toThrowError(ProjectError)
      try {
        applyProjectAction(project, action, 'agent')
      } catch (error) {
        expect(error).toMatchObject({ code: 'LOCKED_OBJECT' })
      }
    }
  })

  it('ripple-deletes media across tracks while preserving synchronization', () => {
    const project = createDemoProject()
    const next = applyProjectAction(project, { type: 'ripple_delete_range', start: 7.4, end: 9.2 })
    expect(next.duration).toBe(46.2)
    expect(next.tracks.every((track) => track.clips.length === 2)).toBe(true)
    for (const track of next.tracks) {
      const right = track.clips[1]
      expect(right.timelineStart).toBe(7.4)
      expect(right.sourceStart).toBe(9.2)
    }
  })

  it('marks human gain changes so later agent proposals preserve the override', () => {
    const project = createDemoProject()
    const humanEdited = applyProjectAction(project, { type: 'set_track_gain', trackId: 'track_guest', gainDb: -1.5 }, 'human')
    expect(findClip(humanEdited, 'clip_guest_1').clip.manualRevision).toBe(1)
    const proposal = createBalanceProposal(humanEdited)
    expect(proposal.actions).toHaveLength(1)
    expect(proposal.actions[0].action).toMatchObject({ type: 'set_track_gain', trackId: 'track_host' })
    expect(proposal.description).toContain('human-set guest level')
  })

  it('trims and fades clips non-destructively', () => {
    const project = createDemoProject()
    const trimmedStart = applyProjectAction(project, { type: 'trim_clip_start', clipId: 'clip_host_1', newStart: 1.25 })
    expect(findClip(trimmedStart, 'clip_host_1').clip).toMatchObject({ timelineStart: 1.25, sourceStart: 1.25, duration: 46.75 })
    const trimmedEnd = applyProjectAction(trimmedStart, { type: 'trim_clip_end', clipId: 'clip_host_1', newEnd: 46 })
    expect(findClip(trimmedEnd, 'clip_host_1').clip.duration).toBe(44.75)
    const faded = applyProjectAction(trimmedEnd, { type: 'set_clip_fades', clipId: 'clip_host_1', fadeIn: 0.5, fadeOut: 0.75 })
    expect(findClip(faded, 'clip_host_1').clip).toMatchObject({ fadeIn: 0.5, fadeOut: 0.75 })
    expect(project.tracks[0].clips[0]).toMatchObject({ timelineStart: 0, sourceStart: 0, duration: 48 })
  })
})

describe('Wavecraft proposals', () => {
  it('creates a structured visual-diff plan around human locks', () => {
    const project = createDemoProject()
    const proposal = createTightenProposal(project, { kind: 'range', start: 4.8, end: 43.2, trackIds: ['track_host', 'track_guest'] })
    expect(proposal.status).toBe('pending')
    expect(proposal.actions).toHaveLength(4)
    expect(proposal.actions.every((action) => action.start! < 18.2 || action.end! > 23.4)).toBe(true)
    expect(proposal.proposedDuration).toBeLessThan(proposal.originalDuration)
  })
})
