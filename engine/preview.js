function optResamplePreview(img, rw, rh, mode) {
   if (mode === Interpolation_NearestNeighbor) {
      try { img.resample(rw, rh, Interpolation_NearestNeighbor); } catch (eNN) {}
      return;
   }
   try {
      // Halve while the current size is still more than twice the target.
      while (img.width > rw * 2 && img.height > rh * 2)
         img.resample(img.width >> 1, img.height >> 1, Interpolation_Bilinear);
      if (img.width !== rw || img.height !== rh)
         img.resample(rw, rh, Interpolation_Bilinear);
   } catch (eRes) {
      try { img.resample(rw, rh, Interpolation_Bilinear); } catch (eRes2) {}
   }
}
// PREVIEW-MIPMAP-END

function optRenderPreviewBitmap(view, reductionFactor, stretchMode) {
   if (!optSafeView(view))
      return null;
   var img = null;
   try {
      if (!view.image)
         return null;
      var w = view.image.width;
      var h = view.image.height;
      var reduction = optClampPreviewReduction(reductionFactor);
      var rw = Math.max(1, Math.round(w / reduction));
      var rh = Math.max(1, Math.round(h / reduction));
      var previewInterpolation = Interpolation_Bilinear;
      try {
         var viewId0 = String(view.id || "");
         if (view.image.numberOfChannels === 1 &&
             (viewId0.indexOf("RangeMaskBinary") >= 0 || viewId0.indexOf("RS-BIN") >= 0))
            previewInterpolation = Interpolation_NearestNeighbor;
      } catch (eI0) {}
      img = new Image(w, h, view.image.numberOfChannels, view.image.colorSpace, 32, SampleType_Real);
      img.assign(view.image);
      // STRETCH-BEFORE-REDUCE: compute the MAD AutoSTF on the FULL-resolution image,
      // then reduce. Reducing first shrinks the noise MAD, which makes the auto
      // shadow-clip far too aggressive and exaggerates background structure at 3x+.
      // Stretching first uses the real statistics (like PixInsight's STF) and the
      // subsequent downscale averages the noise of the already-stretched image, so
      // the background stays clean. To revert: move these stretch lines back below
      // the optResamplePreview() call.
      if (stretchMode === "mad-unlinked")
         optApplyMadAutoStretch(img, false);
      else if (stretchMode === "mad-linked")
         optApplyMadAutoStretch(img, true);
      if (reduction > 1)
         optResamplePreview(img, rw, rh, previewInterpolation);
      return img.render();
   } finally {
      if (img)
         try { img.free(); } catch (e) {}
   }
}

function optRenderPreviewBitmapToSize(view, targetW, targetH, stretchMode) {
   if (!optSafeView(view))
      return null;
   var img = null;
   try {
      if (!view.image)
         return null;
      var rw = Math.max(1, targetW);
      var rh = Math.max(1, targetH);
      var previewInterpolation = Interpolation_Bilinear;
      try {
         var viewId1 = String(view.id || "");
         if (view.image.numberOfChannels === 1 &&
             (viewId1.indexOf("RangeMaskBinary") >= 0 || viewId1.indexOf("RS-BIN") >= 0))
            previewInterpolation = Interpolation_NearestNeighbor;
      } catch (eI1) {}
      img = new Image(view.image.width, view.image.height, view.image.numberOfChannels, view.image.colorSpace, 32, SampleType_Real);
      img.assign(view.image);
      // STRETCH-BEFORE-REDUCE (see optRenderPreviewBitmap): stretch on full-res
      // statistics first, then downscale, so the background is not exaggerated.
      if (stretchMode === "mad-unlinked")
         optApplyMadAutoStretch(img, false);
      else if (stretchMode === "mad-linked")
         optApplyMadAutoStretch(img, true);
      if (rw !== view.image.width || rh !== view.image.height)
         optResamplePreview(img, rw, rh, previewInterpolation);
      return img.render();
   } finally {
      if (img)
         try { img.free(); } catch (e) {}
   }
}

function optBuildPreviewImage(view, targetW, targetH, stretchMode) {
   if (!optSafeView(view) || !view.image)
      return null;
   var rw = Math.max(1, targetW);
   var rh = Math.max(1, targetH);
   var previewInterpolation = Interpolation_Bilinear;
   try {
      var viewId1 = String(view.id || "");
      if (view.image.numberOfChannels === 1 &&
          (viewId1.indexOf("RangeMaskBinary") >= 0 || viewId1.indexOf("RS-BIN") >= 0))
         previewInterpolation = Interpolation_NearestNeighbor;
   } catch (eI1) {}
   var img = new Image(view.image.width, view.image.height, view.image.numberOfChannels, view.image.colorSpace, 32, SampleType_Real);
   img.assign(view.image);
   // STRETCH-BEFORE-REDUCE (see optRenderPreviewBitmap): stretch on full-res
   // statistics first, then downscale, so the background is not exaggerated.
   if (stretchMode === "mad-unlinked")
      optApplyMadAutoStretch(img, false);
   else if (stretchMode === "mad-linked")
      optApplyMadAutoStretch(img, true);
   if (rw !== view.image.width || rh !== view.image.height)
      optResamplePreview(img, rw, rh, previewInterpolation);
   return img;
}

function optRenderPreviewBitmapWithMask(view, maskView, reductionFactor, stretchMode) {
   if (!optSafeView(view) || !optSafeView(maskView))
      return null;
   if (view.image.width !== maskView.image.width || view.image.height !== maskView.image.height)
      return null;
   var reduction = optClampPreviewReduction(reductionFactor);
   var rw = Math.max(1, Math.round(view.image.width / reduction));
   var rh = Math.max(1, Math.round(view.image.height / reduction));
   var srcImg = null;
   var maskImg = null;
   try {
      srcImg = optBuildPreviewImage(view, rw, rh, stretchMode);
      maskImg = optBuildPreviewImage(maskView, rw, rh, "");
      if (!srcImg || !maskImg)
         return null;
      var bmp = new Bitmap(rw, rh);
      var rRow = optCreateSampleArray(rw);
      var gRow = optCreateSampleArray(rw);
      var bRow = optCreateSampleArray(rw);
      var mRow = optCreateSampleArray(rw);
      var color = srcImg.numberOfChannels >= 3;
      for (var y = 0; y < rh; ++y) {
         var rect = new Rect(0, y, rw, y + 1);
         maskImg.getSamples(mRow, rect, 0);
         if (color) {
            srcImg.getSamples(rRow, rect, 0);
            srcImg.getSamples(gRow, rect, 1);
            srcImg.getSamples(bRow, rect, 2);
         } else {
            srcImg.getSamples(rRow, rect, 0);
         }
         // v33-opt-9n: overlay color changed from red to amber-gold (0xFFFFD000:
         // R=1.0, G=0.816, B=0.0) for visual consistency with the rest of the
         // script (Crop handles, accents) and to match the painted-region
         // appearance the user expects in FAME — white-area-of-mask = where
         // the mask will act (post v33-opt-9k's maskInverted=true).
         var TINT_R = 1.0;       // 255/255
         var TINT_G = 0.8157;    // 208/255
         var TINT_B = 0.0;       //   0/255
         for (var x = 0; x < rw; ++x) {
            var a = 0.65 * optClamp01(mRow[x]);
            var rv = optClamp01(rRow[x]);
            var gv = color ? optClamp01(gRow[x]) : rv;
            var bv = color ? optClamp01(bRow[x]) : rv;
            var rr = Math.max(0, Math.min(255, Math.round(255 * (rv * (1 - a) + a * TINT_R))));
            var gg = Math.max(0, Math.min(255, Math.round(255 * (gv * (1 - a) + a * TINT_G))));
            var bb = Math.max(0, Math.min(255, Math.round(255 * (bv * (1 - a) + a * TINT_B))));
            bmp.setPixel(x, y, 0xff000000 | (rr << 16) | (gg << 8) | bb);
         }
      }
      return bmp;
   } finally {
      if (srcImg)
         try { srcImg.free(); } catch (e0) {}
      if (maskImg)
         try { maskImg.free(); } catch (e1) {}
   }
}

function optRenderStackedPreviewBitmap(topView, bottomView, reductionFactor, stretchMode) {
   var top = optRenderPreviewBitmap(topView, reductionFactor, stretchMode);
   if (!top || !optSafeView(bottomView))
      return top;
   // Gradient model is always rendered at exactly half the linear size of the main preview,
   // regardless of the gradient view's native pixel dimensions (ABE, AutoDBE, GraXpert differ).
   var targetW = Math.max(1, Math.round(top.width / 2));
   var targetH = Math.max(1, Math.round(top.height / 2));
   var bottom = optRenderPreviewBitmapToSize(bottomView, targetW, targetH, "mad-unlinked");
   if (!bottom)
      return top;
   var gap = 8;
   var out = new Bitmap(Math.max(top.width, bottom.width), top.height + gap + bottom.height);
   var g = new Graphics(out);
   try {
      g.fillRect(new Rect(0, 0, out.width, out.height), new Brush(0xff202020));
      g.drawBitmap(Math.round((out.width - top.width) / 2), 0, top);
      g.fillRect(new Rect(0, top.height, out.width, top.height + gap), new Brush(0xff0e0e10));
      g.drawBitmap(Math.round((out.width - bottom.width) / 2), top.height + gap, bottom);
   } finally {
      g.end();
   }
   return out;
}

