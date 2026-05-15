---
name: PI Workflow Project Status
description: Current development status, version, and active work items
type: project
---

## Project Status — PI Workflow

**Current Version:** 33-opt-8-performance-rc1  
**Status:** Active Development (RC1 - Release Candidate 1)  
**Last Update:** 2026-05-15

## Key Characteristics

### File Structure
- **Main Script:** `scripts/PI_Workflow.js` (~540 KB)
- **Architecture:** Optimized with:
  - Live preview downsampling
  - Pre-process CC caching
  - Row-buffer MAS sampling
  - Reusable preview paint buffers

### Core Features
- Pre-processing workflow (linear calibration, gradients, color)
- Dual-zone stretching (RGB/Starless + Stars)
- Chromatic aberration correction for stars
- Post-processing (noise, sharpening, curves, blending, masks)
- Multi-format support (RGB, MONO, NARROWBAND with 12 color palettes)

## Development Context

### Memory Model
- **Slot System:** 8 image slots, 8 mask slots
- **Image Ownership:** Canonical ownership with lightweight memory tracking
- **linearSource:** Immutable once assigned (prevents double-stretching)

### Critical Rules (from PI_Workflow_Context.md)
1. **BXT/NXT Parameters:** ALWAYS snake_case (not camelCase)
   - Example: `sharpen_stars`, `denoise`, `enable_color_separation`

2. **Boolean Assignments:** Use explicit if blocks (not inline)
   - SpiderMonkey parser can corrupt inline boolean assignments

3. **Image Operations:** Always wrap in try...finally blocks
   - Resource cleanup is critical in PixInsight

4. **Preview Management:** 
   - `linearSource` is immutable after first assignment
   - Max live preview dimension: 1024 pixels (for responsiveness)
   - AutoSTF only applies to SOURCE render role, not PREVIEW/MEMORY

## GitHub Integration

**Repository:** https://github.com/Ninocabra/PI-Workflow  
**Clone:** `git clone https://github.com/Ninocabra/PI-Workflow.git`

**Main Files:**
- `scripts/PI_Workflow.js` — Main workflow script
- `context/PI_Workflow_Context.md` — Full architecture and history
- `context/CLAUDE.md` — Development guidelines
- `CHANGELOG.md` — Version history
- `README.md` — Project overview

## Active Development

### Work Process
1. Pull from GitHub (or work locally)
2. Edit `scripts/PI_Workflow.js` in Claude Code
3. Test in PixInsight PJSR environment
4. Update `context/PI_Workflow_Context.md` if major changes
5. Commit with clear message
6. Push to GitHub

### Testing Checklist
- [ ] No memory leaks (check PixInsight console)
- [ ] Large images (8K+) process correctly
- [ ] Preview responsiveness maintained
- [ ] All tabs (Pre, Stretching, Stars, Post, Config) functional
- [ ] RGB, MONO, NARROWBAND modes all tested

## Next Steps

- Performance profiling on ultra-large images
- Extended NARROWBAND palette refinements
- Advanced mask editor enhancements
- Community review feedback integration

---

Last updated: 2026-05-15
