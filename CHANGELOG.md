# Changelog

All notable changes to PI Workflow are documented here.

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
