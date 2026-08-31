import { create } from 'zustand'
import { createDemoProject } from '../domain/demoProject'
import { actionAffectedIds, applyProjectAction } from '../domain/projectActions'
import { createBalanceProposal, createTightenProposal } from '../domain/proposals'
import { ProjectError, type EditProposal, type PlaybackState, type Project, type ProjectAction, type Selection, type TimelineView, type ToolCallRecord } from '../domain/types'
import { ensureDemoSources, sourceRepository, type PCMSource } from '../audio/sourceRepository'
import { analyzeProjectAudio, analyzeTrackLevel } from '../audio/analysis'
import { audioEngine } from '../audio/audioEngine'

interface DispatchOptions {
  origin?: 'human' | 'agent'
  tool?: string
  explanation?: string
  proposalId?: string
}

interface WavecraftState {
  project: Project
  selection: Selection
  playback: PlaybackState
  view: TimelineView
  historyPast: Project[]
  historyFuture: Project[]
  demoReady: boolean
  activePanel: 'changes' | 'analysis' | 'markers' | 'history' | 'webmcp'
  inspectorOpen: boolean
  judgeMode: boolean
  agentMode: 'propose' | 'direct'
  webmcpStatus: 'checking' | 'native' | 'polyfill' | 'unavailable' | 'error'
  registeredToolCount: number
  recentToolCalls: ToolCallRecord[]
  lastError: ProjectError | null
  initializeDemo: () => void
  replaceProject: (project: Project) => void
  importSource: (source: PCMSource) => void
  dispatch: (action: ProjectAction, options?: DispatchOptions) => Project
  undo: () => void
  redo: () => void
  setSelection: (selection: Selection) => void
  setPlayhead: (time: number) => void
  setPlaybackStatus: (status: PlaybackState['status']) => void
  setLoop: (loop: PlaybackState['loop']) => void
  setView: (view: TimelineView) => void
  fitProject: () => void
  zoom: (factor: number, anchor?: number) => void
  setActivePanel: (panel: WavecraftState['activePanel']) => void
  setInspectorOpen: (open: boolean) => void
  setJudgeMode: (enabled: boolean) => void
  setAgentMode: (mode: WavecraftState['agentMode']) => void
  addProposal: (proposal: EditProposal) => EditProposal
  proposeTighten: () => EditProposal
  proposeBalance: () => EditProposal
  setProposalActionStatus: (proposalId: string, actionId: string, status: 'pending' | 'accepted' | 'rejected') => void
  applyProposal: (proposalId: string) => Project
  rejectProposal: (proposalId: string) => void
  setWebMCPStatus: (status: WavecraftState['webmcpStatus'], count?: number) => void
  recordToolCall: (record: Omit<ToolCallRecord, 'id' | 'timestamp'>) => void
  clearError: () => void
}

function selectionAfterActions(selection: Selection, actions: ProjectAction[]): Selection {
  if (selection.kind !== 'range') return selection
  let start = selection.start
  let end = selection.end
  for (const action of actions) {
    if (action.type !== 'ripple_delete_range') continue
    const duration = action.end - action.start
    const mapBoundary = (time: number) => time <= action.start ? time : time >= action.end ? time - duration : action.start
    start = mapBoundary(start)
    end = mapBoundary(end)
  }
  return { ...selection, start: Math.max(0, start), end: Math.max(start, end) }
}

function loadInitialProject() {
  try {
    const saved = localStorage.getItem('wavecraft.project.v1')
    if (!saved) return createDemoProject()
    const project = JSON.parse(saved) as Project
    if (project.schemaVersion !== 1 || !Array.isArray(project.tracks) || !project.sources.every((source) => source.generated)) return createDemoProject()
    return project
  } catch {
    return createDemoProject()
  }
}

const initialProject = loadInitialProject()

function persist(project: Project) {
  try { localStorage.setItem('wavecraft.project.v1', JSON.stringify(project)) } catch { /* storage can be blocked */ }
}

function errorFrom(value: unknown) {
  return value instanceof ProjectError ? value : new ProjectError('UNEXPECTED_ERROR', value instanceof Error ? value.message : 'Unexpected error')
}

export const useWavecraftStore = create<WavecraftState>((set, get) => ({
  project: initialProject,
  selection: { kind: 'range', start: 4.8, end: 43.2, trackIds: ['track_host', 'track_guest'] },
  playback: { status: 'stopped', playhead: 4.8, loop: null },
  view: { start: 0, end: 48, pixelsPerSecond: 24 },
  historyPast: [], historyFuture: [], demoReady: false,
  activePanel: 'changes', inspectorOpen: true, judgeMode: true, agentMode: 'propose',
  webmcpStatus: 'checking', registeredToolCount: 0, recentToolCalls: [], lastError: null,

  initializeDemo: () => {
    const project = get().project
    ensureDemoSources(project)
    set({ project: { ...project, analysis: analyzeProjectAudio(project) }, demoReady: true, lastError: null })
  },
  replaceProject: (project) => {
    audioEngine.stop()
    persist(project)
    set({ project, historyPast: [], historyFuture: [], selection: { kind: 'none' }, playback: { status: 'stopped', playhead: 0, loop: null }, view: { start: 0, end: Math.max(project.duration, 1), pixelsPerSecond: 24 } })
  },
  importSource: (source) => sourceRepository.set(source),
  dispatch: (action, options = {}) => {
    const state = get()
    try {
      const project = applyProjectAction(state.project, action, options.origin ?? 'human')
      project.analysis = analyzeProjectAudio(project)
      if (options.origin === 'agent') {
        project.agentChanges.push({
          id: `change_${project.revision}_${project.agentChanges.length + 1}`,
          timestamp: new Date().toISOString(), tool: options.tool ?? action.type,
          explanation: options.explanation ?? action.type.replaceAll('_', ' '),
          affectedIds: actionAffectedIds(action), reversible: true, proposalId: options.proposalId,
        })
      }
      persist(project)
      const selection = selectionAfterActions(state.selection, [action])
      const playback = { ...state.playback, playhead: Math.min(state.playback.playhead, project.duration) }
      const view = { ...state.view, end: Math.min(state.view.end, project.duration) }
      set({ project, selection, playback, view, historyPast: [...state.historyPast.slice(-49), state.project], historyFuture: [], lastError: null })
      return project
    } catch (error) {
      const projectError = errorFrom(error)
      set({ lastError: projectError })
      throw projectError
    }
  },
  undo: () => {
    const state = get()
    const previous = state.historyPast.at(-1)
    if (!previous) return
    persist(previous)
    set({ project: previous, historyPast: state.historyPast.slice(0, -1), historyFuture: [state.project, ...state.historyFuture].slice(0, 50), lastError: null })
  },
  redo: () => {
    const state = get()
    const [next, ...rest] = state.historyFuture
    if (!next) return
    persist(next)
    set({ project: next, historyPast: [...state.historyPast, state.project].slice(-50), historyFuture: rest, lastError: null })
  },
  setSelection: (selection) => set({ selection, lastError: null }),
  setPlayhead: (playhead) => set((state) => ({ playback: { ...state.playback, playhead: Math.max(0, Math.min(playhead, state.project.duration)) } })),
  setPlaybackStatus: (status) => set((state) => ({ playback: { ...state.playback, status } })),
  setLoop: (loop) => set((state) => ({ playback: { ...state.playback, loop } })),
  setView: (view) => set({ view }),
  fitProject: () => set((state) => ({ view: { start: 0, end: Math.max(state.project.duration, 1), pixelsPerSecond: 24 } })),
  zoom: (factor, anchor) => set((state) => {
    const center = anchor ?? (state.view.start + state.view.end) / 2
    const duration = Math.max(2, Math.min(state.project.duration, (state.view.end - state.view.start) / factor))
    const start = Math.max(0, Math.min(state.project.duration - duration, center - duration / 2))
    return { view: { start, end: start + duration, pixelsPerSecond: state.view.pixelsPerSecond * factor } }
  }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setJudgeMode: (judgeMode) => set({ judgeMode }),
  setAgentMode: (agentMode) => set({ agentMode }),
  addProposal: (proposal) => {
    const state = get()
    const project = { ...state.project, proposals: [...state.project.proposals.filter((item) => item.id !== proposal.id), proposal], updatedAt: new Date().toISOString() }
    persist(project)
    set({ project, activePanel: 'changes', lastError: null })
    return proposal
  },
  proposeTighten: () => get().addProposal(createTightenProposal(get().project, get().selection)),
  proposeBalance: () => {
    const project = get().project
    const levels = project.tracks.filter((track) => track.role === 'dialogue').map((track) => ({ trackId: track.id, rmsDb: analyzeTrackLevel(project, track) }))
    return get().addProposal(createBalanceProposal(project, levels))
  },
  setProposalActionStatus: (proposalId, actionId, status) => {
    const state = get()
    const proposal = state.project.proposals.find((candidate) => candidate.id === proposalId)
    if (!proposal) throw new ProjectError('PROPOSAL_NOT_FOUND', `Proposal ${proposalId} does not exist.`, { proposalId })
    if (proposal.status !== 'pending') throw new ProjectError('PROPOSAL_NOT_PENDING', `Proposal ${proposalId} is ${proposal.status}.`, { proposalId, status: proposal.status })
    if (!proposal.actions.some((action) => action.id === actionId)) throw new ProjectError('PROPOSAL_ACTION_NOT_FOUND', `Action ${actionId} does not exist in proposal ${proposalId}.`, { proposalId, actionId })
    const project = { ...state.project, proposals: state.project.proposals.map((item) => item.id === proposalId ? { ...item, actions: item.actions.map((action) => action.id === actionId ? { ...action, status } : action) } : item), updatedAt: new Date().toISOString() }
    persist(project)
    set({ project, lastError: null })
  },
  applyProposal: (proposalId) => {
    const state = get()
    const proposal = state.project.proposals.find((candidate) => candidate.id === proposalId)
    if (!proposal) throw new ProjectError('PROPOSAL_NOT_FOUND', `Proposal ${proposalId} does not exist.`, { proposalId })
    if (proposal.status !== 'pending') throw new ProjectError('PROPOSAL_NOT_PENDING', `Proposal ${proposalId} is ${proposal.status}.`, { proposalId, status: proposal.status })
    const applicable = proposal.actions.filter((action) => action.status !== 'rejected')
    let project = structuredClone(state.project)
    try {
      for (const item of applicable) project = applyProjectAction(project, item.action, 'agent')
      project.analysis = analyzeProjectAudio(project)
      project.proposals = project.proposals.map((item) => item.id === proposalId ? { ...item, status: 'applied', actions: item.actions.map((action) => action.status === 'rejected' ? action : { ...action, status: 'accepted' }) } : item)
      project.agentChanges.push({ id: `change_proposal_${project.revision}`, timestamp: new Date().toISOString(), tool: 'apply_proposal', explanation: proposal.title, affectedIds: applicable.flatMap((item) => actionAffectedIds(item.action)), reversible: true, proposalId })
      persist(project)
      const selection = selectionAfterActions(state.selection, applicable.map((item) => item.action))
      const playback = { ...state.playback, playhead: Math.min(state.playback.playhead, project.duration) }
      const view = { ...state.view, end: Math.min(state.view.end, project.duration) }
      set({ project, selection, playback, view, historyPast: [...state.historyPast.slice(-49), state.project], historyFuture: [], lastError: null })
      return project
    } catch (error) {
      const projectError = errorFrom(error)
      set({ lastError: projectError })
      throw projectError
    }
  },
  rejectProposal: (proposalId) => {
    const state = get()
    const proposal = state.project.proposals.find((candidate) => candidate.id === proposalId)
    if (!proposal) throw new ProjectError('PROPOSAL_NOT_FOUND', `Proposal ${proposalId} does not exist.`, { proposalId })
    if (proposal.status !== 'pending') throw new ProjectError('PROPOSAL_NOT_PENDING', `Proposal ${proposalId} is ${proposal.status}.`, { proposalId, status: proposal.status })
    const project = { ...state.project, proposals: state.project.proposals.map((item) => item.id === proposalId ? { ...item, status: 'rejected' as const } : item), updatedAt: new Date().toISOString() }
    persist(project)
    set({ project, lastError: null })
  },
  setWebMCPStatus: (webmcpStatus, registeredToolCount = get().registeredToolCount) => set({ webmcpStatus, registeredToolCount }),
  recordToolCall: (record) => set((state) => ({ recentToolCalls: [{ ...record, id: `call_${Date.now()}`, timestamp: new Date().toISOString() }, ...state.recentToolCalls].slice(0, 12) })),
  clearError: () => set({ lastError: null }),
}))
