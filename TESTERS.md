# PI Workflow — Tester Brief

**Version under test:** `33-opt-9s` (2026-05-19)
**Repo:** https://github.com/Ninocabra/PI-Workflow

---

## What it is

PixInsight JavaScript workflow that unifies pre-processing → stretching → star repair → post-processing in a single dialog. Targets RGB, MONO (R/G/B/L), and Narrowband (H/O/S + dual-band HO/OS) inputs.

## Install (3 steps)

1. Copy these three files into the **same** folder (e.g. `PixInsight/src/scripts/PI Workflow/`):
   - `PI Workflow.js`
   - `PI Workflow_help.xhtml`
   - `PI Workflow_resources.jsh`
2. In PixInsight: **Script → Feature Scripts → Add**, select that folder, restart if the menu entry does not appear.
3. Run from **Script → Utilities → PI Workflow**.

For optional dependencies (BlurXTerminator, NoiseXTerminator, GraXpert, VeraLux, MGC, DBXtract, etc.) press the **Repositories** button in the script — it lists each tool, the repository URL, and what PI Workflow uses it for.

## What to test (priority order)

1. **Pre-processing pipeline (Tab 0):** load a master, plate solve, gradient correction, color calibration, BXT. Verify each candidate preview can be promoted with **Use this Image**.
2. **NB dual-band combine via DBXtract** (new in 9r): in NARROWBAND mode, load an `HO` (Ha+OIII) and an `OS` (SII+OIII) RGB image, click **Combine H+O+S**. Confirm the combine produces a sensible image and that no `_R`/`_G`/`_B`/`_HA`/`_OIII`/`_SII` intermediates are left in the workspace.
3. **Crop tool (Tab 0, section 4.2):** Manual SHIFT+drag, Auto-detect Edges, handle editing, Apply to Current, Apply to All. Verify WCS survives the crop.
4. **Stretching (Tab 1):** RGB/Starless main stretch + independent star stretch. Try Auto STF, MAS, Statistical, VeraLux. Export Combined.
5. **Post-processing (Tab 3):** noise reduction, sharpening, curves, STARLESS+STARS blend, Export, Export TIF.
6. **Toolbar buttons:** Thanks, Repositories, Help — confirm all three open the right content and the formatting renders (not raw HTML).
7. **Large images (>8K):** verify the live preview downsampling keeps the UI responsive.

## How to report bugs

Send to **[CHANNEL TBD]** with:
- PI Workflow version (visible in script title / about)
- PixInsight build (Help → About)
- OS (Windows / macOS / Linux)
- **Full console output** copied from PixInsight (`Process Console` window)
- What you did (steps, in order)
- What you expected vs. what happened
- If possible, a small reproducer master (or a link)

## Known limitations

- Images > 8K may need preview downsampling — already handled automatically, but report any responsiveness issue.
- The Thanks and Repositories dialogs require `PI Workflow_help.xhtml` in the same folder; missing → "Could not load…" message instead of content.
- DBXtract integration uses the bundled PixInsight DBXtract.js with default sensor coefficients; custom sensor calibration is not yet exposed in the UI.
- Post-processing optimisations are still being tuned (RC1 phase).

## What is NOT being requested

- Code review of the script (24k lines — out of scope for this round).
- Performance benchmarks beyond "feels fast / feels slow".
- Feature requests not directly tied to a reproducible bug or unclear behaviour.

---

Thanks for testing.
