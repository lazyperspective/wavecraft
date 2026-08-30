import { Activity, Gauge, LockKeyhole, SlidersHorizontal, Sparkles } from 'lucide-react'
import { findClip } from '../domain/projectActions'
import { useWavecraftStore } from '../store/wavecraftStore'

const formatTime = (time: number) => {
  const minutes = Math.floor(time / 60)
  const seconds = time - minutes * 60
  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`
}

export function Inspector() {
  const project = useWavecraftStore((state) => state.project)
  const selection = useWavecraftStore((state) => state.selection)
  const dispatch = useWavecraftStore((state) => state.dispatch)
  const proposeTighten = useWavecraftStore((state) => state.proposeTighten)
  const setActivePanel = useWavecraftStore((state) => state.setActivePanel)

  if (selection.kind === 'clip') {
    const located = selection.clipIds[0] ? findClip(project, selection.clipIds[0]) : null
    if (!located) return null
    const { clip, track } = located
    return (
      <aside className="inspector" aria-label="Clip inspector">
        <div className="panel-kicker"><SlidersHorizontal size={13} /> CLIP INSPECTOR</div>
        <div className="inspector-title"><span className="object-swatch" style={{ background: track.color }} /><div><strong>{clip.name}</strong><small>{track.name} · Mono</small></div></div>
        <dl className="property-grid inspector-edit-grid">
          <div><dt>Position</dt><dd><input aria-label="Clip timeline position" type="number" min="0" step="0.01" value={clip.timelineStart} onChange={(event) => dispatch({ type: 'move_clip', clipId: clip.id, timelineStart: Number(event.target.value) })} /></dd></div>
          <div><dt>Trim end</dt><dd><input aria-label="Clip trim end" type="number" min={clip.timelineStart + 0.01} max={clip.timelineStart + clip.duration} step="0.01" value={clip.timelineStart + clip.duration} onChange={(event) => dispatch({ type: 'trim_clip_end', clipId: clip.id, newEnd: Number(event.target.value) })} /></dd></div>
          <div><dt>Duration</dt><dd>{clip.duration.toFixed(3)}s</dd></div>
          <div><dt>Speed</dt><dd>{clip.speed.toFixed(2)}×</dd></div>
        </dl>
        <label className="control-field"><span>Clip gain <output>{clip.gainDb > 0 ? '+' : ''}{clip.gainDb.toFixed(1)} dB</output></span><input type="range" min="-24" max="12" step="0.1" value={clip.gainDb} onChange={(event) => dispatch({ type: 'set_clip_gain', clipId: clip.id, gainDb: Number(event.target.value) })} /></label>
        <div className="dual-controls"><label><span>Fade in · seconds</span><input type="number" min="0" max={clip.duration} step="0.01" value={clip.fadeIn} onChange={(event) => dispatch({ type: 'set_clip_fades', clipId: clip.id, fadeIn: Number(event.target.value) })} /></label><label><span>Fade out · seconds</span><input type="number" min="0" max={clip.duration} step="0.01" value={clip.fadeOut} onChange={(event) => dispatch({ type: 'set_clip_fades', clipId: clip.id, fadeOut: Number(event.target.value) })} /></label></div>
        <div className="intent-note"><LockKeyhole size={14} /><span>{clip.manualRevision ? `Human override at revision ${clip.manualRevision}. Agents preserve this value.` : 'No manual override. Agent proposals may adjust this clip.'}</span></div>
      </aside>
    )
  }

  if (selection.kind === 'track') {
    const track = project.tracks.find((candidate) => candidate.id === selection.trackIds[0])
    if (!track) return null
    return (
      <aside className="inspector" aria-label="Track inspector">
        <div className="panel-kicker"><SlidersHorizontal size={13} /> TRACK INSPECTOR</div>
        <div className="inspector-title"><span className="object-swatch" style={{ background: track.color }} /><div><strong>{track.name}</strong><small>{track.role} · {track.clips.length} clip{track.clips.length === 1 ? '' : 's'}</small></div></div>
        <label className="control-field"><span>Track gain <output>{track.gainDb > 0 ? '+' : ''}{track.gainDb.toFixed(1)} dB</output></span><input type="range" min="-24" max="12" step="0.1" value={track.gainDb} onChange={(event) => dispatch({ type: 'set_track_gain', trackId: track.id, gainDb: Number(event.target.value) })} /></label>
        <label className="control-field"><span>Pan <output>{track.pan === 0 ? 'Center' : track.pan < 0 ? `${Math.round(Math.abs(track.pan) * 100)}L` : `${Math.round(track.pan * 100)}R`}</output></span><input type="range" min="-1" max="1" step="0.01" value={track.pan} onChange={(event) => dispatch({ type: 'set_track_pan', trackId: track.id, pan: Number(event.target.value) })} /></label>
        <div className="analysis-card"><div><Activity size={15} /><span>Estimated loudness</span></div><strong>{track.id === 'track_guest' ? '-25.9' : track.id === 'track_host' ? '-20.5' : '-37.1'} LUFS</strong><small>{track.id === 'track_guest' ? '5.4 dB below host' : 'Integrated approximation'}</small></div>
      </aside>
    )
  }

  if (selection.kind === 'range') {
    const duration = selection.end - selection.start
    const intersectingLocks = project.locks.filter((lock) => lock.kind === 'range' && selection.start < (lock.end ?? 0) && selection.end > (lock.start ?? 0))
    const silences = project.analysis.silence.filter((range) => range.start >= selection.start && range.end <= selection.end)
    return (
      <aside className="inspector" aria-label="Time range inspector">
        <div className="panel-kicker"><Gauge size={13} /> RANGE INSPECTOR</div>
        <div className="range-time"><strong>{formatTime(selection.start)}</strong><i>→</i><strong>{formatTime(selection.end)}</strong></div>
        <div className="range-duration"><span>Selected duration</span><strong>{duration.toFixed(3)} s</strong></div>
        <dl className="property-grid compact">
          <div><dt>Long pauses</dt><dd>{silences.filter((item) => item.kind === 'silence').length}</dd></div>
          <div><dt>Protected</dt><dd>{intersectingLocks.length}</dd></div>
          <div><dt>Tracks</dt><dd>{selection.trackIds.length}</dd></div>
          <div><dt>Peak</dt><dd>{project.analysis.peakDb.toFixed(1)} dB</dd></div>
        </dl>
        <button className="agent-primary" onClick={() => { proposeTighten(); setActivePanel('changes') }}><Sparkles size={15} /><span><strong>Propose tighter edit</strong><small>Respect locks · keep dramatic pauses</small></span></button>
        <button className="secondary-wide" onClick={() => dispatch({ type: 'lock_range', start: selection.start, end: selection.end, label: 'Human-locked selection' })}><LockKeyhole size={14} /> Lock this range</button>
        {intersectingLocks.map((lock) => <div className="intent-note lock-note" key={lock.id}><LockKeyhole size={14} /><span><strong>{lock.label}</strong><small>{formatTime(lock.start ?? 0)} – {formatTime(lock.end ?? 0)}</small></span></div>)}
      </aside>
    )
  }

  return (
    <aside className="inspector empty-inspector"><SlidersHorizontal size={22} /><strong>Nothing selected</strong><p>Select a clip, track, or time range to inspect its live properties.</p></aside>
  )
}
