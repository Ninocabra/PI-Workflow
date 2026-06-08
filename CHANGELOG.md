# Changelog

All notable changes to PI Workflow are documented here.

## [V8_8] - 2026-06-08

Fix applied to **both** packages (1.9.4 and the 1.9.3 build, re-issued once).

### Fixed
- **Color Calibration / Auto Linear Fit / Background Neutralization / Optimal
  Transport** no longer emit `*** Error: AstrometricMetadata::Write(): Incompatible
  image dimensions` after a crop + plate solve. These algorithms split the image
  into RGB channels and recombine them; if the view's window held an astrometric
  solution whose dimensions no longer matched the (cropped/downsampled) image,
  PixInsight refused to propagate it to the extracted channel views. Since these
  algorithms do not use astrometry, they now run on a fresh metadata-free copy and
  the processed pixels are copied back, so no stale solution is ever written. SPCC
  is unaffected (it does not split channels and keeps using the solution).

## [V8_7] - 2026-06-08

Pure V8 codebase (1.9.4+ package only; the frozen 1.9.3 package is unchanged).

### Changed — cleanup
- Removed the dead SpiderMonkey code paths from the 1.9.4 build. A selective
  preprocessor pass resolved every `PIW_USE_V8` conditional to its V8 branch and
  deleted the SpiderMonkey `#else` branches (AdP includes, the SM
  `SETTINGS_MODULE` token, the `#else` Sizer/NumericControl/Color includes, the
  `#ifndef PIW_USE_V8` WCS_* defines) and the ES5 prototype versions of
  `OptPreviewControl` / `PIWorkflowOptDialog`. The engine directive is now a plain
  `#engine v8`. Behavior-preserving: only code that never compiled under V8 was
  removed (0 additions, 225 lines deleted), validated by a clean parse and a real
  1.9.4 load test.

## [V8_6] - 2026-06-08

Distribution split (version-routed). The repository now ships **two packages**
selected automatically by PixInsight core version via `updates.xri`:

- `version="1.8.8:1.9.3"` → **`PI-Workflow-193.zip`** — the frozen V8_5 build for
  PixInsight 1.9.3 and earlier (SpiderMonkey). Kept stable; not developed further.
- `version="1.9.4:1.9.9"` → **`PI-Workflow-194.zip`** — the actively developed
  **V8-only** build for PixInsight 1.9.4+. From now on all improvements land here.

The 1.9.4+ source (`PI Workflow.js`) selects the engine unconditionally
(`#define PIW_USE_V8` + `#engine v8`); it does not run on 1.9.3 by design.

### Fixed (1.9.4 build)
- **Numeric sliders** showed only the decimal part of values: the themed edit box
  used the JetBrains Mono / Consolas font stack plus padding, overflowing the
  auto-computed width under V8 and clipping the integer digits. The edit width is
  now sized explicitly from the widest representable value, so full numbers show.

### Docs
- Help: the Seti Astro scripts repository row now lists both addresses by version
  — `…/setiastro/pixinsight-updates/main/` for PixInsight ≤ 1.9.3 and
  `https://updates.setiastro.com/` for ≥ 1.9.4.

## [V8_5] - 2026-06-08

Dual build: one self-adapting `PI Workflow.js` runs on PixInsight **1.9.3
(SpiderMonkey)** and **1.9.4 (V8)** across Windows / macOS / Linux. The engine is
auto-selected at preprocess time via `#ifgteq __PI_VERSION__ 1.9.4 → #define
PIW_USE_V8 → #engine v8`. `updates.xri` ships a single package covering
`1.8.8:1.9.9`, so both versions resolve from the same repository.

### Added — dual runtime
- V8 engine path with ES6 classes for native-class subclassing (`OptPreviewControl`,
  dialog), and SpiderMonkey ES5 prototypes preserved under `#else`.
- Version-gated astrometry: ImageSolver 6.4.1 (`src/scripts/ImageSolver/`) under V8;
  AdP under SpiderMonkey. Plate solving and SPCC work on both runtimes.
- GraXpert background correction runs the executable directly (ExternalProcess),
  bypassing GraXpertLib's fragile path/macro resolution.

### Fixed — this release
- **GraXpert Denoise (Post)** now runs via the direct CLI method
  (`-cli -cmd denoising -strength -batch_size`), so it works where GraXpert is
  script-based (no native module), with the native process as fallback.
- **StarXTerminator** no longer hardcodes `StarXTerminator.11.pb`. It discovers the
  installed model in `<install>/library/` and is platform-aware: CoreML
  `.mlpackage` (a bundle) on macOS, TensorFlow `.pb` on Windows/Linux; picks the
  highest version, falls back to SXT's default if none is found.
- **AutoDBE (SetiAstro)** no longer greys out / fails under V8. Its top-level
  `let`/`function` do not leak to the script global on V8, so it is loaded via an
  IIFE that captures `GradientDescentParameters` + `executeGradientDescent`, driven
  with the 1.9.4-optimized parameters.

## [33-opt-9u-redesign-rc1] - 2026-05-20

Visual redesign release candidate. Same workflow logic, new themed UI.
Lives in `PI Workflow 2.js` so it can be A/B-tested next to the previous
shell. To make it the new canonical PI Workflow, rename the file to
`PI Workflow.js` and change `#feature-id` from `Utilities > PI_Workflow_2`
to `Utilities > PI_Workflow`. The XHTML help and the resources file
(`PI Workflow_help.xhtml`, `PI Workflow_resources.jsh`) work as-is.

### Added — design infrastructure
- **`Theme` token object** at the top of the script. Single source of
  truth for surface colours, hairline borders, brand amber, text
  colours, channel dots, radii (rXs / rSm / rMd / rLg / rXl), spacing
  scale (s1–s7), and the type stack (fontUI, fontMono, tEyebrow,
  tLabel, tBody, tTitle, tMonoSm, tMonoMd).
- **Helpers** `optThemeColor`, `optThemeColorInt`, `optThemeRgba`,
  `optThemeFont`, `optThemeStyleSheet`, `optApplyStyle`.

### Changed — chrome
- **Header bar** rebuilt: painted 44×44 π logo (rounded square with
  amber ring, italic glyph in Palatino Linotype / Georgia / serif
  fallback), title "PI Workflow" in 14 pt 700, version + "OPTIMIZED"
  pill (amberSoft / amberRing). Action buttons (Thanks, Repositories,
  Help) styled as surfaceRaised pills with hairline border.
- **Tab bar** replaced from the native QTabBar to a pill-segmented
  custom widget. Active tab uses surfaceRaised bg, numbered chip
  filled amber. Inactive tabs use transparent bg, textMuted label
  with outlined chip. Native TabBox kept underneath for page
  management; its tab strip is hidden via styleSheet.
- **Cards** wrap the left panel and the preview pane: surface bg,
  hairline border, rXl radius. Left panel width 450 → 340 px to
  give the preview more horizontal real estate.
- **Section header** is now a single painted Frame (was Control +
  3 child widgets) — guarantees the entire row is clickable, drops
  per-event styleSheet thrash so open/close feels snappy. 15 pt
  regular title, decorative toggle bitmap on the left, chevron on
  the right.
- **Module body** has a 6 % amber tint + amberRing border so the
  active module reads as a clearly delimited workspace.

### Changed — components
- **Mode segmented** (R+G+B / NB / RGB): dark container, three
  equal pills, amber-active variant.
- **Channel rows** (R/G/B/L, H/O/S, HO/OS, RGB): coloured dot with
  halo for the channel, mono label without colon, themed ComboBox
  with amberSoft selection highlight in the popup.
- **Combine / Separately segmented** for each input mode.
- **Memory bank** and **Mask memory bank**: uppercase mono label
  (60 px column), dark rounded container with 8 chip pills (22×22),
  filled pills flip to amberSoft + amber text, RESET (and SHOW/HIDE
  for masks) styled as ghost buttons. Both rows label-aligned.
- **Path chips** (`[R+G+B]`, `[H+O+S]`, …): fully-rounded amber pills
  in three visual variants (active / done / off).
- **Status label**: mono textMuted line with rich-text body.
- **Zoom + Reduction** controls became mini-cards (dark container,
  uppercase mono label, compact combo).
- **Action buttons** on the preview toolbar (Toggle, Export, Export
  TIF) themed as surfaceRaised pills; the **Use this Image** primary
  commit button flips between amberSoft "ready" and a green
  "applied" variant.
- **Engine title** in the left panel (PRE PROCESSING ENGINE,
  STRETCHING ENGINE, etc.) restyled as a thin amber mono eyebrow,
  no surrounding card.
- **Recipe palette** (12 NB palettes): three rows × four pills,
  mono uppercase, amber selection — replaces the old 35–40 px
  checkerboard.

### Changed — module bodies
- **Crop** (Flat): status pill + Auto-detect / Clear secondary
  buttons + Re-align toggle + Apply Current / Apply All primary
  buttons.
- **Plate Solving** (Status + Action): single status pill that
  flips colour family between pending (amber), ok (green) and
  error (red).
- **Gradient Correction** (Subcards): full-width algorithm combo
  + algorithm-specific subcards. MGC uses two subcards (Gradient
  Model + Channel Multipliers); AutoDBE / ABE / GraXpert use one.
- **Color Calibration** (Action-only): three themed action cards
  with icon box, title, mono hint, chevron — SPCC is highlighted
  as the primary recommendation.
- **Deconvolution** (Subcards): full-width algorithm combo + three
  subcards (Stars, Nonstellar, Output) for BlurXTerminator, one
  subcard for Cosmic Clarity.
- **Stretching tab modules** (Star Split, RGB / Starless, Stars):
  same subcard treatment via `optInnerGroup` → `optThemeBuildSubcard`
  redirection. Algorithm-specific groups (Auto STF, MAS, Statistical
  Stretch, VeraLux, Star Stretch, Curves) all inherit the new look.
- **Post Processing tab modules** (Noise Reduction, Sharpening,
  Color Balance, Curves, Masking) and **Channel Combination Image
  1–6**: all inherit the new look automatically through the helper
  refactor.

### Changed — custom widgets
- **Curve canvases** (Stretching + Post Processing + Channel
  Combination histogram): surface bg, subtle white grid, amber
  curve line, amber square handles with surface outline.
- **Mask range strip** (Post Processing Masking): amber low/high
  markers, amberRing band outline.
- **Hue wheels** (Post Processing Color Mask, Post Processing Color
  Balance, Channel Combination per-slot colour wheel): amber
  centre/anchor indicators, amberRing range arms.
- **Toggle bitmap** for section headers: rounded track + circular
  thumb, amber on / textDim off.
- **Logo glyph** painted into a 44×44 cached Bitmap, redrawn only
  on header repaint.

### Changed — labels and copy
- "Process Separately" → "Separately"
- "Combine R+G+B" → "Combine RGB"
- "Combine H+O+S" → "Combine HOS"
- "Recommended Repositories" → "Repositories"
- "Set to Current" → "Use this Image" (kept from the v33-opt-9q sweep)
- "Generate Starless / Stars (SXT)" → "Generate Star Split"
- "To Post Processing" → "To Post"
- "Background Neutralization" → "Bkg. Neutralization" (visible
  label only; stage name kept verbatim for downstream callsites)
- Long slider labels across every tab were rewritten to ≤10 chars
  and left-aligned so the *start* of each parameter name is always
  visible when clipped (full names available via tool-tip).

### Performance
- The first painted Frame for every section header eliminates a
  per-tick styleSheet reassignment that was making open/close feel
  sluggish. Toggle bitmap is cached at section construction.
- The amber-tinted module body styleSheet is applied once at
  section creation (via `optSection` itself), not on every open/close.

### Compatibility
- Every internal identifier (dlg.ncBxt*, dlg.chk*, zone.*,
  slot.comboSource, dlg.preBxtGroup, dlg.preCCSharpGroup,
  dlg.syncPre*Panels, dlg.btnPreSPCC / btnPreALF / btnPreBN,
  dlg.btnCreateStarSplit, OptMaskMemoryManager, etc.) is preserved
  1:1 with the previous shell.
- Stage names (passed to optSafeUi / pane.beginCandidate) and
  action keys ("spcc", "alf", "bn", "gradient", "decon", …) are
  preserved.

### Migration notes
- Phase 7 (Spec) - QA still pending: full smoke test across the
  four tabs on a clean PixInsight install, contrast verification,
  behaviour on 1280×800 screens, and check that the script still
  reads correctly when the user runs PI with a light theme.

## [33-opt-9s] - 2026-05-19

### Added
- **"Thanks" button** in the top toolbar (left of Repositories) — opens a dialog showing the Acknowledgements to Community Educators (section 13 of the help file). 19 educators / channels listed.
- **Section 13** ("Acknowledgements to Community Educators") added to the help-file table of contents.
- **DBXtract entry** added to the Repositories / Requirements table in section 3.1 of the help file, documenting that it ships with PixInsight and how PI Workflow invokes it for NB dual-band combine.
- **Crop section** in the help file promoted from `4.1b` to a first-class `4.2` heading; subsequent subsections (Plate Solving, Gradient Correction, Color Calibration, Linear Deconvolution) renumbered to `4.3`–`4.6`. Both the TOC and the body anchors were updated to stay in sync.

### Changed
- **"Recommended Repositories" button renamed to "Repositories"** (110 px wide instead of 190 px) to make room for the new Thanks button without overflowing the toolbar.
- **Thanks and Repositories dialogs now read the help XHTML at runtime** — instead of duplicating the lists in JavaScript, the two dialogs parse `<h2 id="sec-13">` / `<h2 id="sec-3-1">` blocks out of `PI Workflow_help.xhtml` and render them as rich text. Editing the help file is now the single source of truth for both views.

### Removed
- `optFormatRecommendedRepositoriesText()` helper (35 lines) and its hardcoded plain-text dump of the repositories list — replaced by the dynamic read above.
- Hardcoded HTML list of acknowledgements in `optShowThanksDialog` (replaced by the runtime read).

### Notes
- The dialogs depend on `PI Workflow_help.xhtml` being present in the same folder as `PI Workflow.js`. If the file is missing or renamed, the dialogs fall back to an inline error message ("Could not load…") instead of crashing.
- `TextBox.useRichText = true` is required for the dialogs to render the HTML correctly; on older PixInsight builds without rich-text support the dialogs will show raw HTML.

## [33-opt-9r] - 2026-05-18

### Added
- **NB dual-band combine via DBXtract** — when both the `HO` (Ha+OIII) and `OS` (SII+OIII) selectors in Image Selection → NARROWBAND hold valid RGB images, clicking **Combine H+O+S** now invokes the external `DBXtract.js` script to extract Ha, OIII, and SII as monochrome views, then combines them with the selected NB palette (default `HSO`). Previously, the `HO` and `OS` combos were ignored by the combine button (dead UI).
- New helper `optRunDBXtract(hoView, soView)` — reads `DBXtract.js`, strips PJSR preprocessor directives, and `eval`s it with the required `Parameters` already populated (`sensor=0`, `rgbCustomize=false`, `integracion=0`, plus the 12 RGB coefficients). Runs headlessly because `referenceHO`/`referenceSO` are set.
- New helper `optCloseDBXtractIntermediates()` — closes the 11 intermediate views DBXtract creates (`_R`/`_G`/`_B`/`_HA`/`_OIII`/`_SII`/`_HB`/`OIII_HO`/`OIII_SO`/`SII_SO`/`SII_SH`). Called from a `finally` block so cleanup runs even if the combine throws.
- New `dialog.recipeManuallySelected` flag — set to `true` when the user clicks any palette button. The DBXtract branch uses `HSO` as the default palette unless this flag is `true`, in which case it uses the explicitly selected one.

### Notes
- Lessons learned and documented in `PI_Workflow_Context.md`:
  - `new Script` in PJSR is metadata-only (read-only properties, no `execute()` method) — it can't be used to invoke an external script at runtime.
  - `File.readAsText` does not exist in PJSR; use `File.readFile(path).toString()`.
  - `#include` is a preprocessor directive (load-time only) and cannot be used to dynamically invoke a script from inside a function.

## [33-opt-9q] - 2026-05-18

### Changed
- **"Set to Current" button renamed to "Use this Image"** — clearer label for the commit action that promotes a candidate preview to the current workflow image. Tooltips and help reference updated accordingly. Internal variable name (`btnSetCurrent`) preserved.
- **NB recipe buttons (SHO/HOO/.../FORAXX) reworked** — narrower buttons (~35–40 px max), smaller font (6 pt) and tighter padding (1px 0px) so all 12 palette names display fully without truncation. `addStretch()` at the end of each row prevents PJSR sizer auto-expansion.

## [33-opt-9p] - 2026-05-18

### Added
- **Export TIF (16-bit, Photoshop-compatible)** — new button next to Export in preview pane toolbar. Creates a 16-bit integer ImageWindow and writes via `FileFormatInstance` with `"compression none"` hint. Directly importable in Adobe Photoshop, Lightroom, and any TIFF-compatible editor.
- **LRGB L blending weight (0–200%)** — inline slider revealed by right-click on the "L:" label when an L image is selected. Allows controlling how strongly the L channel influences the LRGB combination:
  - `100%` standard LRGB (default, zero overhead)
  - `0%` no L influence (pure RGB)
  - `200%` extrapolation (amplifies L effect)
  - Auto-hides when L is set to None. Reserved layout space prevents UI reflow.
  - Post-LRGB blend: `pixel = lrgb*w + rgb*(1-w)`, clipped to [0,1].

### Changed
- **Preview toolbar reorganized** — Export and Export TIF moved to the right side (before Zoom and Prev. Resol. Reduction), grouped with the view-control area.

### Removed
- **NB "L" combo (Image Selection → Narrowband)** — was dead code (never read by `combineNb` or `processSeparateNb`). MONO L (key `L_MONO`) is unaffected.

## [33-opt-8-performance-rc1] - 2026-05-15

### Added
- Live preview downsampling for responsive UI with large images
- Pre-process color calibration (CC) caching system
- Row-buffer MAS sampling for advanced stretching algorithms
- Reusable preview paint buffers for optimized memory management
- Canonical image ownership model with lightweight memory
- Shared Image Selection across workflow tabs

### Improved
- Preview engine unified across all workflow tabs
- Memory slot system optimizations (8 image slots, 8 mask slots)
- Live mask preview with downsampling (max 1024 longest-side dimension)
- Overall performance and responsiveness

### Fixed
- Memory leaks in preview bitmap management
- Image ownership tracking in multi-zone stretching
- Preview refresh synchronization across tabs

### Technical Details
- **Version Code:** 33-opt-8-performance-rc1
- **Feature ID:** Utilities > PI_Workflow_Opt_8
- **Engine:** PixInsight JavaScript Runtime (PJSR) / SpiderMonkey
- **File Size:** ~540 KB

---

## Previous Versions

### v100 (Before Optimization)
- 24,000+ lines of script code
- Multiple memory management issues
- Double-stretching vulnerability fixed
- BXT/NXT snake_case parameter handling (v43)
- Full feature parity with RGB, MONO, and NARROWBAND workflows

### Key Historical Fixes
- **v62:** Immutable linearSource to prevent double-stretching
- **v65:** SpiderMonkey parser hardening for boolean assignments
- **v66:** PenStyle include fix for Curves widget
- **v68-v69:** AutoDBE and BackgroundNeutralization robustness
- **v71-v76:** Native MAS implementation with precise parameters
- **v73:** Set to Current without double-stretching
- **v75-v76:** Post-processing bootstrap stability

---

## Development Notes

### Current Status
- In active development and testing (RC1 phase)
- Focus on memory optimization and preview performance
- Preparing for community review and feedback

### Known Limitations
- Large images (>8K pixels) may require preview downsampling
- Some advanced features in post-processing are still being optimized
- NARROWBAND palette expansion (12 palettes) available but being refined

### Future Roadmap
- Performance profiling and optimization
- Extended NARROWBAND palette support
- Advanced mask editor enhancements
- Batch processing capabilities (under discussion)

---

## Contributing

When making changes, please:
1. Document changes in this CHANGELOG
2. Follow guidelines in `context/CLAUDE.md`
3. Update `context/PI_Workflow_Context.md` with version notes
4. Test thoroughly with various image sizes and formats
5. Ensure memory cleanup with try...finally blocks

---

**Last Updated:** 2026-05-15
