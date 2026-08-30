# Judge testing guide

## Live app

**https://wavecraft-webmcp.vercel.app**

No authentication, upload, account, API key, or microphone permission is required. The app and original demo audio are generated client-side.

## Browser

- Preferred: ChatGPT’s in-app browser, which the challenge identifies as WebMCP-capable.
- Chrome: use the challenge-supported build and enable `chrome://flags/#enable-webmcp-testing` if required.

## 60-second verification

1. Open the live URL. The three-track demo and a 38.4-second blue selection appear immediately.
2. Confirm the amber **Human-approved key quote** lock inside the selection.
3. Open the **WebMCP** panel. It should report **68 tools**.
4. Ask your agent:

   > Inspect what I selected and tighten it without changing the locked region. Propose changes first.

5. Expected calls: `inspect_context` or `inspect_selection`, `detect_long_pauses`, then `create_tighten_proposal`.
6. Expected UI: four red removal overlays, original/new duration, and four individual proposal actions. The short locked dramatic pause is absent from the removals.
7. Reject any one proposal action, then apply the remaining three.
8. Expected result: every track ripples together, duration becomes about 42.1 seconds, the blue selection contracts, the amber lock remains attached to its original audio, an Agent Changes entry appears, and Undo becomes available.

## Recommended prompts

### 1. Selection + lock + visual proposal

> Inspect what I selected and tighten it without changing anything locked. Preserve dramatic pauses and show me a proposal before applying.

Expected: selection inspection, four detected long pauses, one protected dramatic pause, and a visual proposal without immediate mutation.

### 2. Speaker balance + human override

> Compare the Host and Guest levels. Balance them without crushing dynamics, but propose changes first.

Expected: `compare_track_levels` and `create_balance_proposal`; the proposal uses gain changes only.

Then manually adjust Guest gain in the inspector and ask:

> Keep the guest level I just set manually. Fix the balance around it.

Expected: the new proposal preserves Guest and adjusts Host only.

### 3. Structured safety error

> Ripple-delete 19 to 21 seconds.

Expected: a structured `LOCKED_REGION` result naming `lock_key_quote`, its exact range, and a re-planning suggestion. The waveform must not change.

## Useful direct tool workflow

An external agent can complete the challenge acceptance path without pixel clicks:

```text
inspect_project
inspect_selection
detect_long_pauses
get_current_constraints
create_tighten_proposal
inspect_proposal
reject_proposal_action (optional)
apply_proposal
inspect_context
```

## Manual editor checks

- Space toggles real playback.
- Click a clip, move the playhead inside it, and press S to split.
- Edit Position, Trim end, Fade in, Fade out, or Gain in the clip inspector.
- Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z undo/redo.
- Export renders a real WAV; with a time range selected, Export renders that range.
- Save downloads project JSON.

## Troubleshooting

- **WebMCP says BRIDGE:** the browser does not expose native WebMCP. The local bridge still lets the UI show and test the registered surface, but use ChatGPT’s in-app browser or challenge-enabled Chrome for external-agent invocation.
- **No sound:** click Play once; browsers require a user gesture before starting an `AudioContext`.
- **An edit is rejected:** inspect `error`, `message`, and the returned lock/range details. Locks intentionally override Direct mode.
- **Want a clean state:** click **Reset demo project** in the Judge Mode strip.

## Verified build

On August 31, 2026:

- anonymous HTTPS production load: passed;
- WebMCP discovery on production: 68 tools;
- complete inspect → analyze → propose → reject one → apply → inspect workflow: passed;
- production build, lint, 12 automated tests, and production dependency audit: passed;
- browser console after reload: zero errors and zero warnings.
