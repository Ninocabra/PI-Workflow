# PI Workflow — Automated GitHub Sync Guide

## 🚀 How It Works

**Everything is automated.** You just edit `PI_Workflow.js` — the rest happens automatically.

```
You edit PI_Workflow.js
        ↓
Claude tracks changes in memory
        ↓
Before commit: Auto-sync all files
  ├─ PI_Workflow_Context.md (versions, features, bugs)
  ├─ PI_Workflow_resources.jsh (UI elements)
  ├─ PI_Workflow_help.xhtml (help docs)
  └─ memory/ (state tracking)
        ↓
Auto-commit to GitHub with detailed message
        ↓
Auto-push to main
```

---

## ✅ What Gets Automated

### On Session Start
```
git pull  (fetch latest from GitHub)
Load memory
Ready to work
```

### During Development
- Memory tracking of changes
- File sync planning
- Dependency monitoring

### On Session End
- ✅ All files synced
- ✅ Detailed commit message created
- ✅ Changes pushed to GitHub
- ✅ Memory updated

---

## 📝 What You Do

### 1. **Edit PI_Workflow.js**

Just make your changes:

```javascript
// PI_Workflow.js
var OPT_VERSION = "33-opt-9-stretching-fix";  // Update version

/**
 * Enhanced stretching algorithm
 * @feature Dual-zone stretching improvement
 * @fix Prevents double-stretching edge case
 * @param {View} view - Target image view
 */
function improvedStretching(view) {
  try {
    // Your code here
  } finally {
    // cleanup
  }
}
```

### 2. **Test in PixInsight**

Make sure it works.

### 3. **Claude Does Everything Else**

- Detects version change → Updates README, CHANGELOG, Context
- Detects new feature (via `@feature` tag) → Updates resources.jsh, help.xhtml
- Detects bug fix (via `@fix` tag) → Updates Context historial
- Session end → Commits and pushes everything

---

## 📋 Tags That Trigger Auto-Sync

Use these JSDoc-style tags in your code comments:

```javascript
/**
 * @version 33-opt-9  // Triggers: README, CHANGELOG, Context, Memory update
 */

/**
 * @feature Feature Name  // Triggers: Context features, Resources, Help
 */

/**
 * @fix Bug description  // Triggers: Context historial, CHANGELOG
 */

/**
 * @performance Optimization  // Triggers: Context technical notes
 */
```

---

## 🔄 File Relationships

```
PI_Workflow.js (you edit this)
    │
    ├─→ PI_Workflow_Context.md
    │   (Versions, features, bugs, decisions)
    │
    ├─→ PI_Workflow_resources.jsh
    │   (UI elements, configs, constants)
    │
    ├─→ PI_Workflow_help.xhtml
    │   (User documentation)
    │
    └─→ memory/project_status.md
        (Current state, next steps)
```

---

## 📊 Commit Message Format (Auto-Generated)

Your commits will look like this:

```
feat: Improved stretching algorithm (v33-opt-9)

- Implemented dual-zone stretching enhancement
- Fixed edge case in linearSource handling
- Added immutability safeguards

Files synced:
- PI_Workflow.js: Lines 1245-1305 (stretching logic)
- PI_Workflow_Context.md: Added v33-opt-9 entry, features updated
- PI_Workflow_resources.jsh: New control definitions
- PI_Workflow_help.xhtml: New help section
- memory/project_status.md: Version updated

Tested:
- No console errors in PixInsight
- Large image test (8K+) passed
- RGB, MONO, NARROWBAND modes verified
- All tabs functional

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
```

---

## 🎯 Your Workflow Per Session

### Session Start
1. Open Claude Code
2. Auto-pull from GitHub happens
3. Memory loads
4. **You start working**

### During Work
1. Edit `scripts/PI_Workflow.js`
2. Test in PixInsight
3. Claude tracks in memory
4. **Repeat**

### Session End
1. Natural stopping point or when done
2. **Claude auto-syncs everything**
3. **Claude auto-commits with message**
4. **Claude auto-pushes to GitHub**
5. **Memory updated**

**That's it. No manual commits.**

---

## 🔍 Verify Everything Works

### Check Git Status
```powershell
cd "C:\Users\ninoc\Documents\PixInsight\Test_Scripts\PI Workflow\Claude"
git log --oneline  # See all commits
git status         # Check for pending changes
```

### Check GitHub
```
https://github.com/Ninocabra/PI-Workflow
→ Click "Commits" to see all changes
→ Click "Code" to browse files
```

### Check Files Synced
- [ ] PI_Workflow_Context.md has new version entry
- [ ] PI_Workflow_resources.jsh has new controls
- [ ] PI_Workflow_help.xhtml has new help section
- [ ] memory/project_status.md is current
- [ ] CHANGELOG.md reflects the change

---

## 📚 File Reference

### You Edit This
- `scripts/PI_Workflow.js` — Main script

### Claude Keeps These Updated
- `context/CLAUDE.md` — Development rules
- `context/PI_Workflow_Context.md` — Versions, features, architecture
- `scripts/PI_Workflow_resources.jsh` — UI resources
- `scripts/PI_Workflow_help.xhtml` — Help documentation
- `memory/project_status.md` — Current status
- `memory/development_log.md` — Session tracking

### Reference Only
- `README.md` — Project overview
- `CHANGELOG.md` — Release notes
- `.gitignore` — Files to ignore

---

## ⚡ Quick Start: Try It Now

### Make a Test Change
1. Edit `scripts/PI_Workflow.js` line 90:
   ```javascript
   var OPT_VERSION = "33-opt-8-test";  // Add "-test"
   ```

2. Add a comment with tag:
   ```javascript
   /**
    * @version 33-opt-8-test
    */
   ```

3. Save file

4. **Claude will:**
   - Detect version change
   - Auto-sync all files
   - Create commit
   - Push to GitHub

5. Verify:
   ```powershell
   git log --oneline  # See new commit
   ```

---

## 🚨 Important Rules

✅ **DO:**
- Edit `PI_Workflow.js` freely
- Use `@version`, `@feature`, `@fix` tags
- Test thoroughly in PixInsight
- Let Claude handle syncing

❌ **DON'T:**
- Manually edit synced files (Context, Resources, Help)
- Manually create commits (Claude does it)
- Manually push (Claude does it)
- Use confusing version numbers

---

## 🆘 If Something Goes Wrong

### Reset to Last Good Commit
```powershell
git reset --hard HEAD~1
git push --force
```

### See What Changed
```powershell
git diff HEAD~1
git show HEAD
```

### Revert a Change
```powershell
git revert <commit-hash>
```

### Check Memory State
```powershell
cat memory/project_status.md
```

---

**You're ready to go. Just edit PI_Workflow.js and let GitHub handle the rest.** 🎉

For details, see:
- `context/CLAUDE.md` — Development rules
- `context/PI_Workflow_Context.md` — Architecture
- `memory/project_status.md` — Current status
