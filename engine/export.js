// ===== EXPORT-PLUS-BEGIN (F7: multi-format export) =====
// Generalises the existing TIFF export to several formats, chosen by the file
// extension the user types in the Save dialog. Integer formats (TIFF/PNG/JPEG)
// go through a bit-depth export window; float formats (FITS/XISF) preserve the
// 32-bit linear data. The extension->format map is pure and unit-tested.
//
// Reversibility: self-contained — remove this file + its #include and the
// "Export As…" title-bar button. The original Export / Export TIF are untouched.

/**
 * Map a file path's extension to a PixInsight FileFormat, bit depth and create options.
 * Unknown extensions fall back to 16-bit TIFF. Pure.
 * @param {string} path @returns {{format:string, bits:number, float:boolean, options:string, ext:string}}
 */
function optExportFormatForPath(path) {
   var m = String(path || "").match(/\.([A-Za-z0-9]+)$/);
   var ext = m ? m[1].toLowerCase() : "";
   switch (ext) {
      case "tif": case "tiff": return { format: "TIFF", bits: 16, float: false, options: "compression none", ext: "tif" };
      case "png":              return { format: "PNG",  bits: 16, float: false, options: "", ext: "png" };
      case "jpg": case "jpeg": return { format: "JPEG", bits: 8,  float: false, options: "", ext: "jpg" };
      case "fit": case "fits": case "fts": return { format: "FITS", bits: 32, float: true, options: "", ext: "fits" };
      case "xisf":             return { format: "XISF", bits: 32, float: true, options: "", ext: "xisf" };
      default:                 return { format: "TIFF", bits: 16, float: false, options: "compression none", ext: "tif" };
   }
}

/**
 * Write a view's image to `path`, in the format implied by its extension.
 * Always copies into a typed export window (so the source view is untouched) and
 * closes it. Throws on a missing format module or a write failure.
 * @param {View} view @param {string} path
 * @param {string} [logText] optional processing-log text to embed as HISTORY
 *        keywords when the target format can store them (best-effort).
 * @returns {Object} the resolved format spec.
 */
function optExportViewToFile(view, path, logText) {
   if (!optSafeView(view)) throw new Error("Export: no valid image.");
   var spec = optExportFormatForPath(path);
   var F = new FileFormat(spec.format, false, true);
   if (F.isNull) throw new Error(spec.format + " format module not available.");
   var img = view.image, exportWin = null;
   try {
      exportWin = new ImageWindow(img.width, img.height, img.numberOfChannels, spec.bits, spec.float, img.isColor, "");
      exportWin.mainView.beginProcess(UndoFlag_NoSwapFile);
      exportWin.mainView.image.assign(img);
      exportWin.mainView.endProcess();
      var fInst = new FileFormatInstance(F);
      if (!fInst.create(path, spec.options)) throw new Error("Cannot create file: " + path);
      if (logText && typeof optProcLogEmbedInstance === "function")
         try { optProcLogEmbedInstance(fInst, F, logText); } catch (eEmb) {}
      if (!fInst.writeImage(exportWin.mainView.image)) throw new Error(spec.format + " write failed: " + path);
      fInst.close();
      console.writeln("Exported " + spec.format + " (" + spec.bits + "-bit" + (spec.float ? " float" : "") + "): " + path +
         " (" + img.width + "x" + img.height + ", " + img.numberOfChannels + "ch)");
   } finally {
      if (exportWin) try { exportWin.close(); } catch (e) {}
   }
   return spec;
}
// ===== EXPORT-PLUS-END =====
