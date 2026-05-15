# PI Workflow

**Optimized PixInsight Workflow Suite for Astrophotography Processing**

**Version:** 33-opt-8-performance-rc1

## Overview

PI Workflow is a comprehensive PixInsight script designed for complete astrophotography image processing pipelines:

- **Pre-processing:** Linear calibration, gradient correction, color calibration, BlurXTerminator
- **Stretching:** Dual-zone stretching (RGB/Starless + Stars) with VeraLux, MAS, AutoSTF
- **Stars Chromatic Correction:** Detection and correction of chromatic aberration in stars
- **Post Processing:** Noise reduction, sharpening, curves, blending, masks, color balance
- **Multi-format Support:** RGB single images, MONO (separate R/G/B channels), NARROWBAND (Ha/OIII/SII with 12 color palettes)

## Features

### Key Capabilities
- **Canonical image ownership:** Lightweight memory model with shared image selection
- **Live preview downsampling:** Responsive UI with large images
- **Pre-process CC caching:** Efficient color calibration workflow
- **Row-buffer MAS sampling:** Advanced stretching algorithms
- **Reusable preview paint buffers:** Optimized memory management

### Architecture
- One unified preview engine across all workflow tabs
- Memory slot system (8 slots for images, 8 for masks)
- Immutable `linearSource` model to prevent double-stretching
- PixInsight JavaScript Runtime (PJSR) with SpiderMonkey engine

## Required Files

All three files must be installed together:

| File | Size | Purpose |
|------|------|---------|
| `PI_Workflow.js` | 540 KB | Main workflow script |
| `PI_Workflow_resources.jsh` | 32 KB | UI resources and assets (included via `#include`) |
| `PI_Workflow_help.xhtml` | 117 KB | Context-sensitive help documentation |

## Installation

1. Copy all three files to your PixInsight Scripts folder:
   ```
   C:\Program Files\PixInsight\src\scripts\
   ```
   (Or your PixInsight installation path)

2. Load the script via **Scripts > Utilities > PI_Workflow_Opt_8**

## Project Structure

```
PI-Workflow/
├── scripts/
│   ├── PI_Workflow.js              # Main optimized workflow script (540 KB)
│   ├── PI_Workflow_resources.jsh   # UI resources and assets (32 KB)
│   └── PI_Workflow_help.xhtml      # Help documentation (117 KB)
├── context/
│   ├── PI_Workflow_Context.md      # Development context and history
│   ├── CLAUDE.md                   # Development guidelines
│   └── MEMORY.md                   # Memory index
├── memory/                         # Claude Code memory files
├── docs/
│   ├── README.md
│   ├── CHANGELOG.md
│   └── version-history.md
├── .gitignore
└── LICENSE
```

## Development

### Guidelines
- Follow CLAUDE.md for development standards
- Always use try...finally blocks for image operations
- Maintain immutable linearSource references
- Use BXT/NXT parameters in snake_case (not camelCase)
- Test on large images and verify memory cleanup

### Quick Start
1. Clone the repository
2. Read `context/PI_Workflow_Context.md` for architecture details
3. Edit `scripts/PI_Workflow.js`
4. Test in PixInsight using the PJSR console
5. Commit changes with clear messages

## Version History

See [CHANGELOG.md](CHANGELOG.md) for detailed version history.

**Current:** v33-opt-8-performance-rc1 (optimized with live preview, caching, and memory improvements)

## License

[Your License Here]

## Author

Developed by @Ninocabra

## Support

For issues, questions, or contributions, use GitHub Issues and Pull Requests.

---

**Last Updated:** 2026-05-15
