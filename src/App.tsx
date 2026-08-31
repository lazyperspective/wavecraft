import { useCallback, useEffect, useRef, useState } from 'react'
import { Activity, Bot, ChevronDown, CircleHelp, Download, FastForward, Gauge, History, LockKeyhole, Maximize2, Menu, MousePointer2, Pause, Play, Redo2, Rewind, Save, Scissors, Settings2, SkipBack, SkipForward, Sparkles, Square, Undo2, Upload, ZoomIn, ZoomOut } from 'lucide-react'
import { audioEngine } from './audio/audioEngine'
import { downloadBlob, encodeWav, renderProject } from './audio/exportWav'
import { ensureDemoSources } from './audio/sourceRepository'
import { BottomPanel } from './components/BottomPanel'
import { Inspector } from './components/Inspector'
import { Timeline } from './components/Timeline'
import { ToolButton } from './components/ToolButton'
import type { Project, Track } from './domain/types'
import { useWavecraftStore } from './store/wavecraftStore'
import { createDemoProject } from './domain/demoProject'
import { analyzeProjectAudio } from './audio/analysis'

const formatTime = (time: number) => {
  const minutes = Math.floor(time / 60)
  const seconds = time - minutes * 60
  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`
}

function downloadProject(project: Project) {
  downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.wavecraft.json`)
}

export default function App() {
  const project = useWavecraftStore((state) => state.project)
  const selection = useWavecraftStore((state) => state.selection)
  const playback = useWavecraftStore((state) => state.playback)
  const view = useWavecraftStore((state) => state.view)
  const initializeDemo = useWavecraftStore((state) => state.initializeDemo)
  const demoReady = useWavecraftStore((state) => state.demoReady)
  const dispatch = useWavecraftStore((state) => state.dispatch)
  const undo = useWavecraftStore((state) => state.undo)
  const redo = useWavecraftStore((state) => state.redo)
  const historyPast = useWavecraftStore((state) => state.historyPast)
  const historyFuture = useWavecraftStore((state) => state.historyFuture)
  const setPlayhead = useWavecraftStore((state) => state.setPlayhead)
  const setPlaybackStatus = useWavecraftStore((state) => state.setPlaybackStatus)
  const setSelection = useWavecraftStore((state) => state.setSelection)
  const fitProject = useWavecraftStore((state) => state.fitProject)
  const zoom = useWavecraftStore((state) => state.zoom)
  const agentMode = useWavecraftStore((state) => state.agentMode)
  const setAgentMode = useWavecraftStore((state) => state.setAgentMode)
  const setActivePanel = useWavecraftStore((state) => state.setActivePanel)
  const replaceProject = useWavecraftStore((state) => state.replaceProject)
  const importSource = useWavecraftStore((state) => state.importSource)
  const inspectorOpen = useWavecraftStore((state) => state.inspectorOpen)
  const setInspectorOpen = useWavecraftStore((state) => state.setInspectorOpen)
  const lastError = useWavecraftStore((state) => state.lastError)
  const clearError = useWavecraftStore((state) => state.clearError)
  const webmcpStatus = useWavecraftStore((state) => state.webmcpStatus)
  const registeredToolCount = useWavecraftStore((state) => state.registeredToolCount)
  const fileInput = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

  useEffect(() => { initializeDemo() }, [initializeDemo])

  const stop = useCallback(() => {
    if (playback.status === 'playing') setPlayhead(Math.min(project.duration, audioEngine.currentTime()))
    audioEngine.stop(); setPlaybackStatus('stopped')
  }, [playback.status, project.duration, setPlaybackStatus, setPlayhead])

  const play = useCallback(async () => {
    if (playback.status === 'playing') { stop(); return }
    await audioEngine.play(project, playback.playhead >= project.duration ? 0 : playback.playhead, () => { setPlaybackStatus('stopped'); setPlayhead(0) }, setPlayhead)
    setPlaybackStatus('playing')
  }, [playback.playhead, playback.status, project, setPlaybackStatus, setPlayhead, stop])

  const deleteSelection = useCallback(() => {
    if (selection.kind === 'clip' && selection.clipIds[0]) dispatch({ type: 'delete_clip', clipId: selection.clipIds[0] })
    if (selection.kind === 'range' && selection.end > selection.start) dispatch({ type: 'ripple_delete_range', start: selection.start, end: selection.end })
    setSelection({ kind: 'none' })
  }, [dispatch, selection, setSelection])

  const split = useCallback(() => {
    if (selection.kind === 'clip' && selection.clipIds[0]) dispatch({ type: 'split_clip', clipId: selection.clipIds[0], time: playback.playhead })
  }, [dispatch, playback.playhead, selection])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.matches('input, textarea, select')) return
      if (event.code === 'Space') { event.preventDefault(); void play() }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection() }
      if (event.key.toLowerCase() === 's' && !event.metaKey && !event.ctrlKey) split()
      if (event.key.toLowerCase() === 'l' && selection.kind === 'range') dispatch({ type: 'lock_range', start: selection.start, end: selection.end, label: 'Human-locked selection' })
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteSelection, dispatch, play, redo, selection, split, undo])

  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return
    stop()
    const context = new AudioContext()
    const tracks: Track[] = []
    const sourceMetas: Project['sources'] = []
    let duration = 0
    for (const [index, file] of [...files].entries()) {
      const decoded = await context.decodeAudioData(await file.arrayBuffer())
      const id = `source_import_${Date.now()}_${index}`
      const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel).slice())
      importSource({ id, sampleRate: decoded.sampleRate, channels })
      sourceMetas.push({ id, name: file.name, sampleRate: decoded.sampleRate, duration: decoded.duration, channels: decoded.numberOfChannels, generated: false })
      const trackId = `track_import_${index + 1}`
      tracks.push({ id: trackId, name: file.name.replace(/\.[^.]+$/, ''), role: 'other', color: ['#59d5c9', '#b89cff', '#e8aa5b', '#67a9ff'][index % 4], gainDb: 0, pan: 0, muted: false, solo: false, locked: false, collapsed: false, clips: [{ id: `clip_import_${index + 1}`, trackId, sourceId: id, name: file.name, timelineStart: 0, sourceStart: 0, duration: decoded.duration, gainDb: 0, fadeIn: 0.02, fadeOut: 0.02, speed: 1, locked: false, manualRevision: 0 }] })
      duration = Math.max(duration, decoded.duration)
    }
    await context.close()
    const imported: Project = { schemaVersion: 1, id: `project_${Date.now()}`, name: files.length === 1 ? files[0].name.replace(/\.[^.]+$/, '') : 'Imported multitrack project', sampleRate: sourceMetas[0].sampleRate, duration, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revision: 0, sources: sourceMetas, tracks, markers: [], regions: [], locks: [], proposals: [], agentChanges: [], analysis: { peakDb: 0, rmsDb: -120, dynamicRangeDb: 0, clippingCount: 0, silence: [], notes: [] } }
    replaceProject({ ...imported, analysis: analyzeProjectAudio(imported) })
  }

  const exportWav = async () => {
    setExporting(true)
    await new Promise((resolve) => window.setTimeout(resolve, 20))
    const range = selection.kind === 'range' ? { start: selection.start, end: selection.end } : { start: 0, end: project.duration }
    const blob = encodeWav(renderProject(project, range))
    downloadBlob(blob, selection.kind === 'range' ? 'wavecraft-selection.wav' : 'wavecraft-mix.wav')
    setExporting(false)
  }

  if (!demoReady) return <div className="loading-screen"><div className="brand-mark"><span>W</span></div><strong>Preparing Wavecraft</strong><p>Generating original demo audio and waveform peaks…</p><i /></div>

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><span>W</span></div><div><strong>WAVECRAFT</strong><small>HUMAN + AGENT AUDIO</small></div></div>
        <div className="project-identity"><button className="project-menu" onClick={() => setActivePanel('history')}><span><small>PROJECT</small><strong>{project.name}</strong></span><ChevronDown size={14} /></button><span className="autosave-dot">Saved locally</span></div>
        <div className="top-actions">
          <ToolButton label="Undo" shortcut="⌘Z" icon={<Undo2 size={16} />} disabled={!historyPast.length} onClick={undo} />
          <ToolButton label="Redo" shortcut="⇧⌘Z" icon={<Redo2 size={16} />} disabled={!historyFuture.length} onClick={redo} />
          <span className="top-divider" />
          <button className="text-action" onClick={() => fileInput.current?.click()}><Upload size={15} />Import</button>
          <button className="text-action" onClick={() => downloadProject(project)}><Save size={15} />Save</button>
          <button className="export-button" disabled={exporting} onClick={() => void exportWav()}><Download size={15} />{exporting ? 'Rendering…' : 'Export'}<ChevronDown size={12} /></button>
          <input ref={fileInput} type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac" multiple hidden onChange={(event) => void importFiles(event.target.files)} />
          <button className={`webmcp-badge ${webmcpStatus}`} onClick={() => setActivePanel('webmcp')}><span /><Bot size={15} /><b>WebMCP</b><small>{webmcpStatus === 'native' ? 'LIVE' : webmcpStatus === 'polyfill' ? 'BRIDGE' : registeredToolCount ? `${registeredToolCount}` : '…'}</small></button>
          <ToolButton label="WebMCP settings" icon={<Settings2 size={16} />} onClick={() => setActivePanel('webmcp')} />
        </div>
      </header>

      <div className="transportbar">
        <div className="transport-controls">
          <ToolButton label="Go to start" icon={<SkipBack size={16} />} onClick={() => setPlayhead(0)} />
          <ToolButton label="Rewind five seconds" icon={<Rewind size={16} />} onClick={() => setPlayhead(playback.playhead - 5)} />
          <button className="play-button" aria-label={playback.status === 'playing' ? 'Pause' : 'Play'} onClick={() => void play()}>{playback.status === 'playing' ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
          <ToolButton label="Stop" icon={<Square size={14} fill="currentColor" />} onClick={stop} />
          <ToolButton label="Forward five seconds" icon={<FastForward size={16} />} onClick={() => setPlayhead(playback.playhead + 5)} />
          <ToolButton label="Go to end" icon={<SkipForward size={16} />} onClick={() => setPlayhead(project.duration)} />
        </div>
        <div className="time-display"><span className={playback.status === 'playing' ? 'live' : ''} /><strong>{formatTime(playback.playhead)}</strong><small>/ {formatTime(project.duration)}</small></div>
        <div className="edit-tools">
          <ToolButton label="Selection tool" shortcut="V" active icon={<MousePointer2 size={15} />} />
          <ToolButton label="Split selected clip" shortcut="S" icon={<Scissors size={15} />} onClick={split} disabled={selection.kind !== 'clip'} />
          <ToolButton label="Lock selected range" shortcut="L" icon={<LockKeyhole size={15} />} onClick={() => selection.kind === 'range' && dispatch({ type: 'lock_range', start: selection.start, end: selection.end, label: 'Human-locked selection' })} disabled={selection.kind !== 'range'} />
          <span className="transport-divider" />
          <ToolButton label="Zoom out" icon={<ZoomOut size={15} />} onClick={() => zoom(0.72, playback.playhead)} />
          <ToolButton label="Zoom in" icon={<ZoomIn size={15} />} onClick={() => zoom(1.4, playback.playhead)} />
          <ToolButton label="Fit project" icon={<Maximize2 size={15} />} onClick={fitProject} />
          <div className="zoom-readout">{Math.round(48 / (view.end - view.start) * 100)}%</div>
        </div>
        <div className="agent-mode"><span><Bot size={14} />Agent editing</span><div><button className={agentMode === 'propose' ? 'active' : ''} onClick={() => setAgentMode('propose')}>Propose first</button><button className={agentMode === 'direct' ? 'active direct' : ''} onClick={() => setAgentMode('direct')}>Direct</button></div></div>
      </div>

      <main className={`editor-main ${inspectorOpen ? '' : 'inspector-closed'}`}>
        <div className="workspace-column">
          <div className="judge-strip"><div><span className="judge-label">JUDGE MODE</span><strong>Edit with your hands. Direct with language.</strong><small>Try with your agent:</small><code>“Inspect what I selected and tighten it without changing the locked region.”</code></div><button onClick={() => { const demo = createDemoProject(); ensureDemoSources(demo); replaceProject({ ...demo, analysis: analyzeProjectAudio(demo) }); setSelection({ kind: 'range', start: 4.8, end: 43.2, trackIds: ['track_host', 'track_guest'] }); fitProject() }}><Sparkles size={14} />Reset demo project</button></div>
          <Timeline />
          <BottomPanel />
        </div>
        {inspectorOpen && <Inspector />}
        <button className="inspector-toggle" onClick={() => setInspectorOpen(!inspectorOpen)} aria-label={`${inspectorOpen ? 'Close' : 'Open'} inspector`}><Menu size={14} /></button>
      </main>
      <footer className="statusbar"><div><span className="status-item"><Gauge size={12} />44.1 kHz</span><span className="status-item">32-bit float engine</span><span className="status-item"><Activity size={12} />{project.tracks.length} tracks · {project.tracks.reduce((sum, track) => sum + track.clips.length, 0)} clips</span></div><div><span className="status-item">Selection: {selection.kind === 'range' ? `${(selection.end - selection.start).toFixed(3)}s` : selection.kind}</span><span className="status-item"><History size={12} />Revision {project.revision}</span><button onClick={() => setShowShortcuts(true)}><CircleHelp size={12} />Shortcuts</button></div></footer>
      {lastError && <div className="error-toast" role="alert"><div><strong>{lastError.code.replaceAll('_', ' ')}</strong><p>{lastError.message}</p></div><button onClick={clearError}>Dismiss</button></div>}
      {showShortcuts && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowShortcuts(false)}><section className="shortcuts-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onMouseDown={(event) => event.stopPropagation()}><header><div><span>KEYBOARD</span><strong>Wavecraft shortcuts</strong></div><button onClick={() => setShowShortcuts(false)}>Close</button></header><dl><div><dt>Play / pause</dt><dd>Space</dd></div><div><dt>Undo</dt><dd>⌘ Z</dd></div><div><dt>Redo</dt><dd>⇧ ⌘ Z</dd></div><div><dt>Split selected clip</dt><dd>S</dd></div><div><dt>Lock selected range</dt><dd>L</dd></div><div><dt>Delete selection</dt><dd>Delete</dd></div></dl></section></div>}
    </div>
  )
}
