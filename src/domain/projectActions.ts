import type { Clip, Project, ProjectAction, ProjectLock, Track } from './types'
import { ProjectError } from './types'

const round = (value: number) => Math.round(value * 1000) / 1000
const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && aEnd > bStart

export function findClip(project: Project, clipId: string): { track: Track; clip: Clip } {
  for (const track of project.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId)
    if (clip) return { track, clip }
  }
  throw new ProjectError('CLIP_NOT_FOUND', `Clip ${clipId} does not exist.`, { clipId })
}

export function findTrack(project: Project, trackId: string): Track {
  const track = project.tracks.find((candidate) => candidate.id === trackId)
  if (!track) throw new ProjectError('TRACK_NOT_FOUND', `Track ${trackId} does not exist.`, { trackId })
  return track
}

function validateTime(project: Project, time: number, label = 'time') {
  if (!Number.isFinite(time) || time < 0 || time > project.duration) {
    throw new ProjectError('INVALID_TIME', `${label} must be between 0 and ${project.duration}.`, { [label]: time, projectDuration: project.duration })
  }
}

function rangeLocks(project: Project, start: number, end: number): ProjectLock[] {
  return project.locks.filter((lock) => lock.kind === 'range' && lock.start !== undefined && lock.end !== undefined && overlaps(start, end, lock.start, lock.end))
}

function assertRangeUnlocked(project: Project, start: number, end: number) {
  const [lock] = rangeLocks(project, start, end)
  if (lock) {
    throw new ProjectError('LOCKED_REGION', `This operation intersects locked range “${lock.label}”.`, {
      lockId: lock.id,
      lockedRange: { start: lock.start, end: lock.end },
      suggestion: 'Re-plan around this range or ask the human to unlock it.',
    })
  }
}

function assertClipUnlocked(project: Project, clipId: string) {
  const { track, clip } = findClip(project, clipId)
  const explicit = project.locks.find((lock) => (lock.kind === 'clip' && lock.targetId === clipId) || (lock.kind === 'track' && lock.targetId === track.id))
  if (clip.locked || track.locked || explicit) {
    throw new ProjectError('LOCKED_OBJECT', `Clip ${clipId} or its track is locked.`, { clipId, trackId: track.id, lockId: explicit?.id })
  }
}

function recalculateDuration(project: Project): number {
  const clipEnd = Math.max(0, ...project.tracks.flatMap((track) => track.clips.map((clip) => clip.timelineStart + clip.duration)))
  return round(Math.max(clipEnd, ...project.markers.map((marker) => marker.time), ...project.regions.map((region) => region.end)))
}

function rippleClip(clip: Clip, start: number, end: number, revision: number): Clip[] {
  const clipStart = clip.timelineStart
  const clipEnd = clip.timelineStart + clip.duration
  const cutDuration = end - start
  if (clipEnd <= start) return [clip]
  if (clipStart >= end) return [{ ...clip, timelineStart: round(clipStart - cutDuration) }]
  if (clipStart >= start && clipEnd <= end) return []
  if (clipStart < start && clipEnd > end) {
    const leftDuration = start - clipStart
    const rightDuration = clipEnd - end
    return [
      { ...clip, id: `${clip.id}_l${revision}`, duration: round(leftDuration), fadeOut: 0.04 },
      {
        ...clip,
        id: `${clip.id}_r${revision}`,
        timelineStart: round(start),
        sourceStart: round(clip.sourceStart + (end - clipStart)),
        duration: round(rightDuration),
        fadeIn: 0.04,
      },
    ]
  }
  if (clipStart < start) return [{ ...clip, duration: round(start - clipStart), fadeOut: 0.04 }]
  return [{
    ...clip,
    timelineStart: round(start),
    sourceStart: round(clip.sourceStart + (end - clipStart)),
    duration: round(clipEnd - end),
    fadeIn: 0.04,
  }]
}

export function applyProjectAction(project: Project, action: ProjectAction, origin: 'human' | 'agent' = 'human'): Project {
  const next = structuredClone(project)
  const revision = project.revision + 1

  switch (action.type) {
    case 'create_track': {
      next.tracks.push({ id: `track_${revision}`, name: action.name.trim() || `Track ${next.tracks.length + 1}`, role: action.role, color: ['#59d5c9', '#b89cff', '#e8aa5b', '#67a9ff'][next.tracks.length % 4], gainDb: 0, pan: 0, muted: false, solo: false, locked: false, collapsed: false, clips: [] })
      break
    }
    case 'split_clip': {
      validateTime(project, action.time)
      assertClipUnlocked(project, action.clipId)
      const { track, clip } = findClip(next, action.clipId)
      const offset = action.time - clip.timelineStart
      if (offset <= 0 || offset >= clip.duration) throw new ProjectError('INVALID_SPLIT', 'Split time must fall inside the clip.', { clipId: clip.id, time: action.time })
      assertRangeUnlocked(project, action.time - 0.001, action.time + 0.001)
      const left = { ...clip, id: `${clip.id}_a${revision}`, duration: round(offset), fadeOut: 0.025 }
      const right = { ...clip, id: `${clip.id}_b${revision}`, timelineStart: round(action.time), sourceStart: round(clip.sourceStart + offset), duration: round(clip.duration - offset), fadeIn: 0.025 }
      track.clips.splice(track.clips.indexOf(clip), 1, left, right)
      break
    }
    case 'trim_clip_start': {
      validateTime(project, action.newStart, 'newStart')
      assertClipUnlocked(project, action.clipId)
      const { clip } = findClip(next, action.clipId)
      const oldEnd = clip.timelineStart + clip.duration
      if (action.newStart < clip.timelineStart || action.newStart >= oldEnd) throw new ProjectError('INVALID_TRIM', 'New clip start must be inside the existing clip.', { clipId: clip.id, newStart: action.newStart, currentStart: clip.timelineStart, currentEnd: oldEnd })
      assertRangeUnlocked(project, clip.timelineStart, action.newStart)
      const removed = action.newStart - clip.timelineStart
      clip.timelineStart = round(action.newStart)
      clip.sourceStart = round(clip.sourceStart + removed)
      clip.duration = round(clip.duration - removed)
      clip.fadeIn = Math.min(clip.fadeIn, clip.duration)
      if (origin === 'human') clip.manualRevision = revision
      break
    }
    case 'trim_clip_end': {
      validateTime(project, action.newEnd, 'newEnd')
      assertClipUnlocked(project, action.clipId)
      const { clip } = findClip(next, action.clipId)
      const oldEnd = clip.timelineStart + clip.duration
      if (action.newEnd <= clip.timelineStart || action.newEnd > oldEnd) throw new ProjectError('INVALID_TRIM', 'New clip end must be inside the existing clip.', { clipId: clip.id, newEnd: action.newEnd, currentStart: clip.timelineStart, currentEnd: oldEnd })
      assertRangeUnlocked(project, action.newEnd, oldEnd)
      clip.duration = round(action.newEnd - clip.timelineStart)
      clip.fadeOut = Math.min(clip.fadeOut, clip.duration)
      if (origin === 'human') clip.manualRevision = revision
      break
    }
    case 'set_clip_fades': {
      assertClipUnlocked(project, action.clipId)
      const { clip } = findClip(next, action.clipId)
      const fadeIn = action.fadeIn ?? clip.fadeIn
      const fadeOut = action.fadeOut ?? clip.fadeOut
      if (fadeIn < 0 || fadeOut < 0 || fadeIn + fadeOut > clip.duration) throw new ProjectError('INVALID_FADE', 'Fades must be non-negative and fit inside the clip duration.', { clipId: clip.id, fadeIn, fadeOut, duration: clip.duration })
      clip.fadeIn = round(fadeIn); clip.fadeOut = round(fadeOut)
      if (origin === 'human') clip.manualRevision = revision
      break
    }
    case 'move_clip': {
      validateTime(project, action.timelineStart, 'timelineStart')
      assertClipUnlocked(project, action.clipId)
      const { clip } = findClip(next, action.clipId)
      assertRangeUnlocked(project, clip.timelineStart, clip.timelineStart + clip.duration)
      assertRangeUnlocked(project, action.timelineStart, Math.min(project.duration, action.timelineStart + clip.duration))
      clip.timelineStart = round(action.timelineStart)
      if (origin === 'human') clip.manualRevision = revision
      break
    }
    case 'delete_clip': {
      assertClipUnlocked(project, action.clipId)
      const { track, clip } = findClip(next, action.clipId)
      assertRangeUnlocked(project, clip.timelineStart, clip.timelineStart + clip.duration)
      track.clips = track.clips.filter((candidate) => candidate.id !== clip.id)
      break
    }
    case 'set_clip_gain': {
      if (action.gainDb < -60 || action.gainDb > 24) throw new ProjectError('INVALID_GAIN', 'Clip gain must be between -60 dB and +24 dB.', { gainDb: action.gainDb })
      assertClipUnlocked(project, action.clipId)
      const { clip } = findClip(next, action.clipId)
      clip.gainDb = round(action.gainDb)
      if (origin === 'human') clip.manualRevision = revision
      break
    }
    case 'set_track_gain': {
      if (action.gainDb < -60 || action.gainDb > 24) throw new ProjectError('INVALID_GAIN', 'Track gain must be between -60 dB and +24 dB.', { gainDb: action.gainDb })
      const track = findTrack(next, action.trackId)
      if (track.locked) throw new ProjectError('LOCKED_OBJECT', `Track ${track.name} is locked.`, { trackId: track.id })
      track.gainDb = round(action.gainDb)
      for (const clip of track.clips) if (origin === 'human') clip.manualRevision = revision
      break
    }
    case 'set_track_pan': {
      if (action.pan < -1 || action.pan > 1) throw new ProjectError('INVALID_PAN', 'Pan must be between -1 and 1.', { pan: action.pan })
      const track = findTrack(next, action.trackId)
      if (track.locked) throw new ProjectError('LOCKED_OBJECT', `Track ${track.name} is locked.`, { trackId: track.id })
      track.pan = round(action.pan)
      break
    }
    case 'toggle_track_mute': findTrack(next, action.trackId).muted = !findTrack(next, action.trackId).muted; break
    case 'toggle_track_solo': findTrack(next, action.trackId).solo = !findTrack(next, action.trackId).solo; break
    case 'toggle_track_lock': findTrack(next, action.trackId).locked = !findTrack(next, action.trackId).locked; break
    case 'rename_track': findTrack(next, action.trackId).name = action.name.trim() || findTrack(next, action.trackId).name; break
    case 'ripple_delete_range': {
      validateTime(project, action.start, 'start')
      validateTime(project, action.end, 'end')
      if (action.end <= action.start) throw new ProjectError('INVALID_RANGE', 'Range end must be after range start.', { start: action.start, end: action.end })
      assertRangeUnlocked(project, action.start, action.end)
      const cutDuration = action.end - action.start
      next.tracks = next.tracks.map((track) => ({ ...track, clips: track.clips.flatMap((clip) => rippleClip(clip, action.start, action.end, revision)) }))
      next.markers = next.markers.filter((marker) => marker.time < action.start || marker.time > action.end).map((marker) => marker.time > action.end ? { ...marker, time: round(marker.time - cutDuration) } : marker)
      next.regions = next.regions.map((region) => region.start >= action.end ? { ...region, start: round(region.start - cutDuration), end: round(region.end - cutDuration) } : region)
      next.locks = next.locks.map((lock) => lock.kind === 'range' && lock.start !== undefined && lock.end !== undefined && lock.start >= action.end
        ? { ...lock, start: round(lock.start - cutDuration), end: round(lock.end - cutDuration) }
        : lock)
      next.analysis.silence = next.analysis.silence
        .filter((range) => !overlaps(range.start, range.end, action.start, action.end))
        .map((range) => range.start >= action.end ? { ...range, start: round(range.start - cutDuration), end: round(range.end - cutDuration) } : range)
      break
    }
    case 'lock_range': {
      validateTime(project, action.start, 'start')
      validateTime(project, action.end, 'end')
      if (action.end <= action.start) throw new ProjectError('INVALID_RANGE', 'Range end must be after range start.', { start: action.start, end: action.end })
      next.locks.push({ id: `lock_range_${revision}`, kind: 'range', start: round(action.start), end: round(action.end), label: action.label || 'Human-locked range', createdBy: 'human' })
      break
    }
    case 'unlock': {
      if (!next.locks.some((lock) => lock.id === action.lockId)) throw new ProjectError('LOCK_NOT_FOUND', `Lock ${action.lockId} does not exist.`, { lockId: action.lockId })
      next.locks = next.locks.filter((lock) => lock.id !== action.lockId)
      break
    }
    case 'add_marker': {
      validateTime(project, action.time)
      next.markers.push({ id: `marker_${revision}`, time: round(action.time), label: action.label || 'Marker', color: '#59d5c9', locked: false })
      break
    }
  }

  next.revision = revision
  next.duration = recalculateDuration(next)
  next.updatedAt = new Date().toISOString()
  return next
}

export function actionAffectedIds(action: ProjectAction): string[] {
  if ('clipId' in action) return [action.clipId]
  if ('trackId' in action) return [action.trackId]
  if ('lockId' in action) return [action.lockId]
  return []
}
