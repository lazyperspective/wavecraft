export type ID = string

export interface AudioSourceMeta {
  id: ID
  name: string
  sampleRate: number
  duration: number
  channels: number
  generated: boolean
}

export interface Clip {
  id: ID
  trackId: ID
  sourceId: ID
  name: string
  timelineStart: number
  sourceStart: number
  duration: number
  gainDb: number
  fadeIn: number
  fadeOut: number
  speed: number
  locked: boolean
  manualRevision: number
}

export interface Track {
  id: ID
  name: string
  role: 'dialogue' | 'music' | 'ambience' | 'other'
  color: string
  gainDb: number
  pan: number
  muted: boolean
  solo: boolean
  locked: boolean
  collapsed: boolean
  clips: Clip[]
}

export interface Marker {
  id: ID
  time: number
  label: string
  color: string
  locked: boolean
}

export interface Region {
  id: ID
  start: number
  end: number
  label: string
  color: string
  locked: boolean
}

export interface ProjectLock {
  id: ID
  kind: 'range' | 'clip' | 'track' | 'region' | 'marker'
  targetId?: ID
  start?: number
  end?: number
  label: string
  createdBy: 'human'
}

export type Selection =
  | { kind: 'none' }
  | { kind: 'range'; start: number; end: number; trackIds: ID[] }
  | { kind: 'clip'; clipIds: ID[] }
  | { kind: 'track'; trackIds: ID[] }
  | { kind: 'marker'; markerIds: ID[] }

export interface SilenceRange {
  id: ID
  trackId: ID
  start: number
  end: number
  duration: number
  confidence: number
  kind: 'silence' | 'dramatic_pause'
}

export interface AnalysisSummary {
  peakDb: number
  rmsDb: number
  dynamicRangeDb: number
  clippingCount: number
  silence: SilenceRange[]
  notes: string[]
}

export type ProjectAction =
  | { type: 'create_track'; name: string; role: Track['role'] }
  | { type: 'split_clip'; clipId: ID; time: number }
  | { type: 'trim_clip_start'; clipId: ID; newStart: number }
  | { type: 'trim_clip_end'; clipId: ID; newEnd: number }
  | { type: 'set_clip_fades'; clipId: ID; fadeIn?: number; fadeOut?: number }
  | { type: 'move_clip'; clipId: ID; timelineStart: number }
  | { type: 'delete_clip'; clipId: ID }
  | { type: 'set_clip_gain'; clipId: ID; gainDb: number }
  | { type: 'set_track_gain'; trackId: ID; gainDb: number }
  | { type: 'set_track_pan'; trackId: ID; pan: number }
  | { type: 'toggle_track_mute'; trackId: ID }
  | { type: 'toggle_track_solo'; trackId: ID }
  | { type: 'toggle_track_lock'; trackId: ID }
  | { type: 'rename_track'; trackId: ID; name: string }
  | { type: 'ripple_delete_range'; start: number; end: number }
  | { type: 'lock_range'; start: number; end: number; label: string }
  | { type: 'unlock'; lockId: ID }
  | { type: 'add_marker'; time: number; label: string }

export interface ProposalAction {
  id: ID
  action: ProjectAction
  label: string
  start?: number
  end?: number
  status: 'pending' | 'accepted' | 'rejected'
}

export interface EditProposal {
  id: ID
  title: string
  description: string
  createdAt: string
  status: 'pending' | 'applied' | 'rejected'
  originalDuration: number
  proposedDuration: number
  actions: ProposalAction[]
  rationale: string[]
}

export interface AgentChange {
  id: ID
  timestamp: string
  tool: string
  explanation: string
  affectedIds: ID[]
  reversible: boolean
  proposalId?: ID
}

export interface Project {
  schemaVersion: 1
  id: ID
  name: string
  sampleRate: number
  duration: number
  createdAt: string
  updatedAt: string
  revision: number
  sources: AudioSourceMeta[]
  tracks: Track[]
  markers: Marker[]
  regions: Region[]
  locks: ProjectLock[]
  proposals: EditProposal[]
  agentChanges: AgentChange[]
  analysis: AnalysisSummary
}

export interface TimelineView {
  start: number
  end: number
  pixelsPerSecond: number
}

export interface PlaybackState {
  status: 'stopped' | 'playing' | 'paused'
  playhead: number
  loop: { start: number; end: number } | null
}

export interface ToolCallRecord {
  id: ID
  name: string
  timestamp: string
  success: boolean
  summary: string
}

export class ProjectError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'ProjectError'
  }
}
