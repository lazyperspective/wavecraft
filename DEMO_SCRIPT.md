# Wavecraft demo script

Target runtime: **2:38**. Hard stop: **2:45**.

No intro animation. Start on the loaded waveform. Narration should be recorded cleanly with no copyrighted music.

| Time | Screen action | Narration | WebMCP calls visible |
|---:|---|---|---|
| 0:00–0:08 | Full editor already open. Briefly point to blue selection, amber lock, and WebMCP 68 badge. | “Audio editors were built for humans using a mouse. Wavecraft is built for humans and their agents.” | — |
| 0:08–0:18 | Press Play for two seconds, then stop. Show real meters/waveforms and the three tracks. | “This is a real local multitrack project: generated source audio, Web Audio playback, non-destructive clips, analysis, undo, and WAV export.” | `inspect_project` |
| 0:18–0:31 | Keep the existing 38.4-second selection. Send prompt: **Inspect what I selected and tighten it without changing anything locked. Propose changes first.** | “I selected the conversation visually. I did not type a timestamp. My agent asks the page what ‘this’ means.” | `inspect_selection` |
| 0:31–0:43 | Open WebMCP panel or recent-call strip, then Analysis. | “The page returns the exact range, affected clips, and the protected quote. Local PCM analysis finds four long removable pauses and one shorter dramatic pause inside the lock.” | `get_current_constraints`, `detect_long_pauses` |
| 0:43–0:58 | Proposal appears. Four red striped overlays animate over the waveforms; duration changes from 38.4 to about 30.5 seconds. | “Instead of mutating audio immediately, Wavecraft creates a visual edit proposal. Every red range is a deterministic cut. The amber range is untouched.” | `create_tighten_proposal` |
| 0:58–1:10 | Reject the first proposal action. Show overlay disappear and duration metric update. | “I disagree with one cut, so I reject only that action. Human judgment stays in the loop.” | `reject_proposal_action` |
| 1:10–1:23 | Apply remaining three. Waveforms contract together. Show Agent Changes and Undo. | “The remaining edits apply atomically across all tracks. The selection contracts, the lock moves with its original audio, and one undo checkpoint records the agent action.” | `apply_proposal`, `inspect_context` |
| 1:23–1:36 | Trigger or display a call attempting ripple delete from 19 to 21 seconds on a clean/reset demo. Show structured error in WebMCP panel. | “Locks are not prompt suggestions. They are hard constraints. A conflicting call returns the exact lock and tells the agent to re-plan. Even Direct mode cannot bypass it.” | `ripple_delete_time_range` → `LOCKED_REGION` |
| 1:36–1:50 | Reset demo. Ask: **Compare Host and Guest. Balance them without crushing dynamics, but propose first.** Show Guest −5.4 dB and balance proposal. | “The guest is quieter. The agent compares live track levels and proposes gain-only changes, preserving natural dynamics.” | `compare_track_levels`, `create_balance_proposal` |
| 1:50–2:04 | Apply. Select Guest, manually adjust gain in inspector. Ask: **Keep my guest level. Fix the balance around it.** | “Now I manually change Guest. Wavecraft marks that revision as authoritative. The next proposal keeps my value and adjusts Host around it.” | `inspect_context`, `create_balance_proposal` |
| 2:04–2:17 | Open Agent Changes, then WebMCP. Scroll recent calls and show 68 tools. | “Every agent edit has an originating tool, explanation, affected objects, proposal, and reversible history. Judges can inspect all 68 registered tools.” | `get_agent_change_history` |
| 2:17–2:29 | Show Export, Save, shortcuts, and real waveform once more. | “The result remains a normal professional editor: keyboard accessible, locally rendered, serializable, and exportable.” | `get_export_options` |
| 2:29–2:38 | Return to hero editor frame with selection/lock visible. | “You use the waveform. Your agent uses WebMCP. Both edit the same project. This is Wavecraft.” | — |

## Capture checklist

- Record at 1440×900 or 1920×1080, 30 fps.
- Keep browser chrome minimal but leave the live HTTPS origin visible once.
- Increase pointer size slightly; avoid frantic movement.
- Pause long enough for proposal overlays and structured errors to be read.
- Narration must remain intelligible at normal playback speed.
- Verify the final edit is under three minutes after YouTube processing.
- Use only Wavecraft’s original generated demo audio; no background music is necessary.
