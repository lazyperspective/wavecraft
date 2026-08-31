import type { EditProposal, Project, ProposalAction, Selection } from './types'
import { ProjectError } from './types'
import { applyProjectAction } from './projectActions'

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
  let simulated = project
  for (const item of actions) simulated = applyProjectAction(simulated, item.action, 'agent')
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

export function createBalanceProposal(project: Project, measuredLevels: Array<{ trackId: string; rmsDb: number }> = []): EditProposal {
  const host = project.tracks.find((track) => track.id === 'track_host')
  const guest = project.tracks.find((track) => track.id === 'track_guest')
  if (!host || !guest) throw new ProjectError('TRACKS_NOT_FOUND', 'Host and guest tracks are required for speaker balancing.')
  const hostLevel = measuredLevels.find((level) => level.trackId === host.id)?.rmsDb ?? host.gainDb
  const guestLevel = measuredLevels.find((level) => level.trackId === guest.id)?.rmsDb ?? guest.gainDb
  const levelGap = hostLevel - guestLevel
  const halfCorrection = Math.max(-3, Math.min(3, levelGap / 2))
  const clampGain = (gainDb: number) => Math.max(-60, Math.min(24, Math.round(gainDb * 10) / 10))
  const locked = (trackId: string) => project.tracks.find((track) => track.id === trackId)?.locked || project.locks.some((lock) => lock.kind === 'track' && lock.targetId === trackId)
  const hostManual = host.clips.some((clip) => clip.manualRevision > 0)
  const guestManual = guest.clips.some((clip) => clip.manualRevision > 0)
  const hostConstrained = Boolean(hostManual || locked(host.id))
  const guestConstrained = Boolean(guestManual || locked(guest.id))
  if (hostConstrained && guestConstrained) throw new ProjectError('NO_SAFE_EDITS', 'Both dialogue levels are constrained by human locks or manual overrides.')
  const actions: ProposalAction[] = []
  if (!hostConstrained) actions.push({ id: `proposal_action_${project.revision + 1}_${actions.length + 1}`, action: { type: 'set_track_gain', trackId: host.id, gainDb: clampGain(host.gainDb - (guestConstrained ? Math.max(-6, Math.min(6, levelGap)) : halfCorrection)) }, label: `${levelGap >= 0 ? 'Lower' : 'Raise'} host around ${guestConstrained ? 'the constrained guest level' : 'the measured midpoint'}`, status: 'pending' })
  if (!guestConstrained) actions.push({ id: `proposal_action_${project.revision + 1}_${actions.length + 1}`, action: { type: 'set_track_gain', trackId: guest.id, gainDb: clampGain(guest.gainDb + (hostConstrained ? Math.max(-6, Math.min(6, levelGap)) : halfCorrection)) }, label: `${levelGap >= 0 ? 'Raise' : 'Lower'} guest around ${hostConstrained ? 'the constrained host level' : 'the measured midpoint'}`, status: 'pending' })
  let simulated = project
  for (const item of actions) simulated = applyProjectAction(simulated, item.action, 'agent')
  const constrainedNames = [hostConstrained ? host.name : null, guestConstrained ? guest.name : null].filter(Boolean)
  return {
    id: `proposal_balance_${project.revision + 1}`,
    title: 'Balance host and guest',
    description: constrainedNames.length ? `Preserve the human-constrained ${constrainedNames.join(' and ')} level and rebalance the other speaker around it.` : 'Narrow the speaker loudness gap without compressing either performance.',
    createdAt: new Date().toISOString(),
    status: 'pending', originalDuration: project.duration, proposedDuration: project.duration, actions,
    rationale: [constrainedNames.length ? `${constrainedNames.join(' and ')} level is human-constrained and remains authoritative.` : `Measured dialogue RMS differs by ${Math.abs(levelGap).toFixed(1)} dB.`, 'Gain-only changes preserve natural dynamics.'],
  }
}
