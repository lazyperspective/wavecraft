import { Activity, Bot, Check, ChevronRight, CircleX, Clock3, Code2, History, ListMusic, LockKeyhole, RotateCcw, Sparkles, X } from 'lucide-react'
import { useWavecraftStore } from '../store/wavecraftStore'
import type { EditProposal } from '../domain/types'

const formatTime = (time: number) => {
  const minutes = Math.floor(time / 60)
  const seconds = time - minutes * 60
  return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`
}

const proposalMetrics = (proposal: EditProposal) => {
  const removed = proposal.actions
    .filter((action) => action.status !== 'rejected' && action.start !== undefined && action.end !== undefined)
    .reduce((sum, action) => sum + action.end! - action.start!, 0)
  return { duration: proposal.originalDuration - removed, removed }
}

export function BottomPanel() {
  const active = useWavecraftStore((state) => state.activePanel)
  const setActive = useWavecraftStore((state) => state.setActivePanel)
  const project = useWavecraftStore((state) => state.project)
  const recentToolCalls = useWavecraftStore((state) => state.recentToolCalls)
  const registeredToolCount = useWavecraftStore((state) => state.registeredToolCount)
  const webmcpStatus = useWavecraftStore((state) => state.webmcpStatus)
  const applyProposal = useWavecraftStore((state) => state.applyProposal)
  const rejectProposal = useWavecraftStore((state) => state.rejectProposal)
  const setProposalActionStatus = useWavecraftStore((state) => state.setProposalActionStatus)
  const setPlayhead = useWavecraftStore((state) => state.setPlayhead)
  const pending = project.proposals.filter((proposal) => proposal.status === 'pending')
  const tabs = [
    { id: 'changes' as const, label: 'Agent Changes', icon: Bot, badge: pending.length || undefined },
    { id: 'analysis' as const, label: 'Analysis', icon: Activity },
    { id: 'markers' as const, label: 'Markers', icon: ListMusic, badge: project.markers.length },
    { id: 'history' as const, label: 'History', icon: History, badge: project.revision },
    { id: 'webmcp' as const, label: 'WebMCP', icon: Code2, badge: registeredToolCount || undefined },
  ]
  return (
    <section className="bottom-panel" aria-label="Project details">
      <nav className="panel-tabs" aria-label="Detail panels">{tabs.map(({ id, label, icon: Icon, badge }) => <button key={id} className={active === id ? 'active' : ''} onClick={() => setActive(id)}><Icon size={14} />{label}{badge !== undefined && <span>{badge}</span>}</button>)}</nav>
      <div className="panel-content">
        {active === 'changes' && <div className="changes-layout">
          <div className="changes-feed">
            {pending.length === 0 && project.agentChanges.length === 0 && <div className="empty-panel"><Sparkles size={20} /><div><strong>No agent changes yet</strong><p>Select a range, then create a safe visual proposal.</p></div></div>}
            {pending.map((proposal) => <article className="proposal-card" key={proposal.id}>
              <header><div className="proposal-icon"><Sparkles size={16} /></div><div><span className="proposal-kicker">PROPOSED BY AGENT</span><h3>{proposal.title}</h3><p>{proposal.description}</p></div><div className="proposal-metric"><small>NEW DURATION</small><strong>{proposalMetrics(proposal).duration.toFixed(1)}s</strong><span>−{proposalMetrics(proposal).removed.toFixed(1)}s</span></div></header>
              <div className="proposal-actions">{proposal.actions.map((action) => <div key={action.id} className={action.status === 'rejected' ? 'rejected' : ''}>
                <button className="focus-action" onClick={() => action.start !== undefined && setPlayhead(action.start)}><span className="removal-swatch" /><span><strong>{action.label}</strong>{action.start !== undefined && <small>{formatTime(action.start)} → {formatTime(action.end ?? action.start)}</small>}</span><ChevronRight size={14} /></button>
                <button aria-label={action.status === 'rejected' ? 'Restore proposal action' : 'Reject proposal action'} onClick={() => setProposalActionStatus(proposal.id, action.id, action.status === 'rejected' ? 'pending' : 'rejected')}>{action.status === 'rejected' ? <RotateCcw size={13} /> : <X size={13} />}</button>
              </div>)}</div>
              <footer><div className="proposal-safety"><LockKeyhole size={13} /><span>{proposal.rationale[1]}</span></div><button className="reject-button" onClick={() => rejectProposal(proposal.id)}><CircleX size={14} /> Reject</button><button className="accept-button" onClick={() => applyProposal(proposal.id)}><Check size={14} /> Apply {proposal.actions.filter((action) => action.status !== 'rejected').length} edits</button></footer>
            </article>)}
            {project.agentChanges.map((change) => <article className="change-row" key={change.id}><div className="change-check"><Check size={13} /></div><div><strong>{change.explanation}</strong><small>{change.tool} · {new Date(change.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div><button aria-label="Focus change"><ChevronRight size={14} /></button></article>)}
          </div>
          <aside className="rationale-panel"><span className="panel-kicker">AGENT REASONING</span>{pending[0] ? <><h4>Why these changes?</h4><ul>{pending[0].rationale.map((reason) => <li key={reason}><Check size={12} />{reason}</li>)}</ul><div className="safety-banner"><LockKeyhole size={15} /><div><strong>Human intent protected</strong><p>Locked ranges are hard constraints in every tool call.</p></div></div></> : <><h4>Shared edit history</h4><p>Every applied agent action appears here with its originating tool and reversible state.</p></>}</aside>
        </div>}
        {active === 'analysis' && <div className="analysis-grid"><div><span>Peak amplitude</span><strong>{project.analysis.peakDb.toFixed(1)} dBFS</strong><small className="warn">{project.analysis.clippingCount} clipped peaks</small></div><div><span>Integrated RMS</span><strong>{project.analysis.rmsDb.toFixed(1)} dB</strong><small>Full project</small></div><div><span>Dynamic range</span><strong>{project.analysis.dynamicRangeDb.toFixed(1)} dB</strong><small>Natural dialogue</small></div><div><span>Long pauses</span><strong>{project.analysis.silence.filter((range) => range.kind === 'silence').length}</strong><small>{project.analysis.silence.filter((range) => range.kind === 'silence').reduce((sum, range) => sum + range.duration, 0).toFixed(1)} seconds total</small></div>{project.analysis.notes.map((note) => <p key={note}><Activity size={13} />{note}</p>)}</div>}
        {active === 'markers' && <div className="marker-list">{project.markers.map((marker) => <button key={marker.id} onClick={() => setPlayhead(marker.time)}><i style={{ background: marker.color }} /><strong>{marker.label}</strong><span>{formatTime(marker.time)}</span><ChevronRight size={14} /></button>)}</div>}
        {active === 'history' && <div className="history-list"><div><Clock3 size={15} /><span><strong>Revision {project.revision}</strong><small>Current project state</small></span></div>{project.agentChanges.map((change) => <div key={change.id}><Bot size={15} /><span><strong>{change.explanation}</strong><small>{change.tool}</small></span></div>)}</div>}
        {active === 'webmcp' && <div className="webmcp-panel"><div className="webmcp-summary"><span className={`status-orb ${webmcpStatus}`} /><div><strong>WebMCP {webmcpStatus === 'native' ? 'connected natively' : webmcpStatus === 'polyfill' ? 'bridge ready' : webmcpStatus}</strong><small>{registeredToolCount} deterministic tools registered from the live editor state</small></div></div><div className="tool-call-list"><span className="panel-kicker">RECENT CALLS</span>{recentToolCalls.length ? recentToolCalls.map((call) => <div key={call.id}><Code2 size={13} /><code>{call.name}</code><span>{call.summary}</span><i className={call.success ? 'success' : 'error'}>{call.success ? 'OK' : 'ERR'}</i></div>) : <p>No calls yet. Open this page with a WebMCP-capable agent and inspect the project.</p>}</div></div>}
      </div>
    </section>
  )
}
