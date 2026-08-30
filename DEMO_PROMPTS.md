# Wavecraft demo prompts

These prompts are written for an external WebMCP-capable agent while the live editor is open.

## Signature demo

> Inspect what I selected and tighten it without changing anything locked. Preserve dramatic pauses and propose changes before applying.

Expected sequence: `inspect_selection` → `get_current_constraints` → `detect_long_pauses` → `create_tighten_proposal`.

## Partial human approval

After the proposal appears:

> Reject the first proposed removal, keep the other edits, and apply the proposal.

Expected sequence: `reject_proposal_action` → `apply_proposal` → `inspect_context`.

## Speaker balance

> Compare Host and Guest levels. Balance them without crushing dynamics, but propose changes first.

Expected sequence: `compare_track_levels` → `create_balance_proposal`.

## Manual override

After manually changing Guest gain in the inspector:

> Keep the guest level I just set manually. Fix the balance around it.

Expected behavior: `inspect_context` reports the manual revision; the balance proposal changes Host only.

## Lock safety

> Ripple-delete 19 to 21 seconds.

Expected result: structured `LOCKED_REGION` with `lock_key_quote`, exact timestamps, and a re-planning suggestion. No project mutation.

## Open-ended analysis

> Inspect this project and identify the three biggest audio problems. Create a safe proposal for the fixes you can perform; explain any issue you cannot fix with the available tools.

Expected behavior: the agent grounds its answer in `analyze_project`, `detect_clipping`, `detect_long_pauses`, and `compare_track_levels`; it does not claim unavailable denoise or restoration tools.
