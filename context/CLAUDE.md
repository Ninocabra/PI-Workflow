# PI Workflow Development Guidelines

## Core Principles

### 1. Think Before Coding
- State assumptions explicitly — if uncertain, ask rather than guess
- Present multiple interpretations — don't pick silently when ambiguity exists
- Push back when warranted — if a simpler approach exists, say so
- Stop when confused — name what's unclear and ask for clarification

### 2. Simplicity First
- Minimum code that solves the problem. Nothing speculative.
- No features beyond what was asked
- No abstractions for single-use code
- No "flexibility" or "configurability" that wasn't requested
- **Test:** Would a senior engineer say this is overcomplicated? If yes, simplify.

### 3. Surgical Changes
- Touch only what you must. Clean up only your own mess.
- Don't "improve" adjacent code unless it's your change's side effect
- Don't refactor things that aren't broken
- Match existing style, even if you'd do it differently
- **Test:** Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution
- Define success criteria before starting
- Loop until verified: write → test → verify

---

## PixInsight JavaScript (PJSR) Standards

### File Structure
Every script must have:
```javascript
/*
 * PI Workflow [Module Name]
 * Version: X.X.X
 * Description: What this does
 */

#include <pjsr/DataType.jsh>
#include <pjsr/SampleType.jsh>
#include <pjsr/StdCursor.jsh>
#include <pjsr/UndoFlag.jsh>

var MyNamespace = {
  // Engine
  Engine: { ... },
  
  // Dialog/UI
  Dialog: { ... },
  
  // Main entry
  main: function() { ... }
};

// Entry point
MyNamespace.main();
```

### Critical Memory Rules
1. **Every image operation MUST use try...finally**
   ```javascript
   try {
     // image processing
   } finally {
     // cleanup: nullify objects, call destructors
   }
   ```

2. **linearSource is IMMUTABLE once assigned**
   - Never modify after initial assignment
   - This prevents double-stretching bugs

3. **BXT/NXT parameters MUST use snake_case**
   - ✓ `sharpen_stars`, `denoise`, `enable_color_separation`
   - ✗ `sharpenStars`, `denoise`, `enableColorSeparation`

4. **Boolean assignments MUST use explicit if blocks**
   - SpiderMonkey can corrupt inline assignments
   - ✓ `if (x === "RGB") { isRGB = true; }`
   - ✗ `isRGB = (x === "RGB");`

5. **Always stop timers in cleanup**
   ```javascript
   finally {
     if (timer) timer.stop();
   }
   ```

### UI Standards
- Use Sizer for elastic layout, dialogs must be resizable
- Every important control needs a tooltip
- Consistent margins: 6-8 pixels (spacing=6, margin=8)
- JSDoc for every function: @param, @returns, @type

---

## Automated GitHub Workflow

### Session Start (Automatic)
When you open Claude Code on this project:
1. ✅ Git pull (fetch latest from GitHub)
2. ✅ Load memory from `memory/project_status.md`
3. ✅ Check for pending changes to sync

### During Development: File Synchronization Rules

#### When editing `scripts/PI_Workflow.js`:
- **Line 1-100:** Version, metadata, includes
  - Update version number in format: `XX.opt-Y-feature-suffix`
  - Example: `33-opt-9-stretching-fix`

- **Lines 100-500:** Global variables and configuration
  - Auto-documented in `PI_Workflow_resources.jsh`

- **Any new function/feature:**
  - Add JSDoc comment block immediately
  - Feature name goes to `PI_Workflow_Context.md` > Features section
  - Help text generated → `PI_Workflow_help.xhtml`

#### Automatic Sync Rules:
| Change in PI_Workflow.js | Auto-updates |
|--------------------------|--------------|
| New function added | PI_Workflow_resources.jsh (stub) + PI_Workflow_Context.md |
| Version number changed | PI_Workflow_Context.md + README.md + memory/project_status.md |
| Critical bug fixed | PI_Workflow_Context.md > Historial |
| UI/UX changed | PI_Workflow_help.xhtml |
| Algorithm improved | PI_Workflow_Context.md > Technical Notes |

#### Sync Frequency
- **During session:** Changes tracked in memory in real-time
- **Before commit:** All syncs verified and consolidated
- **On push:** Context files up-to-date

### Session End (Automatic)

When you finish or hit a natural stopping point:

1. **Review Changes:**
   ```
   Git status shows all modified files
   Verify sync completeness
   ```

2. **Consolidate Context:**
   - PI_Workflow_Context.md updated with version/fixes/features
   - memory/project_status.md updated with current state
   - PI_Workflow_help.xhtml up-to-date

3. **Auto-Commit to GitHub:**
   ```
   git add .
   git commit -m "[TYPE]: Brief description
   
   - Detailed point 1
   - Detailed point 2
   
   Files updated:
   - PI_Workflow.js: [what changed]
   - PI_Workflow_Context.md: [version/features added]
   - PI_Workflow_resources.jsh: [new UI elements/globals]
   - PI_Workflow_help.xhtml: [help updates]"
   
   git push
   ```

4. **Update Memory:**
   - Save completion status to memory/project_status.md
   - Record version in memory/development_log.md

---

## File Synchronization Details

### PI_Workflow.js → PI_Workflow_Context.md
**When:** Version changes or features added
**What:** 
- New version entry in Historial section
- Feature list updated
- Bug fixes documented with root cause

**Example entry:**
```markdown
### v33-opt-9 — Stretching Fix
**Problem:** Double-stretch occurring in specific edge case
**Root cause:** linearSource not properly immutable in zone switching
**Fix:** Added Object.freeze() to linearSource assignment
**Files:** PI_Workflow.js lines 1245-1260
```

### PI_Workflow.js → PI_Workflow_resources.jsh
**When:** New UI controls, dialogs, or configuration variables added
**What:**
- Control definitions (GroupBox, Label, Button, etc.)
- Tooltip strings
- Configuration constants
- Color definitions

**Format:**
```javascript
// Auto-generated from PI_Workflow.js
// Feature: [Feature Name] (v33-opt-9)

var MyControlDef = {
  type: "GroupBox",
  text: "Feature Name",
  toolTip: "Description from PI_Workflow.js JSDoc",
  controls: [ ... ]
};
```

### PI_Workflow.js → PI_Workflow_help.xhtml
**When:** Any user-facing change (new tab, new controls, new workflow)
**What:**
- Help sections for new features
- Control descriptions and usage
- Workflow diagrams if applicable
- Examples

**Format:**
```html
<!-- Auto-generated from PI_Workflow.js JSDoc comments -->
<section id="feature-name-help">
  <h2>Feature Name (v33-opt-9)</h2>
  <p>[From function JSDoc]</p>
  <div class="example">
    <code>[Example usage from comments]</code>
  </div>
</section>
```

---

## Development Workflow Summary

### Standard Session Flow

```
START SESSION
    ↓
git pull (automatic)
Load memory/project_status.md
    ↓
DEVELOP
    ├─ Edit PI_Workflow.js
    ├─ Track changes in memory
    ├─ Test in PixInsight
    └─ Verify output
    ↓
SYNC (Before commit)
    ├─ PI_Workflow_Context.md updated
    ├─ PI_Workflow_resources.jsh updated
    ├─ PI_Workflow_help.xhtml updated
    └─ memory/project_status.md updated
    ↓
COMMIT & PUSH
    ├─ git add .
    ├─ git commit (with detailed message)
    └─ git push
    ↓
UPDATE MEMORY
    └─ Record completion and next steps
    ↓
END SESSION
```

### Commit Message Format

```
[TYPE]: Brief one-liner (under 50 chars)

- Detailed change 1
- Detailed change 2
- If bug fix: Root cause analysis

Files updated:
- PI_Workflow.js: [lines changed, what feature]
- [Other files]: [what changed]

Tested: [Brief verification statement]
```

**[TYPE] options:**
- `feat:` New feature
- `fix:` Bug fix
- `refactor:` Code reorganization
- `perf:` Performance improvement
- `docs:` Documentation only
- `style:` Code style/formatting

---

## Critical Rules Summary

### MUST (Always Do These)
✅ try...finally for all image operations  
✅ linearSource never modified after assignment  
✅ BXT/NXT parameters in snake_case  
✅ Boolean assignments in explicit if blocks  
✅ Stop timers in cleanup blocks  
✅ Update context files before committing  
✅ Sync all dependent files before push  

### MUST NOT (Never Do These)
❌ Double-stretching (always stretch from linearSource)  
❌ Modifying immutable objects  
❌ Leaving orphaned variables/objects  
❌ Ignoring memory cleanup  
❌ Committing without syncing context  
❌ Pushing without updating help documentation  

### Testing Before Commit
- [ ] No console errors in PixInsight
- [ ] Memory cleanup verified (check PixInsight memory)
- [ ] Large images (8K+) tested
- [ ] All workflow tabs functional
- [ ] RGB, MONO, NARROWBAND modes tested
- [ ] Context files accurate
- [ ] Help documentation complete

---

## Context Files Purpose

| File | Purpose | Updated When |
|------|---------|--------------|
| `PI_Workflow_Context.md` | Architecture, version history, decisions | Version change, major feature |
| `PI_Workflow_help.xhtml` | User help, feature documentation | UI/workflow change |
| `PI_Workflow_resources.jsh` | UI definitions, configs, constants | New controls, new config vars |
| `memory/project_status.md` | Current version, active work, blockers | Every session end |
| `memory/development_log.md` | Session notes, insights, patterns | Session end |
| `CHANGELOG.md` | Public release notes | Release milestones |

---

**Last Updated:** 2026-05-15  
**Version:** Automated GitHub Sync Flow v1.0
