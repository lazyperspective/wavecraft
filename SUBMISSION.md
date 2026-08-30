# Wavecraft submission copy

## 50-word version

Wavecraft is a multitrack audio editor where humans and agents share one live project. Humans select and lock waveform regions; agents inspect that exact state through 68 WebMCP tools, analyze real PCM, and create visual edit proposals. Deterministic edits, structured lock errors, manual overrides, and undo keep people in control.

## 150-word version

Wavecraft is a browser-based multitrack audio editor designed for humans and external agents to share the same editing surface.

Humans work visually with real waveforms, selections, clips, locks, gain, fades, and direct manipulation. Agents work through 68 WebMCP tools exposing the exact live project: stable object IDs, selected timestamps, playhead, timeline view, analysis, constraints, proposals, and history.

A person can highlight 38 seconds and ask, “Tighten this without touching what I locked.” The agent does not infer “this” from pixels. It inspects the selection, detects pauses in the actual PCM, re-plans around the lock, and creates red removal overlays. The person can reject one edit and apply the rest atomically across every track.

Wavecraft also tracks manual overrides. If the person changes Guest gain, later balance proposals preserve that decision. Instead of teaching agents to click through audio software, Wavecraft makes professional editing state directly understandable and safely operable.

## Full version

### What it is

Wavecraft is a real browser multitrack audio editor built around a simple idea: the human interface and the agent interface should be first-class views of the same document.

The human gets a dense, professional waveform editor with playback, multitrack clips, selections, markers, hard locks, gain/pan, fades, split/trim/move/delete, synchronized ripple edits, undo/redo, PCM analysis, WAV export, and project JSON. The external agent gets 68 WebMCP tools over that exact live graph.

### A. Why is this use case a strong fit for WebMCP?

Audio editing is precise, stateful, time-based work. A browser agent looking at pixels must guess which waveform is selected, infer timestamps from a ruler, distinguish a marker from a lock, click small controls, and then determine whether the edit actually changed the intended media. That workflow is slow and brittle.

WebMCP exposes the semantic editing document directly: selected range, clip and track IDs, source/timeline boundaries, playhead, visible time range, locks, manual revisions, proposals, analysis evidence, and history. The agent can reason over exact state and invoke deterministic operations instead of approximating gestures.

The most important example is the word “this.” In Wavecraft, a human can drag across a waveform and say “tighten this.” `inspect_selection` resolves “this” to exact timestamps and affected objects without the human restating them.

### B. How does WebMCP create a better user experience?

It removes translation work while increasing control. The user makes a visual decision once; the agent receives it as structured context. Significant edits default to visual proposals, so the human sees red removal ranges and duration impact before audio changes.

Locks make human intent enforceable. If a seven-second quote is locked, every relevant action validates against that constraint. A conflict returns a structured `LOCKED_REGION` error with the exact protected range and a re-planning suggestion. Direct mode cannot bypass it.

The proposal system also supports partial approval. A user can reject one removal, keep the other three, and apply the plan atomically. Undo restores the previous complete graph.

### C. What can people and agents do together that was difficult or impossible before?

- Point at audio visually and use natural references such as “this section” without typing timestamps.
- Express “do not touch this” as a hard, machine-readable constraint instead of a fragile instruction.
- Let an agent analyze actual PCM, propose several deterministic edits, and render those edits as waveform diffs.
- Accept or reject individual agent changes before one synchronized multitrack apply.
- Manually override an agent’s gain decision and have future proposals preserve the human-set value.
- Inspect a complete shared agent-change history tied to real editor revisions.

This creates a genuine mixed-initiative workflow: human judgment supplies meaning and taste; the agent supplies structured inspection, repetitive analysis, and precise execution.

### D. How was WebMCP implemented?

Wavecraft registers 68 imperative tools with `document.modelContext.registerTool`. Each definition has a stable spec-valid name, detailed usage/safety description, JSON input schema, structured return value, and read-only annotation where applicable. Registrations share an `AbortSignal` lifecycle.

The tools call the same public Zustand store and pure `applyProjectAction` command layer as the React UI. There is no duplicate agent model. Domain validation checks IDs, timestamps, gains, ranges, and locks. Significant tools consult the current Propose First/Direct mode; proposals are validated again at apply time and committed atomically.

Native WebMCP is feature-detected. An open-source polyfill provides the same local registration/discovery surface in ordinary browsers for development. The production app is tested in an unauthenticated HTTPS deployment, where all 68 tools are discoverable.

### What is novel

Wavecraft’s novelty is not “AI edits audio.” It is an audio editor whose live professional document model is designed for human and agent collaboration:

- selection as context;
- locks as intent;
- proposals as visual diffs;
- manual override as authority;
- structured iteration rather than one opaque magic command.

You use the waveform. Your agent uses WebMCP. Both edit the same project.

## Links

- Live app: https://wavecraft-webmcp.vercel.app
- Source: https://github.com/lazyperspective/wavecraft
- Testing: [JUDGE_TESTING.md](./JUDGE_TESTING.md)
- Demo script: [DEMO_SCRIPT.md](./DEMO_SCRIPT.md)
