# Wavecraft architecture

## Product invariant

There is one authoritative project graph. Human UI actions and WebMCP calls inspect and mutate that same graph through the same public command layer.

## Project graph

`Project` owns stable sources, tracks, clips, markers, regions, locks, proposals, agent changes, analysis, and revision metadata. Clips are non-destructive references into immutable PCM sources:

```text
Clip = sourceId + sourceStart + duration + timelineStart
       + gain + pan via track + speed + fades + lock metadata
```

Splitting creates two references into the same source. Trimming changes source/timeline boundaries. Ripple deletion partitions intersecting clips and shifts later media; it does not rewrite the original PCM.

## Command and validation layer

`applyProjectAction(project, action, origin)` is a pure function. It validates IDs, time bounds, ranges, gains, and locks before producing the next immutable project revision.

Important invariants:

- An action never mutates its input project.
- No action silently intersects a locked range or object.
- Every clip remains within its source and has positive duration.
- Ripple edits apply to every track so synchronization is preserved.
- Markers, regions, locks, and analysis evidence move with earlier ripple edits.
- Human clip/track gain changes set `manualRevision`.

## Store and history

The Zustand store owns editor context around the graph: selection, playhead, playback status, loop, visible timeline, agent mode, tool-call log, and undo/redo checkpoints.

Normal actions add one checkpoint. Proposal application validates every included action against the current graph, computes the complete next graph, and only then replaces state, producing one atomic checkpoint.

Generated-demo metadata autosaves to local storage. PCM sources are regenerated deterministically and are deliberately kept out of JSON history snapshots.

## Audio pipeline

- `sourceRepository` owns `Float32Array` PCM sources.
- The original judge demo synthesizes dialogue-like waveforms and room tone locally.
- `AudioEngine` caches one `AudioBuffer` per source and schedules every visible clip with live gain, pan, playback-rate, and fade envelopes.
- `renderProject` performs an offline stereo mix of the same graph and `encodeWav` writes 16-bit PCM WAV.
- `analyzeProjectAudio` scans the real PCM for peak, RMS, dynamic range, clipped samples, and combined-dialogue pause ranges.

## WebMCP boundary

`createWavecraftTools()` defines 68 tools with stable names, descriptions, JSON schemas, annotations, and structured results. Tool handlers read from `useWavecraftStore.getState()` at execution time, so returned context can never be a stale registration snapshot.

Registration uses the canonical document surface and one lifecycle controller:

```text
document.modelContext.registerTool(definition, { signal })
```

Significant direct-edit tools consult `agentMode`. In Propose First mode they validate the action and create a proposal. Locks override both modes.

## Failure model

Domain errors have a stable code, message, and structured details. WebMCP handlers catch them at the boundary and return, for example:

```json
{
  "success": false,
  "error": "LOCKED_REGION",
  "message": "This operation intersects locked range…",
  "lockId": "lock_key_quote",
  "lockedRange": { "start": 18.2, "end": 23.4 },
  "suggestion": "Re-plan around this range or ask the human to unlock it."
}
```

This is both safer for the human and more useful for an agent than a rejected click or generic exception.
