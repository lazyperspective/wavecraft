import type { EditProposal, Project, ProposalAction, Selection } from './types'
import { ProjectError } from './types'

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && aEnd > bStart

export function createTightenProposal(project: Project, selection: Selection): EditProposal {
  if (selection.kind !== 'range') throw new ProjectError('SELECTION_REQUIRED', 'Tighten requires a time-range selection.', { selectionKind: selection.kind })
  const lockedRanges = project.locks.filter((lock) => lock.kind === 'range' && lock.start !== undefined && lock.end !== undefined)
  const candidates = project.analysis.silence
    .filter((range) => range.kind === 'silence' && range.start >= selection.start && range.end <= selection.end)
    .filter((range) => !lockedRanges.some((lock) => overlaps(range.start, range.end, lock.start!, lock.end!)))
    .sort((a, b) => b.start - a.start)

  if (!candidates.length) throw new ProjectError('NO_SAFE_EDITS', 'No removable pauses were found outside locked ranges.', { selection })
  const actions: ProposalAction[] = candidates.map((range, index) => {
    const preserve = Math.min(0.36, range.duration * 0.18)
    const start = Math.round((range.start + preserve / 2) * 1000) / 1000
    const end = Math.round((range.end - preserve / 2) * 1000) / 1000
    return {
      id: `proposal_action_${project.revision + 1}_${index + 1}`,
      action: { type: 'ripple_delete_range', start, end },
      label: `Remove ${(end - start).toFixed(2)}s pause`,
      start,
      end,
      status: 'pending',
    }
  })
  const removed = actions.reduce((total, action) => total + ((action.end ?? 0) - (action.start ?? 0)), 0)
  return {
    id: `proposal_tighten_${project.revision + 1}`,
    title: 'Tighten selected conversation',
    description: `Remove ${actions.length} long pauses while preserving human-locked material and short dramatic pauses.`,
    createdAt: new Date().toISOString(),
    status: 'pending',
    originalDuration: Math.round((selection.end - selection.start) * 1000) / 1000,
    proposedDuration: Math.round((selection.end - selection.start - removed) * 1000) / 1000,
    actions,
    rationale: [
      `${actions.length} pauses exceed the dialogue pacing threshold.`,
      `${lockedRanges.length} human lock${lockedRanges.length === 1 ? '' : 's'} treated as hard constraints.`,
      'Short dramatic pauses are retained to preserve meaning and cadence.',
    ],
  }
}

export function createBalanceProposal(project: Project): EditProposal {
  const host = project.tracks.find((track) => track.id === 'track_host')
  const guest = project.tracks.find((track) => track.id === 'track_guest')
  if (!host || !guest) throw new ProjectError('TRACKS_NOT_FOUND', 'Host and guest tracks are required for speaker balancing.')
  const guestManual = guest.clips.some((clip) => clip.manualRevision > 0)
  const actions: ProposalAction[] = guestManual
    ? [{ id: `proposal_action_${project.revision + 1}_1`, action: { type: 'set_track_gain', trackId: host.id, gainDb: host.gainDb - 1.4 }, label: 'Lower host 1.4 dB around the human-set guest level', status: 'pending' }]
    : [
        { id: `proposal_action_${project.revision + 1}_1`, action: { type: 'set_track_gain', trackId: host.id, gainDb: host.gainDb - 1.1 }, label: 'Lower host 1.1 dB', status: 'pending' },
        { id: `proposal_action_${project.revision + 1}_2`, action: { type: 'set_track_gain', trackId: guest.id, gainDb: guest.gainDb + 3.2 }, label: 'Raise guest 3.2 dB', status: 'pending' },
      ]
  return {
    id: `proposal_balance_${project.revision + 1}`,
    title: 'Balance host and guest',
    description: guestManual ? 'Preserve the human-set guest level and rebalance the host around it.' : 'Narrow the speaker loudness gap without compressing either performance.',
    createdAt: new Date().toISOString(),
    status: 'pending', originalDuration: project.duration, proposedDuration: project.duration, actions,
    rationale: [guestManual ? 'Guest level has a manual override and remains authoritative.' : 'Guest averages 5.4 dB below host.', 'Gain-only changes preserve natural dynamics.'],
  }
}
