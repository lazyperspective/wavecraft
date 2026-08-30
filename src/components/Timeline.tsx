import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { LockKeyhole, Volume2, VolumeX } from 'lucide-react'
import { useWavecraftStore } from '../store/wavecraftStore'
import type { Clip, Track } from '../domain/types'
import { WaveformCanvas } from './WaveformCanvas'

const formatRuler = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds - mins * 60
  const precision = secs < 10 ? 1 : 0
  return `${mins}:${secs.toFixed(precision).padStart(precision ? 4 : 2, '0')}`
}

function TrackControls({ track }: { track: Track }) {
  const dispatch = useWavecraftStore((state) => state.dispatch)
  const selection = useWavecraftStore((state) => state.selection)
  const selected = selection.kind === 'track' && selection.trackIds.includes(track.id)
  const setSelection = useWavecraftStore((state) => state.setSelection)
  return (
    <div className={`track-controls ${selected ? 'selected' : ''}`} onClick={() => setSelection({ kind: 'track', trackIds: [track.id] })}>
      <div className="track-heading"><span className="track-dot" style={{ background: track.color }} /><strong>{track.name}</strong><span className="channel-pill">MONO</span></div>
      <div className="track-actions">
        <button className={track.muted ? 'is-on' : ''} onClick={(event) => { event.stopPropagation(); dispatch({ type: 'toggle_track_mute', trackId: track.id }) }} aria-label={`${track.muted ? 'Unmute' : 'Mute'} ${track.name}`}>{track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />} M</button>
        <button className={track.solo ? 'is-on solo' : ''} onClick={(event) => { event.stopPropagation(); dispatch({ type: 'toggle_track_solo', trackId: track.id }) }} aria-label={`${track.solo ? 'Unsolo' : 'Solo'} ${track.name}`}>S</button>
        <button className={track.locked ? 'is-on lock' : ''} onClick={(event) => { event.stopPropagation(); dispatch({ type: 'toggle_track_lock', trackId: track.id }) }} aria-label={`${track.locked ? 'Unlock' : 'Lock'} ${track.name}`}><LockKeyhole size={12} /></button>
      </div>
      <div className="mini-meter"><span style={{ width: `${Math.max(5, 68 + track.gainDb * 3)}%`, background: track.color }} /></div>
      <div className="track-readout"><span>{track.gainDb > 0 ? '+' : ''}{track.gainDb.toFixed(1)} dB</span><span>{track.pan === 0 ? 'C' : track.pan < 0 ? `L${Math.round(Math.abs(track.pan) * 100)}` : `R${Math.round(track.pan * 100)}`}</span></div>
    </div>
  )
}

function ClipView({ clip, track, viewStart, viewEnd }: { clip: Clip; track: Track; viewStart: number; viewEnd: number }) {
  const selection = useWavecraftStore((state) => state.selection)
  const setSelection = useWavecraftStore((state) => state.setSelection)
  const setPlayhead = useWavecraftStore((state) => state.setPlayhead)
  const selected = selection.kind === 'clip' && selection.clipIds.includes(clip.id)
  const span = viewEnd - viewStart
  const left = ((clip.timelineStart - viewStart) / span) * 100
  const width = (clip.duration / span) * 100
  return (
    <div className={`timeline-clip ${selected ? 'selected' : ''} ${clip.locked || track.locked ? 'locked' : ''}`} style={{ left: `${left}%`, width: `${width}%`, '--track-color': track.color } as React.CSSProperties}
      onPointerDown={(event) => { event.stopPropagation(); setSelection({ kind: 'clip', clipIds: [clip.id] }); const bounds = event.currentTarget.parentElement!.getBoundingClientRect(); setPlayhead(viewStart + ((event.clientX - bounds.left) / bounds.width) * span) }}>
      <div className="clip-title"><span>{clip.name}</span><span>{clip.gainDb ? `${clip.gainDb > 0 ? '+' : ''}${clip.gainDb} dB` : ''}</span></div>
      <WaveformCanvas clip={clip} color={track.color} selected={selected} />
      {(clip.locked || track.locked) && <LockKeyhole size={12} className="clip-lock" />}
    </div>
  )
}

export function Timeline() {
  const project = useWavecraftStore((state) => state.project)
  const selection = useWavecraftStore((state) => state.selection)
  const playback = useWavecraftStore((state) => state.playback)
  const view = useWavecraftStore((state) => state.view)
  const setSelection = useWavecraftStore((state) => state.setSelection)
  const setPlayhead = useWavecraftStore((state) => state.setPlayhead)
  const dispatch = useWavecraftStore((state) => state.dispatch)
  const timelineRef = useRef<HTMLDivElement>(null)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const span = view.end - view.start
  const ticks = useMemo(() => {
    const rough = span / 8
    const steps = [0.25, 0.5, 1, 2, 5, 10, 15, 30, 60]
    const step = steps.find((candidate) => candidate >= rough) ?? 60
    const values: number[] = []
    for (let time = Math.ceil(view.start / step) * step; time <= view.end; time += step) values.push(time)
    return values
  }, [span, view.end, view.start])
  const timeAt = (event: PointerEvent) => {
    const bounds = timelineRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(project.duration, view.start + ((event.clientX - bounds.left) / bounds.width) * span))
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const time = timeAt(event); setDragStart(time); setPlayhead(time)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart === null) return
    const time = timeAt(event)
    setSelection({ kind: 'range', start: Math.min(dragStart, time), end: Math.max(dragStart, time), trackIds: project.tracks.map((track) => track.id) })
  }
  const onPointerUp = () => setDragStart(null)
  const selectionStyle = selection.kind === 'range' ? { left: `${((selection.start - view.start) / span) * 100}%`, width: `${((selection.end - selection.start) / span) * 100}%` } : null
  const pendingActions = project.proposals.filter((proposal) => proposal.status === 'pending').flatMap((proposal) => proposal.actions.filter((action) => action.status !== 'rejected'))
  return (
    <section className="timeline-shell" aria-label="Multitrack audio timeline">
      <div className="timeline-header-left"><span>TRACKS</span><button aria-label="Add track" onClick={() => dispatch({ type: 'create_track', name: `Track ${project.tracks.length + 1}`, role: 'other' })}>+</button></div>
      <div className="ruler">
        {ticks.map((time) => <div key={time} className="ruler-tick" style={{ left: `${((time - view.start) / span) * 100}%` }}><span>{formatRuler(time)}</span></div>)}
        {project.markers.map((marker) => <button key={marker.id} className="marker" style={{ left: `${((marker.time - view.start) / span) * 100}%`, '--marker-color': marker.color } as React.CSSProperties} aria-label={`${marker.label} at ${formatRuler(marker.time)}`} onClick={() => setSelection({ kind: 'marker', markerIds: [marker.id] })}><i /><span>{marker.label}</span></button>)}
      </div>
      <div className="tracks-scroll">
        <div className="track-controls-stack">{project.tracks.map((track) => <TrackControls key={track.id} track={track} />)}</div>
        <div className="timeline-grid" ref={timelineRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {ticks.map((time) => <span key={time} className="grid-line" style={{ left: `${((time - view.start) / span) * 100}%` }} />)}
          {project.tracks.map((track) => <div className="track-lane" key={track.id}>{track.clips.map((clip) => <ClipView key={clip.id} clip={clip} track={track} viewStart={view.start} viewEnd={view.end} />)}</div>)}
          {selectionStyle && <div className="range-selection" style={selectionStyle}><span>{(selection as Extract<typeof selection, { kind: 'range' }>).start.toFixed(3)}</span><span>{((selection as Extract<typeof selection, { kind: 'range' }>).end - (selection as Extract<typeof selection, { kind: 'range' }>).start).toFixed(2)}s</span></div>}
          {project.locks.filter((lock) => lock.kind === 'range').map((lock) => <div key={lock.id} className="locked-range" style={{ left: `${(((lock.start ?? 0) - view.start) / span) * 100}%`, width: `${((((lock.end ?? 0) - (lock.start ?? 0)) / span) * 100)}%` }}><LockKeyhole size={11} /><span>{lock.label}</span></div>)}
          {pendingActions.filter((action) => action.start !== undefined && action.end !== undefined).map((action) => <div key={action.id} className="proposal-range" style={{ left: `${((action.start! - view.start) / span) * 100}%`, width: `${((action.end! - action.start!) / span) * 100}%` }}><span>{action.label}</span></div>)}
          <div className={`playhead ${playback.status === 'playing' ? 'playing' : ''}`} style={{ left: `${((playback.playhead - view.start) / span) * 100}%` }}><i /></div>
        </div>
      </div>
    </section>
  )
}
