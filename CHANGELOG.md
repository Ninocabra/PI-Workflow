# Changelog

All notable changes to PI Workflow are documented here.

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
