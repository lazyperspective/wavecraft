import { beforeEach, describe, expect, it } from 'vitest'
import { ensureDemoSources } from '../audio/sourceRepository'
import { createDemoProject } from '../domain/demoProject'
import { useWavecraftStore } from '../store/wavecraftStore'
import { createWavecraftTools } from './tools'

const selection = { kind: 'range' as const, start: 4.8, end: 43.2, trackIds: ['track_host', 'track_guest'] }

function resetStore() {
  const project = createDemoProject()
  ensureDemoSources(project)
  useWavecraftStore.setState({
    project, selection,
    playback: { status: 'stopped', playhead: 4.8, loop: null },
    view: { start: 0, end: 48, pixelsPerSecond: 24 },
    historyPast: [], historyFuture: [], recentToolCalls: [], lastError: null,
    agentMode: 'propose', activePanel: 'changes',
  })
}

async function run(name: string, args: Record<string, unknown> = {}) {
  const definition = createWavecraftTools().find((tool) => tool.name === name)
  if (!definition) throw new Error(`Missing tool ${name}`)
  return await definition.execute(args) as Record<string, any>
}

beforeEach(resetStore)

describe('WebMCP tool catalog', () => {
  it('exposes a substantial, spec-valid, uniquely named tool surface', () => {
    const tools = createWavecraftTools()
    expect(tools).toHaveLength(68)
    expect(new Set(tools.map((tool) => tool.name)).size).toBe(tools.length)
    for (const definition of tools) {
      expect(definition.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/)
      expect(definition.description.length).toBeGreaterThan(25)
      expect(definition.inputSchema).toMatchObject({ type: 'object' })
      expect(typeof definition.execute).toBe('function')
    }
  })

  it('returns a structured success or structured error from every registered tool', async () => {
    for (const definition of createWavecraftTools()) {
      resetStore()
      const result = await definition.execute({}) as Record<string, unknown>
      expect(result, definition.name).toBeTypeOf('object')
      expect(result, definition.name).toHaveProperty('success')
      expect(typeof result.success, definition.name).toBe('boolean')
    }
  })
})

describe('external agent acceptance workflow', () => {
  it('inspects, analyzes, proposes, rejects one diff, applies atomically, and inspects the result', async () => {
    const context = await run('inspect_context')
    expect(context.success).toBe(true)
    expect(context.selection).toMatchObject({ kind: 'range', start: 4.8, end: 43.2 })
    expect(context.locks).toHaveLength(1)

    const analysis = await run('detect_long_pauses', { minimum_duration: 1.5, selection_only: true })
    expect(analysis.ranges).toHaveLength(4)

    const blocked = await run('ripple_delete_time_range', { start: 19, end: 21 })
    expect(blocked).toMatchObject({ success: false, error: 'LOCKED_REGION', lockId: 'lock_key_quote' })

    const created = await run('create_tighten_proposal')
    expect(created).toMatchObject({ success: true, applied: false })
    expect(created.proposal.actions).toHaveLength(4)

    const rejected = await run('reject_proposal_action', { proposal_id: 'proposal_tighten_1', action_id: 'proposal_action_1_1' })
    expect(rejected).toMatchObject({ success: true, status: 'rejected' })

    const applied = await run('apply_proposal', { proposal_id: 'proposal_tighten_1' })
    expect(applied).toMatchObject({ success: true, appliedActions: 3, projectRevision: 3, projectDuration: 42.08, undoAvailable: true })

    const result = await run('inspect_context')
    expect(result.selection.end).toBeCloseTo(37.28)
    expect(result.selection.intersectingLocks[0]).toMatchObject({ start: 14.72, end: 19.92 })
    expect(result.project).toMatchObject({ revision: 3, duration: 42.08, clipCount: 12, pendingProposalCount: 0 })
  })

  it('preserves a human gain override when proposing speaker balance', async () => {
    useWavecraftStore.getState().dispatch({ type: 'set_track_gain', trackId: 'track_guest', gainDb: -1.5 })
    const proposal = await run('create_balance_proposal')
    expect(proposal.proposal.description).toContain('human-set guest level')
    expect(proposal.proposal.actions).toHaveLength(1)
    expect(proposal.proposal.actions[0].action).toMatchObject({ type: 'set_track_gain', trackId: 'track_host' })
  })

  it('rejects every agent mutation of a locked track', async () => {
    expect(await run('lock_track', { track_id: 'track_host' })).toMatchObject({ success: true, locked: true })

    expect(await run('ripple_delete_time_range', { start: 7.4, end: 9.2 })).toMatchObject({ success: false, error: 'LOCKED_OBJECT' })
    expect(await run('validate_edit_plan', { actions: [{ type: 'ripple_delete_range', start: 7.4, end: 9.2 }] })).toMatchObject({ success: false, error: 'LOCKED_OBJECT' })
    expect(await run('mute_track', { track_id: 'track_host' })).toMatchObject({ success: false, error: 'LOCKED_OBJECT' })
    expect(await run('solo_track', { track_id: 'track_host' })).toMatchObject({ success: false, error: 'LOCKED_OBJECT' })
    expect(await run('rename_track', { track_id: 'track_host', name: 'Changed through a lock' })).toMatchObject({ success: false, error: 'LOCKED_OBJECT' })
  })

  it('only advertises export scopes the editor can actually render', async () => {
    const options = await run('get_export_options')
    expect(options.scopes).toEqual(['full_mix', 'selection'])
  })

  it('does not mutate proposals after their lifecycle is complete', async () => {
    const created = await run('create_tighten_proposal')
    const proposalId = created.proposal.id
    const actionId = created.proposal.actions[0].id
    expect(await run('reject_proposal', { proposal_id: proposalId })).toMatchObject({ success: true })
    expect(await run('reject_proposal_action', { proposal_id: proposalId, action_id: actionId })).toMatchObject({ success: false, error: 'PROPOSAL_NOT_PENDING' })
    expect(await run('reject_proposal', { proposal_id: proposalId })).toMatchObject({ success: false, error: 'PROPOSAL_NOT_PENDING' })
  })
})
