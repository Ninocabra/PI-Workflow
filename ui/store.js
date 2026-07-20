function OptPreviewScheduler(owner) {
   this.owner = owner || null;
   this.jobs = {};
   this.closed = false;
}

OptPreviewScheduler.prototype.cancel = function(key) {
   var job = this.jobs[key || "__default__"];
   if (!job)
      return;
   try { if (job.timer) job.timer.stop(); } catch (e0) {}
   job.timer = null;
   job.generation++;
};

OptPreviewScheduler.prototype.cancelAll = function() {
   this.closed = true;
   for (var key in this.jobs)
      if (optHasOwn(this.jobs, key))
         this.cancel(key);
};

OptPreviewScheduler.prototype.request = function(key, fn, options) {
   if (this.closed)
      return null;
   var k = key || "__default__";
   if (!this.jobs[k])
      this.jobs[k] = { timer: null, generation: 0, busy: false, pending: false, lastDurationMs: 0 };
   var job = this.jobs[k];
   job.generation++;
   var generation = job.generation;
   var rawDebounce = (options && options.debounceMs) || 0;
   var delayMs = Math.max(0, Math.round(rawDebounce));
   // Adaptive debounce: never re-fire faster than 1.2x the previous run's duration,
   // so heavy previews (large images / slow tools) back off on their own.
   if (job.lastDurationMs > 0)
      delayMs = Math.max(delayMs, Math.round(job.lastDurationMs * 1.2));
   var scheduler = this;
   function runNow() {
      if (scheduler.closed || generation !== job.generation)
         return null;
      if (job.busy) {
         job.pending = true;
         return null;
      }
      job.busy = true;
      try {
         if (options && options.busyPreviewControl)
            options.busyPreviewControl.setBusy(true, options.busyOverlayText || "Working");
         if (options && options.statusLabel && options.busyText)
            options.statusLabel.text = options.busyText;
         var t0 = Date.now();
         var out = fn ? fn.call(scheduler.owner) : null;
         job.lastDurationMs = Date.now() - t0;
         if (options && options.statusLabel && options.doneText)
            options.statusLabel.text = options.doneText;
         return out;
      } catch (e) {
         if (options && options.statusLabel && options.errorText)
            options.statusLabel.text = options.errorText;
         if (options && typeof options.onError === "function")
            options.onError.call(scheduler.owner, k, e);
         else
            console.warningln("Preview job failed: " + e.message);
         return null;
      } finally {
         if (options && options.busyPreviewControl)
            options.busyPreviewControl.setBusy(false);
         job.busy = false;
         if (job.pending) {
            job.pending = false;
            scheduler.request(k, fn, options);
         }
      }
   }
   try { if (job.timer) job.timer.stop(); } catch (e0) {}
   if (delayMs <= 0 || typeof Timer === "undefined")
      return runNow();
   var timer = new Timer();
   try { timer.singleShot = true; } catch (e1) {}
   try { timer.periodic = false; } catch (e2) {}
   try { timer.interval = Math.max(0.001, delayMs / 1000.0); } catch (e3) {}
   timer.onTimeout = runNow;
   job.timer = timer;
   try { timer.start(); } catch (e4) { return runNow(); }
   return null;
};

function optStageList(record) {
   var out = [];
   if (!record || !record.stages)
      return out;
   for (var key in record.stages)
      if (optHasOwn(record.stages, key) && record.stages[key] === true)
         out.push(key);
   return out;
}

function optIsColorCorrectionStage(stage) {
   if (!stage)
      return false;
   return stage.indexOf("Color Calibration") >= 0 ||
          stage.indexOf("SPCC") >= 0 ||
          stage.indexOf("Auto Linear Fit") >= 0 ||
          stage.indexOf("Background Neutralization") >= 0;
}

function optRecordHasColorCorrection(record) {
   var stages = optStageList(record);
   for (var i = 0; i < stages.length; ++i)
      if (optIsColorCorrectionStage(stages[i]))
         return true;
   return false;
}

function OptImageRecord(key) {
   this.key = key;
   this.label = optLabelForKey(key);
   this.view = null;
   this.owned = false;
   this.available = {};
   this.stages = {};
}

OptImageRecord.prototype.clearView = function() {
   optReleaseOwnedSlotViews(this);
   this.view = null;
   this.owned = false;
};

function OptImageStore() {
   this.records = {};
   var keys = optAllWorkflowKeys();
   for (var i = 0; i < keys.length; ++i)
      this.records[keys[i]] = new OptImageRecord(keys[i]);
}

OptImageStore.prototype.record = function(key) {
   if (!optHasOwn(this.records, key))
      this.records[key] = new OptImageRecord(key);
   return this.records[key];
};

OptImageStore.prototype.setView = function(key, view, owned, tabName) {
   var rec = this.record(key);
   // #2: invalidate histogram cache for the previous view before clearing.
   if (optSafeView(rec.view))
      optInvalidateHistogramCache(rec.view.id);
   rec.clearView();
   rec.view = optSafeView(view) ? view : null;
   rec.owned = owned === true;
   if (!rec.available)
      rec.available = {};
   if (tabName && typeof tabName === "string" && tabName.length > 0)
      rec.available[tabName] = optSafeView(view);
   return rec;
};

OptImageStore.prototype.setAvailable = function(key, tabName, available) {
   var rec = this.record(key);
   if (!rec.available)
      rec.available = {};
   if (tabName && typeof tabName === "string" && tabName.length > 0)
      rec.available[tabName] = available === true;
};

OptImageStore.prototype.isAvailable = function(key, tabName) {
   var rec = this.record(key);
   if (!optSafeView(rec.view))
      return false;
   var availableMap = rec.available;
   if (!availableMap || !tabName || !optHasOwn(availableMap, tabName))
      return false;
   try {
      return availableMap[tabName] === true;
   } catch (e) {}
   return false;
};

OptImageStore.prototype.markStage = function(key, stage) {
   if (key && stage)
      this.record(key).stages[stage] = true;
};

OptImageStore.prototype.keysForTab = function(tabName) {
   var out = [];
   var keys = optAllWorkflowKeys();
   for (var i = 0; i < keys.length; ++i)
      if (this.isAvailable(keys[i], tabName))
         out.push(keys[i]);
   return out;
};

// Every workflow key whose record currently holds a valid View, regardless
// of the per-tab availability flags. Channel Combination uses this so any
// loaded image — not just images explicitly promoted through Pre → Stretch
// → Post — can be picked as a slot source.
OptImageStore.prototype.keysWithValidView = function() {
   var out = [];
   var keys = optAllWorkflowKeys();
   for (var i = 0; i < keys.length; ++i) {
      var rec = this.record(keys[i]);
      if (optSafeView(rec.view))
         out.push(keys[i]);
   }
   return out;
};

OptImageStore.prototype.releaseAll = function() {
   for (var key in this.records)
      if (optHasOwn(this.records, key))
         this.records[key].clearView();
};

function optAcronym(text, fallback) {
   var s = String(text || "").replace(/\([^)]*\)/g, " ").replace(/[^A-Za-z0-9]+/g, " ");
   var words = s.split(" ");
   var out = "";
   for (var i = 0; i < words.length; ++i) {
      var w = words[i];
      if (!w || w.length < 1)
         continue;
      var low = w.toLowerCase();
      if (low === "to" || low === "and" || low === "the" || low === "of" || low === "with" || low === "apply")
         continue;
      out += w.charAt(0).toUpperCase();
   }
   return out.length > 0 ? out : (fallback || "M");
}

function optControlSignature(control) {
   if (!control)
      return "";
   try {
      if (typeof control.currentItem !== "undefined")
         return "i" + control.currentItem;
   } catch (e0) {}
   try {
      if (typeof control.value !== "undefined")
         return "v" + format("%.6f", control.value);
   } catch (e1) {}
   try {
      if (typeof control.checked !== "undefined")
         return control.checked === true ? "1" : "0";
   } catch (e2) {}
   return "";
}

function optMemoryJoinSignature(items) {
   var out = [];
   for (var i = 0; i < items.length; ++i)
      out.push(optControlSignature(items[i]));
   return out.join("|");
}

function optMemoryMenuCode(tabName, stageName) {
   var s = String(stageName || "");
   if (s.indexOf("Gradient Correction") >= 0) return "GC";
   if (s.indexOf("Color Calibration") >= 0 || s.indexOf("SPCC") >= 0 || s.indexOf("Auto Linear Fit") >= 0 || s.indexOf("Background Neutralization") >= 0) return "CC";
   if (s.indexOf("Deconvolution") >= 0) return "D";
   if (s.indexOf("Noise Reduction") >= 0) return "NR";
   if (s.indexOf("Sharpening") >= 0) return "S";
   if (s.indexOf("Color Balance") >= 0) return "CB";
   if (s.indexOf("Curves") >= 0 || s.indexOf("CURVES") >= 0) return "C";
   if (s.indexOf("Channel Combination") >= 0) return "CC";
   if (s.indexOf("Stretch") >= 0) return "ST";
   if (tabName === OPT_TAB_PRE) return "PP";
   if (tabName === OPT_TAB_STRETCH) return "ST";
   if (tabName === OPT_TAB_POST) return "PP";
   if (tabName === OPT_TAB_CC) return "CC";
   return optAcronym(stageName, "M");
}

function optMemoryAlgorithmInfo(tabName, stageName, actionKey, dlg, resultMeta) {
   var info = { algorithm: "", signature: "" };
   if (resultMeta && resultMeta.algorithm) {
      info.algorithm = resultMeta.algorithm;
      info.signature = resultMeta.signature || resultMeta.algorithm;
      return info;
   }
   if (actionKey === "gradient") {
      var idx = 0;
      try { idx = optComboCanonicalItem(dlg.comboPreGradient); } catch (e0) {}
      if (idx === 0) {
         info.algorithm = "MGC";
         info.signature = optMemoryJoinSignature([dlg.comboMgcScale.combo, dlg.comboMgcSep.combo, dlg.ncMgcSmoothness, dlg.ncMgcScaleR, dlg.ncMgcScaleG, dlg.ncMgcScaleB]);
      } else if (idx === 1) {
         info.algorithm = "ADBE";
         info.signature = optMemoryJoinSignature([dlg.ncAdbePaths, dlg.ncAdbeTol, dlg.ncAdbeSmooth]);
      } else if (idx === 2) {
         info.algorithm = "ABE";
         info.signature = optMemoryJoinSignature([dlg.comboAbeCorrection.combo, dlg.ncAbeFunctionDegree, dlg.chkAbeNormalize]);
      } else {
         info.algorithm = "GX";
         info.signature = optMemoryJoinSignature([dlg.comboGraXpertCorrection.combo, dlg.ncGraXpertSmoothing]);
      }
      return info;
   }
   if (actionKey === "decon") {
      var deconIdx = 0;
      try { deconIdx = dlg.comboPreDecon.currentItem; } catch (e1) {}
      // Tag/signature by label (independent of the Parallax item's index).
      var deconLbl = "";
      try { deconLbl = dlg.comboPreDecon.itemText(deconIdx); } catch (eDL) {}
      var deconIsCC = /cosmic/i.test(deconLbl);
      var deconIsParallax = /parallax/i.test(deconLbl);
      var deconSig;
      if (deconIsCC) {
         info.algorithm = "CC";
         deconSig = optMemoryJoinSignature([dlg.comboPreCCSharpenMode.combo, dlg.ncPreCCStellarAmt, dlg.ncPreCCNSStrength, dlg.ncPreCCNSAmount, dlg.chkPreCCRemoveAb]);
      } else if (deconIsParallax) {
         info.algorithm = "PRLX";
         deconSig = optMemoryJoinSignature([dlg.chkPreParallaxCorrectAb, dlg.ncPreParallaxStarReduction, dlg.ncPreParallaxSharpen, dlg.ncPreParallaxTileSize, dlg.ncPreParallaxOverlap, dlg.ncPreParallaxPad]);
      } else {
         info.algorithm = "BXT";
         deconSig = optMemoryJoinSignature([dlg.ncBxtStars, dlg.ncBxtAdjustStarHalos, dlg.chkBxtAutoPSF, dlg.ncBxtPSFDiameter, dlg.ncBxtSharpenNonstellar, dlg.chkBxtCorrectOnly, dlg.chkBxtLuminanceOnly]);
      }
      info.signature = deconIdx + "|" + deconSig;
      return info;
   }
   if (actionKey === "spcc") { info.algorithm = "SPCC"; info.signature = "SPCC"; return info; }
   if (actionKey === "alf") { info.algorithm = "ALF"; info.signature = "ALF"; return info; }
   if (actionKey === "bn") { info.algorithm = "BN"; info.signature = "BN"; return info; }
   if (actionKey === "post_nr") {
       var nrIdx = 0;
       try { nrIdx = optComboCanonicalItem(dlg.comboPostNR); } catch (e2) {}
       // DEEPSNR-INTEGRATION-BEGIN
       info.algorithm = nrIdx === 0 ? "NXT" : (nrIdx === 1 ? "TGV" : (nrIdx === 2 ? "CC" : (nrIdx === 3 ? "GraX" : (nrIdx === 4 ? "Prism" : "DSNR"))));
       info.signature = "nr" + nrIdx + "|" + optMemoryJoinSignature([
          dlg.ncPostNxtDenoise, dlg.ncPostNxtIter, dlg.chkPostNxtColorSep, dlg.chkPostNxtFreqSep, dlg.ncPostNxtDenoiseColor,
          dlg.ncPostTgvStrengthL, dlg.ncPostTgvStrengthC, dlg.ncPostTgvEdge, dlg.ncPostTgvSmooth, dlg.ncPostTgvIter,
          dlg.comboPostCCDenoiseMode.combo, dlg.comboPostCCDenoiseModel.combo, dlg.ncPostCCNRLuma, dlg.ncPostCCNRColor, dlg.chkPostCCNRRemoveAb,
          dlg.chkPostNRUseMask,
          dlg.ncPostPrismStrength, dlg.ncPostPrismTileSize, dlg.ncPostPrismOverlap, dlg.ncPostPrismPad,
          dlg.chkPostPrismUseAMP, dlg.comboPostPrismAMPDType, dlg.chkPostPrismUseCPU, dlg.chkPostPrismNoDML,
          dlg.ncPostDeepSNRAmount
       ]);
       // DEEPSNR-INTEGRATION-END
       return info;
    }
   if (actionKey === "post_sharp") {
      var shIdx = 0;
      try { shIdx = dlg.comboPostSharp.currentItem; } catch (e3) {}
      // Algorithm code derived from the selected label (robust to the Parallax
      // item shifting indices under OPT_PRE_PARALLAX_ENABLED).
      var shLbl = "";
      try { shLbl = dlg.comboPostSharp.itemText(shIdx); } catch (eSL) {}
      var shCode = "BXT";
      if (/parallax/i.test(shLbl)) shCode = "PRLX";
      else if (/unsharp/i.test(shLbl)) shCode = "USM";
      else if (/hdr/i.test(shLbl)) shCode = "HDR";
      else if (/local histogram/i.test(shLbl)) shCode = "LHE";
      else if (/dark structure/i.test(shLbl)) shCode = "DSE";
      else if (/cosmic/i.test(shLbl)) shCode = "CC";
      info.algorithm = shCode;
      var shSigCtrls = [dlg.ncPostBxtStars, dlg.ncPostBxtAdjustStarHalos, dlg.chkPostBxtAutoPSF, dlg.ncPostBxtPSFDiameter, dlg.ncPostBxtSharpenNonstellar, dlg.ncPostUsmSigma, dlg.ncPostUsmAmount, dlg.chkPostUsmDeringing, dlg.ncPostHdrLayers, dlg.ncPostHdrIter, dlg.ncPostHdrOverdrive, dlg.ncPostLheRadius, dlg.ncPostLheSlope, dlg.ncPostLheAmount, dlg.ncPostDseAmount, dlg.comboPostCCSharpenModeCombo, dlg.ncPostCCStellarAmt, dlg.ncPostCCNSStrength, dlg.ncPostCCNSAmount, dlg.chkPostCCRemoveAb, dlg.chkPostSharpUseMask];
      // PARALLAX-INTEGRATION-BEGIN (post sharpen memory signature)
      if (OPT_PRE_PARALLAX_ENABLED)
         shSigCtrls = shSigCtrls.concat([dlg.chkPostParallaxCorrectAb, dlg.ncPostParallaxStarReduction, dlg.ncPostParallaxSharpen, dlg.ncPostParallaxTileSize, dlg.ncPostParallaxOverlap, dlg.ncPostParallaxPad]);
      // PARALLAX-INTEGRATION-END (post sharpen memory signature)
      info.signature = "sh" + shIdx + "|" + optMemoryJoinSignature(shSigCtrls);
      return info;
   }
   if (actionKey === "post_color") {
      info.algorithm = "CB";
      info.signature = optMemoryJoinSignature([dlg.ncPostColorBalanceSaturation, dlg.ncPostBalanceR, dlg.ncPostBalanceG, dlg.ncPostBalanceB, dlg.ncPostBalanceSat, dlg.chkPostBalanceSCNR, dlg.ncPostBalanceSCNR, dlg.chkPostColorUseMask]);
      return info;
   }
   if (actionKey === "post_curves") {
      info.algorithm = "CUR";
      info.signature = optMemoryJoinSignature([dlg.comboPostCurvesChan, dlg.ncPostCurvesContrast, dlg.ncPostCurvesBright, dlg.ncPostCurvesShadows, dlg.ncPostCurvesHighlights, dlg.ncPostCurvesSaturation, dlg.chkPostCurvesUseMask]);
      return info;
   }
   if (String(stageName || "").indexOf("Stretch ") === 0) {
      info.algorithm = String(stageName).replace("Stretch ", "");
      info.signature = info.algorithm;
      return info;
   }
   if (String(stageName || "").indexOf("Image") === 0) {
      info.algorithm = String(stageName).toUpperCase();
      info.signature = info.algorithm;
      return info;
   }
   info.algorithm = optAcronym(stageName, "IMG");
   info.signature = String(stageName || info.algorithm);
   return info;
}

function optBuildMemoryMeta(pane, stageName, actionKey, resultMeta) {
   var info = optMemoryAlgorithmInfo(pane ? pane.tab : "", stageName, actionKey, pane ? pane.dialog : null, resultMeta);
   var key = pane && pane.currentKey ? pane.currentKey : "";
   var menu = optMemoryMenuCode(pane ? pane.tab : "", stageName);
   return {
      key: key,
      image: optLabelForKey(key),
      stage: stageName || "",
      menu: menu,
      algorithm: info.algorithm || "IMG",
      signature: menu + "|" + (info.algorithm || "IMG") + "|" + (info.signature || ""),
      gradient: resultMeta && resultMeta.gradient === true
   };
}

// Returns the canonical "workflow stage" string that downstream gates expect
// for each tab. Used as a safety-net when committing from Memory so the
// "To <next>" buttons recognize the image as having passed through this tab,
// regardless of whether the slot meta carried a specific stage name.
function optDefaultTabStageLabel(tab) {
   if (tab === OPT_TAB_PRE)     return "Pre Processing (Memory)";
   if (tab === OPT_TAB_STRETCH) return "Stretch (Memory)";
   if (tab === OPT_TAB_POST)    return "Post Processing (Memory)";
   if (tab === OPT_TAB_CC)      return "Channel Combination (Memory)";
   return "";
}

function optMemoryCloneView(view, prefix, key, index) {
   if (!optSafeView(view))
      return null;
   return optCloneView(view, optUniqueId(prefix + "_" + (key || "Image") + "_" + (index + 1)), false);
}

function optReleaseOwnedSlotViews(slot) {
   if (!slot)
      return;
   if (slot.owned)
      optCloseViews([slot.view]);
   if (slot.gradientOwned)
      optCloseViews([slot.gradientView]);
   // ===== COMPARE-BEGIN — companion view for Star Split compare slots =====
   // Star Split Compare stores the starless in slot.view and the matching
   // stars layer in slot.companionView so a later "Use this Image" can
   // commit both at once without re-running the engine.
   if (slot.companionOwned)
      optCloseViews([slot.companionView]);
   // ===== COMPARE-END =====
}

// Memory budget helpers (#5).

function optEstimateViewBytes(view) {
   if (!optSafeView(view))
      return 0;
   try {
      var img = view.image;
      var bps = 4; // float32 default for PixInsight workflow images
      try { bps = Math.max(1, Math.floor(view.window.bitsPerSample / 8)); } catch (e0) { bps = 4; }
      return img.width * img.height * Math.max(1, img.numberOfChannels) * bps;
   } catch (eE) {
      return 0;
   }
}

function optEstimateSlotBytes(slot) {
   if (!slot) return 0;
   var bytes = 0;
   if (slot.owned)
      bytes += optEstimateViewBytes(slot.view);
   if (slot.gradientOwned)
      bytes += optEstimateViewBytes(slot.gradientView);
   return bytes;
}

// Mark a slot as recently accessed. Called after store and recall operations
// so LRU eviction prefers older, non-touched slots first.
function optTouchSlot(slot) {
   if (slot)
      slot.lastAccess = (new Date()).getTime();
}

// Build a flat census of all slots that hold owned views across the dialog's
// memory managers. Each entry tracks where the slot lives so it can be
// released through its manager's normal release path.
function optMemorySlotsCensus(dialog) {
   var entries = [];
   if (!dialog)
      return entries;
   var managers = [];
   if (dialog.preTab && dialog.preTab.preview && dialog.preTab.preview.memory)
      managers.push({ manager: dialog.preTab.preview.memory, label: "Pre", protectedIndex: dialog.preTab.preview.recalledMemoryIndex });
   if (dialog.stretchTab && dialog.stretchTab.preview && dialog.stretchTab.preview.memory)
      managers.push({ manager: dialog.stretchTab.preview.memory, label: "Stretch", protectedIndex: dialog.stretchTab.preview.recalledMemoryIndex });
   if (dialog.postTab && dialog.postTab.preview && dialog.postTab.preview.memory)
      managers.push({ manager: dialog.postTab.preview.memory, label: "Post", protectedIndex: dialog.postTab.preview.recalledMemoryIndex });
   if (dialog.ccTab && dialog.ccTab.preview && dialog.ccTab.preview.memory)
      managers.push({ manager: dialog.ccTab.preview.memory, label: "CC", protectedIndex: dialog.ccTab.preview.recalledMemoryIndex });
   for (var m = 0; m < managers.length; ++m) {
      var mgr = managers[m].manager;
      for (var i = 0; i < mgr.slots.length; ++i) {
         var slot = mgr.slots[i];
         if (!slot || !optSafeView(slot.view))
            continue;
         entries.push({
            kind: "image",
            label: managers[m].label,
            manager: mgr,
            index: i,
            slot: slot,
            bytes: optEstimateSlotBytes(slot),
            lastAccess: slot.lastAccess || 0,
            isProtected: i === managers[m].protectedIndex
         });
      }
   }
   if (dialog.postMaskMemory) {
      var mm = dialog.postMaskMemory;
      for (var k = 0; k < mm.slots.length; ++k) {
         var ms = mm.slots[k];
         if (!ms || !optSafeView(ms.view))
            continue;
         entries.push({
            kind: "mask",
            label: "Mask",
            manager: mm,
            index: k,
            slot: ms,
            bytes: optEstimateSlotBytes(ms),
            lastAccess: ms.lastAccess || 0,
            isProtected: k === mm.selectedIndex
         });
      }
   }
   return entries;
}

function optTotalMemorySlotBytes(dialog) {
   var entries = optMemorySlotsCensus(dialog);
   var total = 0;
   for (var i = 0; i < entries.length; ++i)
      total += entries[i].bytes;
   return total;
}

// Pre-flight memory check: warn the user (via console) when slot usage is
// approaching or has exceeded the soft budget. `addedBytes` (optional) accounts
// for an upcoming store that hasn't happened yet. `context` is a short label
// for the warning. Returns the projected total in bytes. Never throws.
function optMemoryPreflight(dialog, addedBytes, context) {
   if (!dialog)
      return 0;
   var current = 0;
   try { current = optTotalMemorySlotBytes(dialog); } catch (e0) { return 0; }
   var projected = current + (addedBytes || 0);
   var budget = OPT_MEMORY_BUDGET_BYTES;
   var gb = function(b) { return (b / (1024 * 1024 * 1024)).toFixed(2); };
   try {
      if (projected > budget) {
         console.warningln(
            "[Memory] " + (context || "store") +
            ": projected slot usage " + gb(projected) + " GB > budget " + gb(budget) +
            " GB. Oldest non-protected slots will be evicted to free space.");
      } else if (projected > budget * 0.85) {
         console.writeln(
            "[Memory] " + (context || "store") +
            ": slot usage " + gb(projected) + " GB approaching budget " + gb(budget) + " GB.");
      }
   } catch (eC) {}
   return projected;
}

// Releases an entry through its manager. Image-tab managers expose `slots[i]`
// directly with optReleaseOwnedSlotViews; mask manager releases the same way
// but also reflects the change in its UI.
function optEvictSlotEntry(entry) {
   if (!entry || !entry.manager || !entry.slot)
      return false;
   try {
      optReleaseOwnedSlotViews(entry.slot);
   } catch (e0) {}
   entry.manager.slots[entry.index] = null;
   if (entry.kind === "image") {
      var btn = entry.manager.buttons ? entry.manager.buttons[entry.index] : null;
      if (btn) {
         try {
            btn.text = "" + (entry.index + 1);
            btn.toolTip = optT("Empty memory slot (released to free memory)");
            btn.styleSheet = OPT_CSS_MEMORY_EMPTY;
         } catch (e1) {}
      }
   } else if (entry.kind === "mask") {
      try { entry.manager.refreshButtons(); } catch (e2) {}
   }
   return true;
}

// LRU eviction: while total slot memory exceeds OPT_MEMORY_BUDGET_BYTES,
// release the oldest non-protected slot. Called after every store operation.
// `selfDescription` is logged for the eviction reason.
// `protectedSlot` (optional): { manager, index } that should NEVER be evicted
// during this enforcement pass. Used by the image-memory store path to guarantee
// the slot the user just saved is preserved, regardless of LRU ordering.
function optEnforceMemoryBudget(dialog, selfDescription, protectedSlot) {
   if (!dialog)
      return 0;
   var entries = optMemorySlotsCensus(dialog);
   if (protectedSlot && protectedSlot.manager) {
      for (var p = 0; p < entries.length; ++p) {
         if (entries[p].manager === protectedSlot.manager && entries[p].index === protectedSlot.index)
            entries[p].isProtected = true;
      }
   }
   var total = 0;
   for (var i = 0; i < entries.length; ++i)
      total += entries[i].bytes;
   if (total <= OPT_MEMORY_BUDGET_BYTES)
      return 0;
   // Sort by lastAccess ascending: oldest first.
   entries.sort(function(a, b) { return a.lastAccess - b.lastAccess; });
   var evicted = 0;
   for (var j = 0; j < entries.length && total > OPT_MEMORY_BUDGET_BYTES; ++j) {
      var e = entries[j];
      if (e.isProtected)
         continue;
      var bytes = e.bytes;
      if (optEvictSlotEntry(e)) {
         total -= bytes;
         evicted++;
         try {
            console.noteln("[Memory budget] Evicted " + e.label + " slot " + (e.index + 1) +
                           " (" + Math.round(bytes / (1024 * 1024)) + " MB)" +
                           (selfDescription ? " — " + selfDescription : ""));
         } catch (eL) {}
      }
   }
   return evicted;
}

function OptMemoryManager(slotCount) {
   this.slots = [];
   for (var i = 0; i < slotCount; ++i)
      this.slots.push(null);
   this.buttons = [];
   this.signatureNumbers = {};
   this.nextSignatureNumber = 1;
}

OptMemoryManager.prototype.clear = function() {
   for (var i = 0; i < this.slots.length; ++i) {
      optReleaseOwnedSlotViews(this.slots[i]);
      this.slots[i] = null;
      if (this.buttons[i]) {
         this.buttons[i].text = "" + (i + 1);
         this.buttons[i].toolTip = optT("Empty memory slot");
         // Phase 4d: themed memory slot (empty variant).
         optThemeApplyMemorySlot(this.buttons[i], false);
      }
   }
   this.signatureNumbers = {};
   this.nextSignatureNumber = 1;
};

OptMemoryManager.prototype.numberForSignature = function(signature) {
   var sig = signature || "default";
   if (!optHasOwn(this.signatureNumbers, sig))
      this.signatureNumbers[sig] = this.nextSignatureNumber++;
   return this.signatureNumbers[sig];
};

OptMemoryManager.prototype.store = function(index, key, view, meta, gradientView, companionView) {
   if (index < 0 || index >= this.slots.length || !optSafeView(view))
      return;
   optReleaseOwnedSlotViews(this.slots[index]);
   var clone = optMemoryCloneView(view, "Opt_Memory", key, index);
   var gradClone = optMemoryCloneView(gradientView, "Opt_MemoryGradient", key, index);
   // Optional 6th argument (added for Star Split Compare in v138 Phase 2).
   // When present, it is cloned and stored as slot.companionView; the
   // setToCurrent memory branch then commits both view and companionView
   // as the Starless and Stars stage outputs respectively.
   var compClone = optMemoryCloneView(companionView, "Opt_MemoryCompanion", key, index);
   var slotMeta = meta || { image: optLabelForKey(key), menu: "M", algorithm: "IMG", signature: "IMG" };
   slotMeta.number = this.numberForSignature(slotMeta.signature);
   slotMeta.label = (slotMeta.image || optLabelForKey(key)) + " " + slotMeta.menu + " " + slotMeta.algorithm + " " + slotMeta.number;
   this.slots[index] = {
      key: key, view: clone, owned: true,
      gradientView: gradClone, gradientOwned: optSafeView(gradClone),
      companionView: compClone, companionOwned: optSafeView(compClone),
      meta: slotMeta
   };
   optTouchSlot(this.slots[index]);
   if (this.buttons[index]) {
      // Phase 4d: slot button shows only its number for the 22x22 chip; the
      // full slot label is surfaced via the toolTip.
      this.buttons[index].text = "" + (index + 1);
      this.buttons[index].toolTip = optT("Memory") + " " + (index + 1) + ": " + slotMeta.label;
      optThemeApplyMemorySlot(this.buttons[index], true);
   }
};

OptMemoryManager.prototype.slot = function(index) {
   if (index < 0 || index >= this.slots.length)
      return null;
   return this.slots[index];
};

OptMemoryManager.prototype.view = function(index) {
   var slot = this.slot(index);
   if (!slot)
      return null;
   return slot.view;
};


function optMaskMemoryMeta(dialog) {
   var algo = dialog && dialog.comboPostMask ? dialog.comboPostMask.currentItem : 0;
   if (algo === 1) {
      var preset = optComboText(dialog.comboPostCMPreset, "(Custom)");
      var map = { "(Custom)":"CUS", "Red":"RED", "Orange":"ORG", "Yellow":"YEL", "Green":"GRN", "Cyan":"CYN", "Blue":"BLU", "Magenta":"MAG" };
      return { code: "CM-" + (map[preset] || optAcronym(preset, "CUS")), signature: "CM|" + preset };
   }
   if (algo === 2) {
      var shape = optComboText(dialog.comboPostFameShape, "Freehand");
      var smap = { "Freehand":"FH", "Brush":"BR", "Spray Can":"SP", "Ellipse":"EL", "Rectangle":"REC" };
      return { code: "F-" + (smap[shape] || optAcronym(shape, "SH")), signature: "F|" + shape };
   }
   var mode = optComboText(dialog.comboPostRangeMode, "Luminance");
   var rmap = { "Binary":"BIN", "Luminance":"LUM", "Brightness":"BRI" };
   return { code: "RS-" + (rmap[mode] || optAcronym(mode, "RS")), signature: "RS|" + mode };
}

// Simplified mask memory manager (v33-opt-9m). Mirrors the image memory
// manager flow as closely as possible:
//   - Left-click slot  → storeAt(N, postActiveMask)
//   - Right-click slot → select(N) + activate (caller calls
//                        optSetActivePostMaskFromMemory)
//   - Single store path (storeAt) — no auto-find-empty heuristic, no
//     shared-vs-owned branching, no per-signature label counter.
// Earlier the class had storeNext / storeNextShared / preserveSharedView /
// numberForSignature methods plus signatureNumbers / nextSignatureNumber
// fields — all dead code as of v33-opt-9k (no remaining callers).
function OptMaskMemoryManager(slotCount) {
   this.slots = [];
   for (var i = 0; i < slotCount; ++i)
      this.slots.push(null);
   this.buttonSets = [];
   this.selectedIndex = -1;
}

OptMaskMemoryManager.prototype.registerButtons = function(buttons) {
   this.buttonSets.push(buttons || []);
   this.refreshButtons();
};

OptMaskMemoryManager.prototype.refreshButtons = function() {
   for (var s = 0; s < this.buttonSets.length; ++s) {
      var buttons = this.buttonSets[s];
      for (var i = 0; i < this.slots.length; ++i) {
         var b = buttons[i];
         if (!b)
            continue;
         var slot = this.slots[i];
         // Phase 6.10: themed mask memory slot. Always show the slot
         // number; the slot label travels via the toolTip so the 22 px
         // chip stays uniform. Filled and selected both render as the
         // amber "active" variant; the selected one is the most recent
         // recall and is distinguishable via the tool-tip + the
         // pane's preview swap.
         if (slot && optSafeView(slot.view)) {
            b.text = "" + (i + 1);
            b.toolTip = optT("Mask memory") + " " + (i + 1) + ": " + slot.label;
            optThemeApplyMemorySlot(b, true);
         } else {
            b.text = "" + (i + 1);
            b.toolTip = optT("Empty mask memory slot");
            optThemeApplyMemorySlot(b, false);
         }
      }
   }
};

OptMaskMemoryManager.prototype.select = function(index) {
   if (index < 0 || index >= this.slots.length)
      return null;
   this.selectedIndex = index;
   optTouchSlot(this.slots[index]);
   this.refreshButtons();
   return this.slots[index];
};

OptMaskMemoryManager.prototype.storeAt = function(index, view, meta) {
   if (index < 0 || index >= this.slots.length || !optSafeView(view))
      return -1;
   optReleaseOwnedSlotViews(this.slots[index]);
   var m = meta || { code: "MASK" };
   var clone = optMemoryCloneView(view, "Opt_MaskMemory", m.code || "Mask", index);
   this.slots[index] = { view: clone, owned: true, label: (m.code || "MASK") + " " + (index + 1), meta: m };
   optTouchSlot(this.slots[index]);
   this.selectedIndex = index;
   this.refreshButtons();
   return index;
};

OptMaskMemoryManager.prototype.selectedView = function() {
   if (this.selectedIndex < 0 || this.selectedIndex >= this.slots.length)
      return null;
   var slot = this.slots[this.selectedIndex];
   return slot && optSafeView(slot.view) ? slot.view : null;
};

OptMaskMemoryManager.prototype.clear = function() {
   for (var i = 0; i < this.slots.length; ++i) {
      optReleaseOwnedSlotViews(this.slots[i]);
      this.slots[i] = null;
   }
   this.selectedIndex = -1;
   this.refreshButtons();
};
