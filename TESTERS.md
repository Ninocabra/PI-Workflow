# PI Workflow — Tester Brief

**Version under test:** `33-opt-9u-redesign-rc1` (2026-05-20)
**Repo:** https://github.com/Ninocabra/PI-Workflow

---

## What's new in this build

This is a **visual redesign** of PI Workflow. The pipeline logic is
identical to the previous release; the chrome, panels, sliders, combos,
buttons and module bodies are rebuilt around a unified amber-on-dark
theme. Detailed change list in `CHANGELOG.md` under
`[33-opt-9u-redesign-rc1]`.

A/B-friendly: the redesigned build ships as `PI Workflow 2.js` so it
can coexist next to the previous shell. Both can be installed and the
script menu lists them as `PI Workflow` (legacy) and `PI Workflow_2`
(redesign).

---

## What it is

PixInsight JavaScript workflow that unifies pre-processing →
stretching → star repair → post-processing in a single dialog.
Targets RGB, MONO (R/G/B/L) and Narrowband (H/O/S + dual-band HO/OS)
inputs.

## Install (3 steps)

1. Copy these three files into the **same** folder
   (e.g. `PixInsight/src/scripts/PI Workflow/`):
   - `PI Workflow 2.js`
   - `PI Workflow_help.xhtml`
   - `PI Workflow_resources.jsh`
2. In PixInsight: **Script → Feature Scripts → Add**, select that
   folder, restart if the menu entry does not appear.
3. Run from **Script → Utilities → PI_Workflow_2**.

For optional dependencies (BlurXTerminator, NoiseXTerminator,
GraXpert, VeraLux, MGC, DBXtract, etc.) press the **Repositories**
button in the script — it lists each tool, the repository URL, and
what PI Workflow uses it for.

When you are ready to retire the legacy shell, rename
`PI Workflow 2.js` to `PI Workflow.js` (replacing the old file) and
change the `#feature-id` declaration at the top from
`Utilities > PI_Workflow_2` to `Utilities > PI_Workflow`. The XHTML
help and the resources file work as-is.

## What to test (priority order)

### Visual / interaction

1. **Header**: confirm the painted π logo renders, the version pill
   reads correctly, and Thanks / Repositories / Help open their
   respective dialogs.
2. **Tab navigation**: click through the four tab pills at the top
   (Pre Processing / Stretching / Post Processing / Channel
   Combination). The active tab should fill amber with a dark chip;
   inactive tabs stay muted. The `To Stretching` and `To Post`
   buttons should also flip the visible tab (programmatic switches).
3. **Section bars**: click anywhere on a section header — toggle
   visual, title, chevron, empty space — every part of the strip
   should expand / collapse the body. Only one section open at a
   time per tab.
4. **Module body**: confirm every expanded body has the amber-tint
   background and the soft amber-ring border so the active module is
   visually delimited from the surrounding panel.
5. **Memory bank + Mask memory**: left-click stores; right-click
   recalls; RESET clears. Both rows should be vertically aligned
   (MEMORY and MASK labels in the same column, chip pills aligned).
6. **Combine row**: in R+G+B mode the two pills "Combine RGB" and
   "Separately" should split the row 50/50 without text truncation.
   Right-click the `L` channel label with an L view selected to
   reveal the "L wt %" slider (its track should run the full panel
   width).
7. **NB recipe palette**: 12 pills in 3 rows × 4. Click any to set
   the palette; the active one fills amber.

### Functional smoke test (unchanged from previous releases)

8. **Pre-processing pipeline**: load a master, run plate solving
   (status pill goes amber → green), apply gradient correction
   (try every algorithm), apply color calibration (the three action
   cards: SPCC primary, Auto Linear Fit, Bkg. Neutralization), apply
   deconvolution (BlurXTerminator subcards: Stars, Nonstellar,
   Output). Verify each candidate preview can be promoted with
   **Use this Image** — the button should flip from amber READY to
   green APPLIED.
9. **NB dual-band combine via DBXtract**: in NARROWBAND mode, load
   an `HO` (Ha+OIII) and an `OS` (SII+OIII) RGB image, click
   **Combine HOS**. Confirm the combine produces a sensible image
   and that no `_R` / `_G` / `_B` / `_HA` / `_OIII` / `_SII`
   intermediates are left in the workspace.
10. **Crop tool**: Manual SHIFT+drag, Auto-detect Edges, handle
    editing, Apply Current, Apply All. WCS must survive the crop.
11. **Stretching**: RGB / Starless main stretch + independent star
    stretch. Try Auto STF, MAS, Statistical, VeraLux. The curves
    canvas should show the amber-themed grid + histogram bars +
    amber curve line with amber square handles. Click "Preview"
    then "To Post" to send the result to Post Processing.
12. **Post Processing**: noise reduction (try every algorithm),
    sharpening, color balance (the hue wheel anchor should be
    amber), curves, masking (the range strip markers should be
    amber). Apply, toggle, mix STARLESS + STARS in Channel
    Combination.
13. **Channel Combination**: expand any Image N slot. The Source
    and Mask combos should auto-refresh to list every image
    currently routed to the CC tab.
14. **Toolbar buttons**: Thanks, Repositories, Help — confirm all
    three open the right content and the formatting renders (not
    raw HTML).
15. **Large images (>8K)**: verify the live preview downsampling
    keeps the UI responsive.

### Visual edge cases worth flagging

- Any label that gets clipped without you being able to read at
  least the first 10–11 characters (we deliberately left-aligned
  every slider label so the *start* is always visible).
- Any button text that gets center-clipped (e.g. "Combi…tely").
- Any section that does not respond to clicks on its title strip.
- Section open / close that feels sluggish.
- The status pill in Plate Solving never transitioning out of
  "Solving…" once the solve finishes.
- Custom widgets (curves canvas, range strip, hue wheels) rendering
  the old grey-on-grey palette instead of amber-on-surface.

## How to report bugs

Send to **[CHANNEL TBD]** with:
- PI Workflow version (visible at the top of the header, e.g.
  `33-opt-9u-redesign-rc1`).
- PixInsight build (Help → About).
- OS (Windows / macOS / Linux).
- **Full console output** copied from PixInsight (`Process Console`
  window).
- What you did (steps, in order).
- What you expected vs. what happened.
- If possible, a small reproducer master (or a link).
- Screenshot if the bug is visual.

## Known limitations

- The XHTML help file (`PI Workflow_help.xhtml`) still describes
  the previous UI for some sections — the screenshots and several
  button names predate the redesign. Functional explanations are
  still accurate.
- Section open / close performance was deliberately rewritten on a
  single painted Frame to avoid Qt styleSheet thrash; if it still
  feels slow on your system, report your OS + PI build.
- Tooltips use Qt's default styling (system look). Themed tooltips
  are a follow-up polish item.
- The dark theme is the only supported variant. If you run
  PixInsight with a light system theme, the dialog still uses its
  amber-on-dark palette by design.

## What is NOT being requested

- Code review of the script (≈25 k lines — out of scope for this
  round).
- Performance benchmarks beyond "feels fast / feels slow".
- Feature requests not directly tied to a reproducible bug or
  unclear behaviour.

---

Thanks for testing.
