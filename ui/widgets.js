
// PREVIEW-MIPMAP-BEGIN — high-quality preview downscaling (Option C, paint stage).
// Build a mipmap pyramid for a rendered preview bitmap. Each level is exactly half
// the previous one, produced with a clean 2:1 box-average (smoothInterpolation over
// a halving step). When the viewer is zoomed out (fit-to-window or wheel zoom-out),
// onPaint picks the smallest level still >= the display size and scales only the
// final <=2:1 remainder, where bilinear is artifact-free. This removes the banding
// /noise introduced by Qt scaling the full-size bitmap down by a large factor in one
// step. Pyramid depth is capped; levels stop near 96 px to bound memory (~+33%).
// To revert Option C: delete this function, the mipmap fields in optInitPreviewControl,
// the mipmap branch in drawBmp, and the mipmap frees in clearPaintCache.
function optBuildPreviewMipmaps(bmp) {
   var levels = [bmp];
   if (!bmp || bmp.width <= 0 || bmp.height <= 0)
      return levels;
   var cur = bmp;
   while (cur.width > 96 && cur.height > 96 && levels.length < 8) {
      var nw = cur.width >> 1;
      var nh = cur.height >> 1;
      if (nw < 1 || nh < 1)
         break;
      var next = null;
      try {
         next = new Bitmap(nw, nh);
         var gg = new Graphics(next);
         try {
            gg.smoothInterpolation = true;
            gg.drawScaledBitmap(0, 0, nw, nh, cur);
         } finally {
            try { gg.end(); } catch (eEnd) {}
         }
      } catch (eMip) {
         next = null;
      }
      if (!next)
         break;
      levels.push(next);
      cur = next;
   }
   return levels;
}
// PREVIEW-MIPMAP-END

function optInitPreviewControl(self, parent) {
   self.bitmap = null;
   self._paintCropBitmap = null;
   self._paintCropW = 0;
   self._paintCropH = 0;
   // PREVIEW-MIPMAP-BEGIN — lazy mipmap pyramids, keyed by the crop-cache name so
   // the main bitmap and the split-compare bitmap each get their own pyramid.
   self._paintCropBitmapMips = null;
   self._paintCropBitmapMipsSrc = null;
   self._paintCropCompareBitmapMips = null;
   self._paintCropCompareBitmapMipsSrc = null;
   // PREVIEW-MIPMAP-END
   // >>> SPLIT COMPARE BEGIN >>>
   self.isSplitMode = false;
   self.splitFraction = 0.5;
   self.compareBitmap = null;
   self._paintCropCompareBitmap = null;
   self._paintCropCompareW = 0;
   self._paintCropCompareH = 0;
   self.isDraggingSplit = false;
   // <<< SPLIT COMPARE END <<<
   self.scale = 1.0;
   self.isFitMode = true;
   self.autoScroll = true;
   self.tracking = true;
   self.viewport.backgroundColor = 0xff202020;
   self.viewport.cursor = new Cursor(StdCursor_OpenHand);
   self.mousePressed = false;
   self.isDragging = false;
   self.didDrag = false;
   self.clickPoint = new Point(0, 0);
   self.scrollStart = new Point(0, 0);
   self.onZoomChanged = null;
   // Delegate hooks for tabs that need custom mouse/overlay behaviour (e.g. FAME drawing).
   // Each receives image-space coordinates. Return true from onImageMousePress to suppress pan.
   self.onImageMousePress = null;
   self.onImageMouseMove = null;
   self.onImageMouseRelease = null;
   // Called inside onPaint after the bitmap is drawn. Signature: (g, scale, scrollX, scrollY).
   self.onOverlayPaint = null;
   self.busyActive = false;
   self.busyText = "";
   self.imageCoordScaleX = 1.0;
   self.imageCoordScaleY = 1.0;

   // PREVIEW-MIPMAP-BEGIN — free a pyramid's generated levels. Level 0 is the source
   // bitmap (self.bitmap / self.compareBitmap), owned and freed elsewhere, so skip it.
   self._freeMips = function(arr) {
      if (!arr)
         return;
      for (var mi = 1; mi < arr.length; ++mi) {
         try { if (arr[mi]) arr[mi].clear(); } catch (eFree) {}
      }
   };
   // PREVIEW-MIPMAP-END

   self.clearPaintCache = function() {
      if (self._paintCropBitmap) {
         try { self._paintCropBitmap.clear(); } catch (e0) {}
      }
      self._paintCropBitmap = null;
      self._paintCropW = 0;
      self._paintCropH = 0;
      // >>> SPLIT COMPARE BEGIN >>>
      if (self._paintCropCompareBitmap) {
         try { self._paintCropCompareBitmap.clear(); } catch (eCompare) {}
      }
      self._paintCropCompareBitmap = null;
      self._paintCropCompareW = 0;
      self._paintCropCompareH = 0;
      // <<< SPLIT COMPARE END <<<
      // PREVIEW-MIPMAP-BEGIN
      self._freeMips(self._paintCropBitmapMips);
      self._paintCropBitmapMips = null;
      self._paintCropBitmapMipsSrc = null;
      self._freeMips(self._paintCropCompareBitmapMips);
      self._paintCropCompareBitmapMips = null;
      self._paintCropCompareBitmapMipsSrc = null;
      // PREVIEW-MIPMAP-END
   };

   self.clampScrollPoint = function(p) {
      var maxX = 0;
      var maxY = 0;
      if (self.bitmap) {
         maxX = Math.max(0, Math.round(self.bitmap.width * self.scale) - self.viewport.width);
         maxY = Math.max(0, Math.round(self.bitmap.height * self.scale) - self.viewport.height);
      }
      return new Point(Math.max(0, Math.min(maxX, Math.round(p.x))), Math.max(0, Math.min(maxY, Math.round(p.y))));
   };

   self.updateScrollBars = function() {
      if (self.bitmap) {
         var imgW = Math.round(self.bitmap.width * self.scale);
         var imgH = Math.round(self.bitmap.height * self.scale);
         self.setHorizontalScrollRange(0, Math.max(0, imgW - self.viewport.width));
         self.setVerticalScrollRange(0, Math.max(0, imgH - self.viewport.height));
      } else {
         self.setHorizontalScrollRange(0, 0);
         self.setVerticalScrollRange(0, 0);
      }
   };

   self.fitToWindow = function() {
      if (!self.bitmap || self.viewport.width <= 0 || self.viewport.height <= 0)
         return;
      var sx = self.viewport.width / self.bitmap.width;
      var sy = self.viewport.height / self.bitmap.height;
      self.scale = Math.max(0.05, Math.min(Math.min(sx, sy) * 0.98, 40.0));
      self.isFitMode = true;
      self.scrollPosition = new Point(0, 0);
      self.updateScrollBars();
      if (self.onZoomChanged)
         self.onZoomChanged(self.scale, true);
      self.viewport.repaint();
   };

   self.setManualScale = function(scale) {
      if (!self.bitmap)
         return;
      self.scale = Math.max(0.05, Math.min(scale, 40.0));
      self.isFitMode = false;
      self.updateScrollBars();
      self.scrollPosition = self.clampScrollPoint(self.scrollPosition);
      if (self.onZoomChanged)
         self.onZoomChanged(self.scale, false);
      self.viewport.repaint();
   };

   self.setBitmap = function(bitmap, fit) {
      var saved = new Point(self.scrollPosition.x, self.scrollPosition.y);
      var oldBitmap = self.bitmap;
      var oldScale = self.scale;
      var oldBitmapWidth  = (oldBitmap && oldBitmap.width  > 0) ? oldBitmap.width  : 0;
      var oldBitmapHeight = (oldBitmap && oldBitmap.height > 0) ? oldBitmap.height : 0;
      var wasFitMode = self.isFitMode === true;
      var savedCenterX = 0.5;
      var savedCenterY = 0.5;
      if (oldBitmapWidth > 0 && oldScale > 0) {
         savedCenterX = ((saved.x / oldScale) + (self.viewport.width / (2 * oldScale))) / Math.max(1, oldBitmapWidth);
         savedCenterY = ((saved.y / oldScale) + (self.viewport.height / (2 * oldScale))) / Math.max(1, oldBitmapHeight);
         savedCenterX = Math.max(0, Math.min(1, savedCenterX));
         savedCenterY = Math.max(0, Math.min(1, savedCenterY));
      }
      if (oldBitmap && oldBitmap !== bitmap) {
         try { oldBitmap.clear(); } catch (eClear) {}
      }
      self.bitmap = bitmap;
      if (!bitmap) {
         self.clearPaintCache();
         self.scrollPosition = new Point(0, 0);
         self.updateScrollBars();
         self.viewport.repaint();
         return;
      }
      if (fit !== false) {
         self.fitToWindow();
      } else {
         var widthChanged = oldBitmapWidth > 0 && bitmap.width > 0 &&
                            oldBitmapWidth !== bitmap.width;
         if (widthChanged && wasFitMode) {
            self.fitToWindow();
            return;
         }
         if (widthChanged) {
            var widthRatio = oldBitmapWidth / bitmap.width;
            self.scale = Math.max(0.05, Math.min(self.scale * widthRatio, 40.0));
         }
         self.updateScrollBars();
         if (oldBitmapWidth > 0 && bitmap && oldScale > 0) {
            var targetImageX = savedCenterX * bitmap.width;
            var targetImageY = savedCenterY * bitmap.height;
            var targetScroll = new Point(
               targetImageX * self.scale - self.viewport.width / 2,
               targetImageY * self.scale - self.viewport.height / 2
            );
            self.scrollPosition = self.clampScrollPoint(targetScroll);
         } else {
            self.scrollPosition = self.clampScrollPoint(saved);
         }
         self.viewport.repaint();
      }
   };

   // CANCEL-BEGIN: cooperative cancel for long busy loops (Compare, batches). The
   // overlay optionally paints an \u2715 button; clicking it (processed during the loop's
   // optProcessEvents) sets cancelRequested, which the loop polls via isCancelRequested().
   self.cancelRequested = false;
   self.busyCancelable = false;
   self.busyCancelRect = null;
   self.isCancelRequested = function() { return self.cancelRequested === true; };
   // CANCEL-END

   self.setBusy = function(active, text, cancelable) {
      var wasBusy = self.busyActive === true;
      self.busyActive = active === true;
      self.busyText = text || optT("Working");
      // CANCEL: reset the flag only on the rising edge (start of the operation), so
      // per-iteration progress updates (which call setBusy again) do not clear a
      // cancel the user just requested mid-loop.
      self.busyCancelable = self.busyActive && (cancelable === true);
      if (self.busyActive && !wasBusy) self.cancelRequested = false;
      if (!self.busyActive) self.busyCancelRect = null;
      try { self.viewport.repaint(); } catch (e5) {}
   };

   self.paintBusyOverlay = function(g) {
      if (!self.busyActive)
         return;
      var x = 16, y = 16, r = 24;
      var textLen = self.busyText ? self.busyText.length * 7 : 0;
      var w = Math.max(220, Math.min(360, 86 + textLen + (self.busyCancelable ? 28 : 0)));
      var h = 62;
      g.brush = new Brush(0xcc000000);
      g.pen = new Pen(0xffd9a560, 1);
      g.drawRect(x, y, x + w, y + h);
      g.brush = new Brush(0xffd9a560);
      g.pen = new Pen(0xffe8e8ea, 2);
      g.drawEllipse(x + 10, y + 7, x + 10 + 2 * r, y + 7 + 2 * r);
      g.pen = new Pen(0xffffffff, 1);
      g.drawTextRect(new Rect(x + 10, y + 7, x + 10 + 2 * r, y + 7 + 2 * r), "\u03C0", TextAlign_Center | TextAlign_VertCenter);
      // CANCEL: paint an \u2715 button at the top-right and remember its hit rect.
      var textRight = x + w - 12;
      if (self.busyCancelable) {
         var cb = 18, cbX = x + w - cb - 8, cbY = y + 8;
         g.brush = new Brush(0xffb03030);
         g.pen = new Pen(0xffe8e8ea, 1);
         g.drawRect(cbX, cbY, cbX + cb, cbY + cb);
         g.pen = new Pen(0xffffffff, 2);
         g.drawLine(cbX + 5, cbY + 5, cbX + cb - 5, cbY + cb - 5);
         g.drawLine(cbX + cb - 5, cbY + 5, cbX + 5, cbY + cb - 5);
         self.busyCancelRect = { x0: cbX, y0: cbY, x1: cbX + cb, y1: cbY + cb };
         textRight = cbX - 6;
      } else {
         self.busyCancelRect = null;
      }
      if (self.busyText && self.busyText.length > 0)
         g.drawTextRect(new Rect(x + 70, y + 10, textRight, y + h - 10), self.busyText, TextAlign_Left | TextAlign_VertCenter);
   };

   self.viewport.onResize = function() {
      if (self.isFitMode)
         self.fitToWindow();
      else
         self.updateScrollBars();
   };

   self.viewport.onPaint = function(x0, y0, x1, y1) {
       var g = new Graphics(this);
       g.fillRect(new Rect(x0, y0, x1, y1), new Brush(0xff202020));
       var ctrl = self;
       if (ctrl.bitmap) {
          try {
             var sc = ctrl.scale;
             var sx = ctrl.scrollPosition.x;
             var sy = ctrl.scrollPosition.y;

             var drawBmp = function(targetBmp, cropCacheName) {
                // PREVIEW-MIPMAP-BEGIN — pick a pyramid level so the residual scale
                // stays in (0.5, 1] when zoomed out; at scale >= 1 this is a no-op
                // (level 0, effScale === sc) and matches the original behaviour.
                var mipsName = cropCacheName + "Mips";
                var mipsSrcName = cropCacheName + "MipsSrc";
                if (ctrl[mipsSrcName] !== targetBmp) {
                   ctrl._freeMips(ctrl[mipsName]);
                   ctrl[mipsName] = optBuildPreviewMipmaps(targetBmp);
                   ctrl[mipsSrcName] = targetBmp;
                }
                var mips = ctrl[mipsName] || [targetBmp];
                var level = 0;
                if (sc < 1.0 && mips.length > 1) {
                   level = Math.floor(Math.log(1.0 / sc) / Math.LN2);
                   if (level < 0) level = 0;
                   if (level > mips.length - 1) level = mips.length - 1;
                }
                var srcBmp = mips[level];
                var lf = (1 << level);        // 2^level: level-0 px per level-L px
                var effScale = sc * lf;        // level-L px -> display px
                // PREVIEW-MIPMAP-END
                var srcX = Math.max(0, Math.floor(sx / effScale));
                var srcY = Math.max(0, Math.floor(sy / effScale));
                var srcW = Math.min(srcBmp.width - srcX, Math.ceil(this.width / effScale) + 2);
                var srcH = Math.min(srcBmp.height - srcY, Math.ceil(this.height / effScale) + 2);
                if (srcW > 0 && srcH > 0) {
                   var crop = ctrl[cropCacheName];
                   if (!crop || ctrl[cropCacheName + "W"] !== srcW || ctrl[cropCacheName + "H"] !== srcH) {
                      if (crop) {
                         try { crop.clear(); } catch (e) {}
                      }
                      crop = new Bitmap(srcW, srcH);
                      ctrl[cropCacheName] = crop;
                      ctrl[cropCacheName + "W"] = srcW;
                      ctrl[cropCacheName + "H"] = srcH;
                   }
                   var gcrop = new Graphics(crop);
                   try {
                      gcrop.drawBitmap(-srcX, -srcY, srcBmp);
                      try { g.smoothInterpolation = true; } catch (eSmooth) {}
                      g.drawScaledBitmap(srcX * effScale - sx, srcY * effScale - sy, srcW * effScale, srcH * effScale, crop);
                   } finally {
                      try { gcrop.end(); } catch (eGcrop) {}
                   }
                }
             }.bind(self.viewport);

             if (ctrl.isSplitMode && ctrl.compareBitmap) {
                var splitPos = Math.round(this.width * ctrl.splitFraction);

                g.clipRect = new Rect(0, 0, splitPos, this.height);
                drawBmp(ctrl.compareBitmap, "_paintCropCompareBitmap");

                g.clipRect = new Rect(splitPos, 0, this.width, this.height);
                drawBmp(ctrl.bitmap, "_paintCropBitmap");

                g.clipRect = new Rect(0, 0, this.width, this.height);

                g.pen = new Pen(0xffd9a560, 2);
                g.drawLine(splitPos, 0, splitPos, this.height);

                var handleY = Math.round(this.height / 2);
                var handleR = 12;
                g.brush = new Brush(0xff202020);
                g.pen = new Pen(0xffd9a560, 2);
                g.drawEllipse(splitPos - handleR, handleY - handleR, splitPos + handleR, handleY + handleR);

                var font = new Font("Segoe UI");
                font.pixelSize = 10;
                font.bold = true;
                g.pen = new Pen(0xffd9a560);
                g.drawTextRect(new Rect(splitPos - handleR, handleY - handleR, splitPos + handleR, handleY + handleR), "\u25C0\u25B6", TextAlign_Center | TextAlign_VertCenter);
             } else {
                drawBmp(ctrl.bitmap, "_paintCropBitmap");
             }

             if (ctrl.onOverlayPaint)
                ctrl.onOverlayPaint(g, sc, sx, sy);
             ctrl.paintBusyOverlay(g);
          } catch (e0) {
          }
       } else {
          g.pen = new Pen(0xff808080);
          g.drawTextRect(new Rect(0, 0, this.width, this.height), "Select Image", TextAlign_Center);
          ctrl.paintBusyOverlay(g);
       }
       g.end();
    };

   self.viewport.onMousePress = function(x, y, button, buttons, modifiers) {
      var ctrl = self;
      // CANCEL: a click on the busy overlay's ✕ requests cancellation (polled by the
      // running loop during optProcessEvents) and consumes the click so it never pans.
      if (ctrl.busyActive && ctrl.busyCancelable && ctrl.busyCancelRect) {
         var cr = ctrl.busyCancelRect;
         if (x >= cr.x0 && x <= cr.x1 && y >= cr.y0 && y <= cr.y1) {
            ctrl.cancelRequested = true;
            try { ctrl.busyText = "Cancelling…"; ctrl.viewport.repaint(); } catch (eCx) {}
            return;
         }
      }
      if (ctrl.isSplitMode && button === OPT_MOUSE_LEFT) {
         var splitPos = Math.round(this.width * ctrl.splitFraction);
         if (Math.abs(x - splitPos) <= 15) {
            ctrl.isDraggingSplit = true;
            this.cursor = new Cursor(StdCursor_SizeHor);
            return;
         }
      }
      var imgX = Math.floor(((ctrl.scrollPosition.x + x) / ctrl.scale) * ctrl.imageCoordScaleX);
      var imgY = Math.floor(((ctrl.scrollPosition.y + y) / ctrl.scale) * ctrl.imageCoordScaleY);
      if (ctrl.onImageMousePress && ctrl.onImageMousePress(imgX, imgY, button, modifiers))
         return;
      ctrl.mousePressed = true;
      ctrl.isDragging = false;
      ctrl.didDrag = false;
      ctrl.clickPoint = new Point(x, y);
      ctrl.scrollStart = new Point(ctrl.scrollPosition);
      if (button === OPT_MOUSE_LEFT)
         this.cursor = new Cursor(StdCursor_ClosedHand);
   };

   self.viewport.onMouseMove = function(x, y, buttons, modifiers) {
      var ctrl = self;
      if (ctrl.isDraggingSplit) {
         ctrl.splitFraction = Math.max(0.01, Math.min(0.99, x / this.width));
         this.repaint();
         return;
      }
      if (ctrl.isSplitMode && !ctrl.mousePressed) {
         var splitPos = Math.round(this.width * ctrl.splitFraction);
         if (Math.abs(x - splitPos) <= 15) {
            this.cursor = new Cursor(StdCursor_SizeHor);
         } else {
            this.cursor = new Cursor(StdCursor_OpenHand);
         }
      }
      var imgX = Math.floor(((ctrl.scrollPosition.x + x) / ctrl.scale) * ctrl.imageCoordScaleX);
      var imgY = Math.floor(((ctrl.scrollPosition.y + y) / ctrl.scale) * ctrl.imageCoordScaleY);
      if (ctrl.onImageMouseMove) {
         ctrl.onImageMouseMove(imgX, imgY, buttons, modifiers);
      }
      if (!ctrl.mousePressed)
         return;
      var dx = x - ctrl.clickPoint.x;
      var dy = y - ctrl.clickPoint.y;
      if (dx * dx + dy * dy > 9) {
         ctrl.isDragging = true;
         ctrl.didDrag = true;
      }
      if (ctrl.isDragging) {
         ctrl.scrollPosition = ctrl.clampScrollPoint(new Point(ctrl.scrollStart.x - dx, ctrl.scrollStart.y - dy));
         this.repaint();
      }
   };

   self.viewport.onMouseRelease = function(x, y, button, buttons, modifiers) {
      var ctrl = self;
      if (ctrl.isDraggingSplit) {
         ctrl.isDraggingSplit = false;
         this.cursor = new Cursor(StdCursor_OpenHand);
         return;
      }
      var imgX = Math.floor(((ctrl.scrollPosition.x + x) / ctrl.scale) * ctrl.imageCoordScaleX);
      var imgY = Math.floor(((ctrl.scrollPosition.y + y) / ctrl.scale) * ctrl.imageCoordScaleY);
      if (ctrl.onImageMouseRelease)
         ctrl.onImageMouseRelease(imgX, imgY, button, modifiers);
      ctrl.mousePressed = false;
      ctrl.isDragging = false;
      this.cursor = new Cursor(StdCursor_OpenHand);
   };

   self.viewport.onMouseWheel = function(x, y, delta) {
      if (!self.bitmap)
         return;
      if (delta === undefined || delta === 0 || isNaN(delta))
         return;
      var oldScale = self.scale;
      var newScale = delta > 0 ? oldScale * 1.1 : oldScale / 1.1;
      newScale = Math.max(0.05, Math.min(newScale, 40.0));
      var ix = (self.scrollPosition.x + x) / oldScale;
      var iy = (self.scrollPosition.y + y) / oldScale;
      self.scale = newScale;
      self.isFitMode = false;
      self.updateScrollBars();
      self.scrollPosition = self.clampScrollPoint(new Point(ix * newScale - x, iy * newScale - y));
      if (self.onZoomChanged)
         self.onZoomChanged(newScale, false);
      this.repaint();
   };
}

class OptPreviewControl extends ScrollBox {
   constructor(parent) {
      super(parent);
      optInitPreviewControl(this, parent);
   }
}

function optButton(parent, text, width) {
   var b = new PushButton(parent);
   optI18nLabel(b, text);
   if (width)
      b.minWidth = width;
   b.styleSheet = OPT_CSS_MODE_OFF;
   optApplyTooltip(b, "button", text, "Button");
   return b;
}

function optPrimaryButton(parent, text, width) {
   var b = optButton(parent, text, width);
   b.styleSheet = OPT_CSS_PRIMARY;
   return b;
}

function optLabel(parent, text, width) {
   var l = new Label(parent);
   optI18nLabel(l, text);
   l.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   if (width)
      l.minWidth = width;
   optApplyTooltip(l, "label", text, "");
   return l;
}

function optInfoLabel(parent, text) {
   var l = new Label(parent);
   l.useRichText = true;
   l.wordWrapping = true;
   l.text = text || "";
   l.styleSheet = OPT_CSS_INFO;
   return l;
}

function optEngineTitle(parent, text) {
   // Phase 4 polish: themed engine eyebrow — no surrounding card/border (the
   // left panel is already a card), Theme.amber colour, mono uppercase. The
   // previous styleSheet used 2 px letter-spacing on a 21-char string which
   // was clipped inside the 300 px left panel ("PRE PROCESSING ENGIN" was
   // missing its final E).
   var l = new Label(parent);
   l.text = text;
   l.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   try {
      l.styleSheet =
         "QLabel {" +
         " color: " + Theme.amber + ";" +
         " background-color: transparent; border: 0px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 8pt; font-weight: 700;" +
         " padding-top: 4px; padding-bottom: 4px;" +
         " padding-left: 2px; padding-right: 2px;" +
         "}";
   } catch (e) {}
   l.minHeight = 26;
   try { l.setFixedHeight(26); } catch (eH) {}
   optApplyTooltip(l, "section", text, "Section");
   return l;
}

// NUMERIC-EDIT-WIDTH-FIX (Dev_194): NumericControl auto-sizes its edit box using
// the default UI font, but optThemeApplyNumericEdit() overrides the box with the
// JetBrains Mono / Consolas stack (wider) plus 12 px of horizontal padding. The
// result under V8 is that the integer digits clip and only the decimals stay
// visible. Compute an explicit width from the widest value the control can show
// (max magnitude + precision + sign) so the whole number always fits.
function optNumericEditWidthFor(min, max, precision) {
   var p = precision || 0;
   function fmt(v) { return (v < 0 ? "-" : "") + Math.abs(v).toFixed(p); }
   var chars = Math.max(fmt(min).length, fmt(max).length);
   // ~8 px per mono glyph at 9 pt/weight 600 + 12 px padding + ~12 px caret/slack.
   return chars * 8 + 24;
}

function optNumeric(parent, labelText, min, max, value, precision, labelWidth) {
   var nc = new NumericControl(parent);
   optI18nLabel(nc.label, labelText);
   nc.label.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   // Phase 6: cap labelWidth so old call-sites that asked for 150-170 px do
   // not starve the slider inside the 300 px left card. 100 px is a sweet
   // spot — wide enough for words like "Shadows", "Boost clip", "Smooth"
   // without their tail getting clipped, narrow enough to leave the slider
   // a usable track (~100 px) after the value chip.
   if (labelWidth) {
      var cappedW = Math.min(labelWidth, 100);
      nc.label.minWidth = cappedW;
      try { nc.label.maxWidth = cappedW; } catch (eMW) {}
      try { nc.adjustToContents(); } catch (eAC) {}
   }
   nc.setRange(min, max);
   nc.setPrecision(precision || 0);
   try {
      if (min >= 0 && max <= 1.0)
         nc.slider.setRange(Math.round(min * 100), Math.round(max * 100));
   } catch (e0) {}
   nc.setValue(value);
   try { nc.label.styleSheet = "QLabel { border:1px solid transparent; }"; } catch (e1) {}
   // Phase 6: auto-theme every NumericControl so callers that have not been
   // updated yet still get the amber-tinted slider, themed edit chip and
   // themed label. Idempotent on Phase 5 callers that already invoke
   // optThemeApplyNumericControl explicitly.
   try { optThemeApplyNumericControl(nc); } catch (e2) {}
   // Force the edit width to fit the full number (see NUMERIC-EDIT-WIDTH-FIX).
   try { nc.edit.setFixedWidth(optNumericEditWidthFor(min, max, precision || 0)); } catch (eEW) {}
   var tt = optTooltipFor("numeric", labelText, "NumericControl");
   if (tt && tt.length > 0) {
      optApplyTooltip(nc, tt);
      optApplyTooltip(nc.label, tt);
      optApplyTooltip(nc.slider, tt);
      optApplyTooltip(nc.edit, tt);
   }
   return nc;
}

function optComboRow(parent, labelText, items, width) {
   var row = new Control(parent);
   row.sizer = new HorizontalSizer();
   row.sizer.spacing = Theme.s2;       // Phase 6: tighter spacing
   // Phase 6: cap label width so the combo gets enough room inside the
   // 300 px left card. 100 px matches the optNumeric label cap.
   var cappedW = width ? Math.min(width, 100) : 100;
   var label = optLabel(row, labelText, cappedW);
   try { label.maxWidth = cappedW; } catch (eW) {}
   var combo = new ComboBox(row);
   for (var i = 0; i < items.length; ++i)
      combo.addItem(items[i]);
   var tt = optTooltipFor("combo", labelText, "ComboBox");
   if (tt && tt.length > 0) {
      optApplyTooltip(row, tt);
      optApplyTooltip(label, tt);
      optApplyTooltip(combo, tt);
   }
   row.sizer.add(label);
   row.sizer.add(combo, 100);
   // Phase 6: auto-theme so legacy callers get the new look.
   try { optThemeApplyChannelComboStyle(combo); } catch (e3) {}
   try { optThemeApplyNumericLabel(label); } catch (e4) {}
   return { row: row, label: label, combo: combo };
}

function optInnerGroup(parent, title) {
   // Phase 6: redirect to the themed subcard. Every Stretching / Post
   // Processing / Channel Combination module that wrapped its parameters
   // in optInnerGroup(parent, "Foo Settings") now gets the new look:
   // surface bg, hairline border, rounded radius, uppercase mono header.
   // Callers continue to use .sizer.add(...) and .visible exactly the
   // same way; the QGroupBox native title is replaced by a Label header
   // inside the sizer.
   var card = optThemeBuildSubcard(parent, title);
   try { optApplyTooltip(card, "group", title, "Section"); } catch (e) {}
   return card;
}

// ============================================================================
// >>> SECTION BAR — Phase 5 — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Rebuilds the section-header / body widget pair (used by Image Selection,
// Crop, Plate Solving, Gradient Correction, Color Calibration, Deconvolution,
// Star Split, and every other collapsible block) per DESIGN_SPEC §2.9.
//
// New visual:
//
//   [toggle bitmap] [Title]                                              [chevron]
//
// - toggle: a 26×15 Bitmap painted with a rounded track + circular thumb;
//   visually "on" when expanded, "off" when collapsed. Decorative — the
//   toggle does NOT add a separate on/off state to the section model.
// - title: text 10 pt / 500, color text.
// - chevron: a single glyph (▸ collapsed, ▾ expanded) in textDim 12 pt.
// - whole header is clickable; toggling cycles through expand / collapse.
// - when expanded, the header bg is amberSoft and the border is amberRing;
//   when collapsed both are transparent so the section reads as quiet.
//
// To revert: delete this block and restore the previous optSection from git.
// ============================================================================

function optThemeBuildToggleBitmap(isOn) {
   var bm = new Bitmap(26, 15);
   bm.fill(0);
   try {
      var g = new Graphics(bm);
      try {
         g.antialiasing = true;
         g.pen = new Pen(0x00000000, 1);          // no outline on the track
         // Off-state track uses textDim (#52525c) instead of surfaceRaised so
         // it stands out against the surface bg of the card; spec's
         // surfaceRaised was visually invisible at this size.
         g.brush = new Brush(isOn ? optThemeColorInt("amber")
                                  : optThemeColorInt("textDim"));
         g.drawRoundedRect(0, 0, 25, 14, 7, 7);
         var thumbX = isOn ? 13 : 2;
         var thumbY = 2;
         var thumbInt = isOn ? 0xFF15110A : optThemeColorInt("text");
         g.brush = new Brush(thumbInt);
         g.drawEllipse(thumbX, thumbY, thumbX + 10, thumbY + 10);
      } finally { g.end(); }
   } catch (e) {}
   return bm;
}

function optSection(parent, title) {
   // ------------------------------------------------------------------
   // Phase 5 v2: single-Frame painted header.
   //
   // The previous implementation built the header with a Control as the
   // container plus three child widgets (toggle Control, title Label,
   // chevron Label). PJSR's Control did not reliably fire onMousePress
   // and stretched Labels only registered clicks on their text glyph
   // area, so users reported that only the chevron at the far right
   // actually flipped the section. The multi-widget styleSheet swaps
   // also made open/close feel sluggish.
   //
   // This rewrite collapses the entire header into ONE Frame whose
   // onPaint draws the bg + border, toggle bitmap, title text and
   // chevron in a single pass. A single onMousePress on that Frame is
   // therefore guaranteed to fire anywhere inside the row. Repaints
   // happen via Frame.update() instead of styleSheet reassignment.
   // ------------------------------------------------------------------

   var header = new Frame(parent);
   header.minHeight = 44;
   header.maxHeight = 44;
   header.expanded = true;
   try {
      // Suppress Frame's native border so our painted rect is the only
      // border visible. The actual look comes from onPaint below.
      header.frameStyle = FrameStyle_Flat;
      header.styleSheet =
         "QFrame { background-color: transparent; border: 0px; }";
   } catch (eH0) {}

   // Body: vertical sizer hosted in a separate Control underneath. Phase 6:
   // apply the amber-tinted module-body styling here so EVERY section across
   // every tab gets the new look without having to touch each module's build
   // function. The Phase 5 modules that already call optThemeApplyModuleBody
   // are now redundant but harmless.
   var body = new Control(parent);
   body.sizer = new VerticalSizer();
   body.sizer.margin = Theme.s2;       // 8 px interior padding
   body.sizer.spacing = Theme.s2;
   try { optThemeApplyModuleBody(body); } catch (eB) {}

   // Cached resources for onPaint.
   var toggleBmOn  = null, toggleBmOff = null;
   try { toggleBmOn  = optThemeBuildToggleBitmap(true);  } catch (eOn)  {}
   try { toggleBmOff = optThemeBuildToggleBitmap(false); } catch (eOff) {}

   // Section header title: 15 px regular per user feedback (bold at 14 px
   // read too heavy; 13 px regular read too thin). 15 px regular sits in
   // the sweet spot between the two iterations.
   var titleFont = new Font("Segoe UI");
   try { titleFont.pixelSize = 15; } catch (eFs) {
      try { titleFont.pointSize = 11; } catch (eFs2) {}
   }
   try { titleFont.bold = false; } catch (eFb) {}

   var chevronFont = new Font("Segoe UI Symbol");
   try { chevronFont.pixelSize = 13; } catch (eCf) {
      try { chevronFont.pointSize = 10; } catch (eCf2) {}
   }
   try { chevronFont.bold = true; } catch (eCb) {}

   var section = { bar: header, body: body, expanded: true, title: title };
   header.body = body;

   // Tooltip plumbing preserved.
   var sectionTip = optTooltipFor("section", title, "Section");
   if (sectionTip && sectionTip.length > 0) {
      optApplyTooltip(header, sectionTip);
      optApplyTooltip(body, sectionTip);
   }

   header.onPaint = function() {
      var g = new Graphics(this);
      try {
         g.antialiasing = true;
         var w = this.width;
         var h = this.height;

         // Background + border. amberSoft / amberRing are alpha-encoded
         // ARGB ints, so Qt blends them against the parent's bg.
         if (header.expanded) {
            g.brush = new Brush(optThemeColorInt("amberSoft"));
            g.pen   = new Pen(optThemeColorInt("amberRing"), 1);
            g.drawRoundedRect(0, 0, w - 1, h - 1, Theme.rLg, Theme.rLg);
         }
         // (Collapsed: no bg drawn — the section reads as a quiet row.)

         // Toggle bitmap on the left, vertically centred.
         var bm = header.expanded ? toggleBmOn : toggleBmOff;
         if (bm) {
            var bmY = Math.round((h - 15) / 2);
            g.drawBitmap(10, bmY, bm);
         }

         // Title text, just after the toggle. optT() makes this language-aware;
         // the header is registered for repaint on language toggle (see below).
         g.font = titleFont;
         g.pen  = new Pen(optThemeColorInt("text"));
         g.drawText(46, Math.round(h / 2 + 5), optT(title));

         // Chevron on the right.
         g.font = chevronFont;
         g.pen  = new Pen(optThemeColorInt("textDim"));
         g.drawText(w - 22, Math.round(h / 2 + 5),
                    header.expanded ? "▾" : "▸");
      } finally {
         g.end();
      }
   };

   header.setExpanded = function(expanded) {
      header.expanded = expanded === true;
      section.expanded = header.expanded;
      body.visible = header.expanded;
      try { header.update(); } catch (eU) {}
   };

   header.onMousePress = function() {
      header.setExpanded(!header.expanded);
   };

   // Language toggle: the title is drawn via optT(title) in onPaint, so a repaint
   // is all that is needed to switch languages.
   optI18nRegisterRepaint(header);

   try { header.cursor = new Cursor(StdCursor_PointingHand); } catch (eCur) {}

   section.setExpanded = function(expanded) {
      header.setExpanded(expanded);
   };

   // Initial paint kicks in lazily from PJSR — no eager invalidation needed.
   return section;
}
// ----------------------------------------------------------------------------
// <<< SECTION BAR — Phase 5 ends here >>>
// ============================================================================


// ============================================================================
// >>> MEMORY BANK — Phase 4d — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Styles the "Memory: 1 2 3 4 5 6 7 8  Reset" row above the preview, per
// DESIGN_SPEC §2.11. Layout:
//
//   MEMORY   [ 1 │ 2 │ 3 │ 4 │ 5 │ 6 │ 7 │ 8 ]   [RESET]
//
// - The label is uppercase, mono, textMuted (tLabel-ish).
// - The 8 slot buttons sit inside a dark rounded container (bg Theme.bg,
//   border, rMd radius). Each slot is 22×22, rounded 5, mono 9pt.
//   Filled slots flip to the amber chip variant.
// - Reset is a "ghost" button: transparent bg, hairline border, mono
//   uppercase, textMuted.
// To revert: delete this block, restore the original OPT_CSS_MEMORY_EMPTY
// / OPT_CSS_MEMORY_FILLED references and the optButton(... 82) widths.
// ============================================================================

function optThemeApplyMemoryLabel(label) {
   if (!label) return;
   try {
      label.styleSheet =
         "QLabel {" +
         " color: " + Theme.textMuted + ";" +
         " background-color: transparent; border: 0px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 8pt; font-weight: 600;" +
         "}";
   } catch (e) {}
}

function optThemeApplyMemoryContainer(widget) {
   if (!widget) return;
   try {
      widget.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.bg + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rMd + "px;" +
         "}";
   } catch (e) {}
}

function optThemeApplyMemorySlot(btn, isFilled) {
   if (!btn) return;
   try {
      btn.minWidth = 22;  btn.maxWidth = 22;
      btn.minHeight = 22; btn.maxHeight = 22;
      if (isFilled) {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: " + optThemeRgba("amberSoft") + ";" +
            " color: " + Theme.amber + ";" +
            " border: 1px solid " + optThemeRgba("amberRing") + ";" +
            " border-radius: 5px; padding: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 9pt; font-weight: 700;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + optThemeRgba("amberSoft") +
            "; color: " + Theme.amber + "; }" +
            "QPushButton:focus { outline: none; }";
      } else {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: transparent;" +
            " color: " + Theme.textMuted + ";" +
            " border: 1px solid transparent;" +
            " border-radius: 5px; padding: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 9pt; font-weight: 600;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + optThemeRgba("borderStrong") +
            "; color: " + Theme.text + "; }" +
            "QPushButton:focus { outline: none; }";
      }
   } catch (e) {}
}

function optThemeApplyMemoryReset(btn) {
   if (!btn) return;
   try {
      btn.minHeight = 28; btn.maxHeight = 28;
      btn.styleSheet =
         "QPushButton {" +
         " background-color: transparent;" +
         " color: " + Theme.textMuted + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rMd + "px;" +
         " padding-left: 12px; padding-right: 12px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: 600;" +
         " outline: none;" +
         "}" +
         "QPushButton:hover { background-color: " + Theme.surfaceHover +
         "; color: " + Theme.text + "; }" +
         "QPushButton:focus { outline: none; }";
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< MEMORY BANK — Phase 4d ends here >>>
// ============================================================================


// ============================================================================
// >>> ACTION BUTTONS — Phase 4e — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Styles the preview-pane action buttons per DESIGN_SPEC §2.12:
//   - Toggle / Export / Export TIF (and similar): surfaceRaised bg, hairline
//     border, rMd radius, padding 0/13, height 30, tBody text.
//   - Use this Image: a "primary commit" variant of the same shape. It
//     flips between two visual states:
//       * READY  — amberSoft bg, amberRing border, amber text. Says
//         "you have a candidate; click to promote it to Current".
//       * APPLIED — transparent bg, success-green text, success-green
//         border. Says "already promoted; nothing to do here".
// To revert: delete this block and restore the original OPT_CSS_MODE_OFF /
// OPT_CSS_SET_CURRENT / OPT_CSS_SET_CURRENT_APPLIED assignments.
// ============================================================================

function optThemeApplyActionButton(btn) {
   if (!btn) return;
   try {
      btn.minHeight = 30; btn.maxHeight = 30;
      btn.styleSheet =
         "QPushButton {" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rMd + "px;" +
         " padding-top: 0px; padding-bottom: 0px;" +
         " padding-left: 13px; padding-right: 13px;" +
         " font-size: 9pt; font-weight: 500;" +
         " outline: none;" +
         "}" +
         "QPushButton:hover { background-color: " + Theme.surfaceHover +
         "; color: " + Theme.text + "; }" +
         "QPushButton:disabled { color: " + Theme.textDim + "; }" +
         "QPushButton:focus { outline: none; }";
   } catch (e) {}
}

// Variant of the action button that renders its label in the panel's mono
// type family (JetBrains Mono / Consolas) instead of the proportional UI font.
// Used for the "Load Image Files…" button in the Image Selection card so it
// reads as part of the same family as the mono segmented pills, recipe pills
// and channel labels around it (which all use Theme.fontMono). Everything else
// — surface, border, radius, height, padding, hover/disabled — matches
// optThemeApplyActionButton so the two stay visually in lockstep.
function optThemeApplyActionButtonMono(btn) {
   if (!btn) return;
   try {
      btn.minHeight = 30; btn.maxHeight = 30;
      btn.styleSheet =
         "QPushButton {" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rMd + "px;" +
         " padding-top: 0px; padding-bottom: 0px;" +
         " padding-left: 13px; padding-right: 13px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: 600;" +
         " outline: none;" +
         "}" +
         "QPushButton:hover { background-color: " + Theme.surfaceHover +
         "; color: " + Theme.text + "; }" +
         "QPushButton:disabled { color: " + Theme.textDim + "; }" +
         "QPushButton:focus { outline: none; }";
   } catch (e) {}
}

// UI-MODE (F6): golden toggle for the Simple/Advanced button — same amber family as the
// big CTA buttons. ON (Simple active) = filled amber gradient (dark bold text); OFF
// (Advanced) = amber ghost/outline so it still reads as the golden control but clearly off.
function optThemeApplyGoldenToggle(btn, isOn) {
   if (!btn) return;
   try {
      btn.minHeight = 32; btn.maxHeight = 32;
      if (isOn) {
         btn.styleSheet =
            "QPushButton {" +
            " background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 " + Theme.amberBright + ", stop:1 " + Theme.amber + ");" +
            " color: #15110a;" +
            " border: 1px solid " + Theme.amber + ";" +
            " border-top: 1px solid rgba(255, 255, 255, 0.25);" +
            " border-radius: " + Theme.rMd + "px;" +
            " padding-left: 16px; padding-right: 16px;" +
            " font-size: 9pt; font-weight: 700; outline: none;" +
            "}" +
            "QPushButton:hover { background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #ffc875, stop:1 #f0b865); color: #15110a; }" +
            "QPushButton:focus { outline: none; }";
      } else {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: transparent;" +
            " color: " + Theme.amber + ";" +
            " border: 1px solid " + Theme.amber + ";" +
            " border-radius: " + Theme.rMd + "px;" +
            " padding-left: 16px; padding-right: 16px;" +
            " font-size: 9pt; font-weight: 600; outline: none;" +
            "}" +
            "QPushButton:hover { background-color: rgba(255, 200, 117, 0.14); color: " + Theme.amberBright + "; }" +
            "QPushButton:focus { outline: none; }";
      }
   } catch (e) {}
}

function optThemeApplyPrimaryActionButton(btn, isApplied) {
   if (!btn) return;
   // Use this Image: two visual states (READY -> amber, APPLIED -> green).
   try {
      btn.minHeight = 30; btn.maxHeight = 30;
      if (isApplied) {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: transparent;" +
            " color: #6dbf7a;" +              // success green (text)
            " border: 1px solid #6dbf7a40;" + // success green at 25% (border)
            " border-radius: " + Theme.rMd + "px;" +
            " padding-top: 0px; padding-bottom: 0px;" +
            " padding-left: 13px; padding-right: 13px;" +
            " font-size: 9pt; font-weight: 600;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: #6dbf7a14; }" +
            "QPushButton:disabled { color: " + Theme.textDim +
            "; border-color: " + optThemeRgba("border") + "; }" +
            "QPushButton:focus { outline: none; }";
      } else {
         btn.styleSheet =
            "QPushButton {" +
            " background-color: " + Theme.amber + ";" +
            " color: #17171c;" +
            " border: 1px solid " + Theme.amberBright + ";" +
            " border-radius: " + Theme.rMd + "px;" +
            " padding-top: 0px; padding-bottom: 0px;" +
            " padding-left: 13px; padding-right: 13px;" +
            " font-size: 9pt; font-weight: 700;" +
            " outline: none;" +
            "}" +
            "QPushButton:hover { background-color: " + Theme.amberBright + "; color: #17171c; }" +
            "QPushButton:disabled {" +
            " background-color: transparent;" +
            " color: " + Theme.textDim + ";" +
            " border-color: " + optThemeRgba("border") + "; }" +
            "QPushButton:focus { outline: none; }";
      }
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< ACTION BUTTONS — Phase 4e ends here >>>
// ============================================================================


// ============================================================================
// >>> STATUS CHIPS — Phase 4f — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Styles the preview-pane status indicators per DESIGN_SPEC §2.13:
//   - Path chips: the [R+G+B], [H+O+S], [RGB], etc. workflow-key buttons
//     that appear above the memory bank to show which canonical path is
//     active. Rendered as fully-rounded amber pills (radius 999, bg
//     amberSoft, border amberRing, amber mono text).
//   - Status label: the "Current: ... | Preview: ..." rich-text line under
//     the action button row. Theme-coloured but keeps the rich-text body
//     intact (every callsite that re-renders this label keeps working).
// To revert: delete this block and restore the OPT_CSS_MODE_OFF / OPT_CSS_*
// styleSheet assignments on this.pathButtons[*] and this.status.
// ============================================================================

function optThemeApplyPathChip(btn, state) {
   if (!btn) return;
   // state is one of:
   //   "active" — current path (amber-filled pill)
   //   "done"   — visible path that has been processed (neutral surface pill)
   //   "off"    — visible path with no work yet (transparent ghost pill)
   var s = state || "off";
   try {
      btn.minHeight = 26; btn.maxHeight = 26;
      var bg, color, border, weight, hoverBg;
      if (s === "active") {
         bg     = optThemeRgba("amberSoft");
         color  = Theme.amber;
         border = optThemeRgba("amberRing");
         weight = "700";
         hoverBg = optThemeRgba("amberSoft");
      } else if (s === "done") {
         bg     = Theme.surfaceRaised;
         color  = Theme.text;
         border = optThemeRgba("border");
         weight = "500";
         hoverBg = Theme.surfaceHover;
      } else {
         bg     = "transparent";
         color  = Theme.textDim;
         border = optThemeRgba("border");
         weight = "500";
         hoverBg = optThemeRgba("borderStrong");
      }
      btn.styleSheet =
         "QPushButton {" +
         " background-color: " + bg + ";" +
         " color: " + color + ";" +
         " border: 1px solid " + border + ";" +
         " border-radius: 13px;" +
         " padding-top: 0px; padding-bottom: 0px;" +
         " padding-left: 11px; padding-right: 11px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: " + weight + ";" +
         " outline: none;" +
         "}" +
         "QPushButton:hover { background-color: " + hoverBg + "; }" +
         "QPushButton:focus { outline: none; }";
   } catch (e) {}
}

function optThemeApplyStatusLabel(label) {
   if (!label) return;
   try {
      label.wordWrap = true;
      label.styleSheet =
         "QLabel {" +
         " color: " + Theme.textMuted + ";" +
         " background-color: transparent; border: 0px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt;" +
         " padding-top: 4px; padding-bottom: 4px;" +
         "}";
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< STATUS CHIPS — Phase 4f ends here >>>
// ============================================================================


// ============================================================================
// >>> ZOOM CONTROLS — Phase 4g — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Styles the Zoom and Preview-Resolution controls in the preview toolbar
// per DESIGN_SPEC §2.14. Each becomes a "mini-card":
//
//   ┌─────────────────────────┐
//   │ ZOOM   [Fit  ▾]         │
//   └─────────────────────────┘
//
// - container Control: Theme.bg bg, hairline border, rMd radius, 3 px pad
// - label inside the container: tLabel-ish (mono 8pt, textMuted, uppercase)
// - selector: surfaceRaised bg, rXs radius, 22 px tall, mono 9pt
//
// Three helpers in a dedicated MINI-CARD block reusable for any other
// future mini-card. To revert: delete this block and restore the old
// optLabel(...) + ComboBox additions to the toolRow sizer.
// ============================================================================

function optThemeApplyMiniCardContainer(widget) {
   if (!widget) return;
   try {
      widget.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.bg + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rMd + "px;" +
         "}";
   } catch (e) {}
}

function optThemeApplyMiniCardLabel(label) {
   if (!label) return;
   try {
      label.styleSheet =
         "QLabel {" +
         " color: " + Theme.textMuted + ";" +
         " background-color: transparent; border: 0px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 8pt; font-weight: 600;" +
         " padding-left: 6px; padding-right: 4px;" +
         "}";
      label.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   } catch (e) {}
}

function optThemeApplyMiniCardCombo(combo) {
   if (!combo) return;
   try {
      combo.minHeight = 22; combo.maxHeight = 22;
      combo.styleSheet =
         "QComboBox {" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rXs + "px;" +
         " padding-left: 10px; padding-right: 4px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: 500;" +
         " outline: none;" +
         "}" +
         "QComboBox:hover { background-color: " + Theme.surfaceHover + "; }" +
         "QComboBox::drop-down { border: 0px; width: 16px; }" +
         "QComboBox QAbstractItemView {" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " selection-background-color: " + optThemeRgba("amberSoft") + ";" +
         " selection-color: " + Theme.amber + ";" +
         "}";
   } catch (e) {}
}

// Convenience: build a mini-card Control containing the supplied label text
// and combo. The combo is created by the caller (so its onItemSelected and
// items remain external) but is reparented into the card and themed here.
function optThemeBuildMiniCard(parent, labelText, combo) {
   var card = new Control(parent);
   optThemeApplyMiniCardContainer(card);
   card.sizer = new HorizontalSizer();
   card.sizer.margin = 3;
   card.sizer.spacing = 4;
   var label = new Label(card);
   label.text = labelText;
   optThemeApplyMiniCardLabel(label);
   card.sizer.add(label);
   if (combo) {
      optThemeApplyMiniCardCombo(combo);
      card.sizer.add(combo);
   }
   card.label = label;
   card.combo = combo;
   return card;
}
// ----------------------------------------------------------------------------
// <<< ZOOM CONTROLS — Phase 4g ends here >>>
// ============================================================================


// ============================================================================
// >>> PRIMARY CTA — Phase 4h — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Styles the panel-footer "Continue" buttons ("To Stretching",
// "To Post Processing") per DESIGN_SPEC §2.15:
//
//   +------------------------------------------+
//   |  Continue to Stretching            ->    |   40 px tall, 100% wide
//   +------------------------------------------+
//
// - bg: linear vertical gradient amberBright -> amber.
// - text: #15110a (warm black) weight 700.
// - border-radius: rLg (10).
// - top inner highlight: 1 px white at 25% (simulates bevel).
// - Qt CSS supports `qlineargradient(...)` for gradient bg.
//
// To revert: delete this block and restore optPrimaryButton(...) calls.
// ============================================================================

// Compact CTA used by in-module action buttons (e.g. "Apply Noise
// Reduction", "Apply Sharpening"). Same gradient as the full CTA but
// 32 px tall instead of 40 — per DESIGN_SPEC §10.4, module CTAs sit
// inside the section body so they should be a touch less heavy than
// the "Continue to Stretching" tab-footer CTA.
function optThemeApplyModuleCta(btn) {
   if (!btn) return;
   try {
      btn.minHeight = 32; btn.maxHeight = 32;
      btn.styleSheet =
         "QPushButton {" +
         " background-color: " + Theme.amber + ";" +
         " background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 " +
            Theme.amberBright + ", stop:1 " + Theme.amber + ");" +
         " color: #15110a;" +
         " border: 1px solid " + Theme.amber + ";" +
         " border-top: 1px solid rgba(255, 255, 255, 0.22);" +
         " border-radius: " + Theme.rMd + "px;" +
         " padding-top: 0px; padding-bottom: 0px;" +
         " padding-left: 12px; padding-right: 12px;" +
         " font-size: 9pt; font-weight: 700;" +
         " outline: none;" +
         "}" +
         "QPushButton:hover {" +
         " background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #ffc875, stop:1 #f0b865);" +
         " color: #15110a;" +
         "}" +
         "QPushButton:pressed { background: " + Theme.amber + "; }" +
         "QPushButton:disabled {" +
         " background: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.textDim + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         "}" +
         "QPushButton:focus { outline: none; }";
   } catch (e) {}
}

function optThemeApplyPrimaryCta(btn) {
   if (!btn) return;
   try {
      btn.minHeight = 40; btn.maxHeight = 40;
      btn.styleSheet =
         "QPushButton {" +
         " background-color: " + Theme.amber + ";" +
         " background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 " +
            Theme.amberBright + ", stop:1 " + Theme.amber + ");" +
         " color: #15110a;" +
         " border: 1px solid " + Theme.amber + ";" +
         " border-top: 1px solid rgba(255, 255, 255, 0.25);" +
         " border-radius: " + Theme.rLg + "px;" +
         " padding-top: 0px; padding-bottom: 0px;" +
         " padding-left: 16px; padding-right: 16px;" +
         " font-size: 10pt; font-weight: 700;" +
         " outline: none;" +
         "}" +
         "QPushButton:hover {" +
         " background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #ffc875, stop:1 #f0b865);" +
         " color: #15110a;" +
         "}" +
         "QPushButton:pressed {" +
         " background: " + Theme.amber + ";" +
         " color: #15110a;" +
         "}" +
         "QPushButton:disabled {" +
         " background: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.textDim + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         "}" +
         "QPushButton:focus { outline: none; }";
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< PRIMARY CTA — Phase 4h ends here >>>
// ============================================================================


// ============================================================================
// >>> SLIDER + NUMERIC — Phase 5 base — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Reusable theming helpers for the expanded-module body contents per
// DESIGN_SPEC §2.10 / §2.10.b. PJSR ships NumericControl (Label + Slider +
// Edit in one row); the spec explicitly tells us to re-style it instead of
// rebuilding from scratch, so this block produces the Qt styleSheets that
// turn the native widget into the new visual:
//
//   - Label (left): tBody, colour text. (Optional: replaced by a stacked
//     "label above + chip on the right" layout via optThemeBuildSliderRow.)
//   - Track (groove): 3 px tall, bg borderStrong, fully rounded.
//   - Fill (sub-page): amber, same radius.
//   - Thumb (handle): 10x10 circle, amber, soft outer halo via box-shadow
//     emulated with `border: 2px solid bg` to separate it from the track.
//   - Numeric edit: surfaceRaised chip, hairline border, rXs radius, mono.
//
// To revert: delete this block and stop calling the helpers; PJSR will
// reinstate the native NumericControl appearance.
// ============================================================================

function optThemeApplySliderStyle(slider) {
   if (!slider) return;
   try {
      slider.styleSheet =
         "QSlider {" +
         " background-color: transparent;" +
         " min-height: 18px; max-height: 18px;" +
         "}" +
         "QSlider::groove:horizontal {" +
         " background: " + optThemeRgba("borderStrong") + ";" +
         " height: 3px; border-radius: 2px;" +
         "}" +
         "QSlider::sub-page:horizontal {" +
         " background: " + Theme.amber + ";" +
         " height: 3px; border-radius: 2px;" +
         "}" +
         "QSlider::add-page:horizontal {" +
         " background: " + optThemeRgba("borderStrong") + ";" +
         " height: 3px; border-radius: 2px;" +
         "}" +
         "QSlider::handle:horizontal {" +
         " background: " + Theme.amber + ";" +
         " border: 2px solid " + Theme.surface + ";" +
         " width: 10px; height: 10px;" +
         " margin-top: -6px; margin-bottom: -6px;" +
         " border-radius: 7px;" +
         "}" +
         "QSlider::handle:horizontal:hover {" +
         " background: " + Theme.amberBright + ";" +
         "}";
   } catch (e) {}
}

function optThemeApplyNumericEdit(edit) {
   if (!edit) return;
   try {
      edit.minHeight = 22; edit.maxHeight = 22;
      edit.styleSheet =
         "QLineEdit, QSpinBox, QDoubleSpinBox {" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " color: " + Theme.text + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: " + Theme.rXs + "px;" +
         " padding-left: 6px; padding-right: 6px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: 600;" +
         " selection-background-color: " + optThemeRgba("amberSoft") + ";" +
         " selection-color: " + Theme.amber + ";" +
         "}" +
         "QLineEdit:focus, QSpinBox:focus, QDoubleSpinBox:focus {" +
         " border: 1px solid " + optThemeRgba("amberRing") + ";" +
         "}" +
         "QSpinBox::up-button, QSpinBox::down-button," +
         "QDoubleSpinBox::up-button, QDoubleSpinBox::down-button {" +
         " width: 0px; height: 0px; border: 0px; background: transparent;" +
         "}";
   } catch (e) {}
}

function optThemeApplyNumericLabel(label) {
   if (!label) return;
   try {
      label.styleSheet =
         "QLabel {" +
         " color: " + Theme.text + ";" +
         " background-color: transparent; border: 0px;" +
         " font-size: 9pt; font-weight: 500;" +
         "}";
      // Phase 6: left-align so that when a long label gets clipped by the
      // 80 px cap, the user sees the START of the word (e.g. "Shadows c…")
      // instead of just the tail ("…s clipping"). Right-aligned labels were
      // hiding the most informative part of the text.
      label.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   } catch (e) {}
}

// Apply the full theme to a PJSR NumericControl in-place. NumericControl
// exposes .label / .slider / .edit (or sometimes .numericEdit) sub-widgets;
// we apply the appropriate helper to each. Safe to call multiple times.
// `in` is used (instead of bare property access) so the PJSR strict engine
// does not emit Warning 162 when the optional .numericEdit sub-widget is
// not present on this build's NumericControl.
function optThemeApplyNumericControl(nc) {
   if (!nc) return;
   try { if ("label" in nc) optThemeApplyNumericLabel(nc.label); } catch (eL) {}
   try { if ("slider" in nc) optThemeApplySliderStyle(nc.slider); } catch (eS) {}
   try { if ("edit" in nc) optThemeApplyNumericEdit(nc.edit); } catch (eE0) {}
   try { if ("numericEdit" in nc) optThemeApplyNumericEdit(nc.numericEdit); } catch (eE1) {}
}

// Apply the full theme to a bare PJSR HorizontalSlider (no NumericControl
// wrapper). Useful for module bodies that use a standalone Slider.
function optThemeApplyHorizontalSlider(slider) {
   optThemeApplySliderStyle(slider);
}
// ----------------------------------------------------------------------------
// <<< SLIDER + NUMERIC — Phase 5 base ends here >>>
// ============================================================================


// ============================================================================
// >>> SUBCARDS + MODULE BODY — Phase 5 base — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Reusable helpers for the EXPANDED module body containers (§2.10.b). Every
// module with 5+ controls or with clear logical sub-groups (Deconvolution
// has Stars/Nonstellar/Output, Noise Reduction has Basic/Color/Frequency,
// etc.) wraps its controls in "subcards" inside the body.
//
//   ╭ Module expanded body (bg = Theme.bg, padding 4/12/12) ──╮
//   │ ┌ Subcard: Stars (bg surface, radio 9, padding 10/12) ┐ │
//   │ │ slider 1                                            │ │
//   │ │ slider 2                                            │ │
//   │ └─────────────────────────────────────────────────────┘ │
//   │ ┌ Subcard: Nonstellar                                 ┐ │
//   │ │ ...                                                 │ │
//   │ └─────────────────────────────────────────────────────┘ │
//   ╰─────────────────────────────────────────────────────────╯
//
// Spec details:
//   - subcard bg `surface` (lifts off the module body bg `bg`).
//   - subcard border `border` (NOT amberRing — that's reserved for the
//     module container itself).
//   - subcard radius 9 (one less than the module's rLg 10).
//   - subhead: tLabel uppercase, textMuted.
// ============================================================================

function optThemeApplyModuleBody(widget) {
   // The body container of an expanded module. Now amber-tinted (very low
   // alpha on amber) with a soft amber-ring border so the module reads as a
   // clearly delimited "active workspace" instead of blending into the
   // surrounding panel. Subcards inside still use Theme.surface and therefore
   // continue to read as elevated on top of this tinted bg.
   if (!widget) return;
   try {
      widget.styleSheet =
         "QWidget {" +
         " background-color: rgba(224, 168, 90, 0.06);" +    // ~6 % amber
         " border: 1px solid " + optThemeRgba("amberRing") + ";" +
         " border-radius: " + Theme.rLg + "px;" +
         "}";
   } catch (e) {}
}

function optThemeApplySubcard(widget) {
   if (!widget) return;
   try {
      widget.styleSheet =
         "QWidget {" +
         " background-color: " + Theme.surface + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: 9px;" +
         "}";
   } catch (e) {}
}

function optThemeApplySubcardHeader(label) {
   if (!label) return;
   try {
      label.styleSheet =
         "QLabel {" +
         " color: " + Theme.textMuted + ";" +
         " background-color: transparent; border: 0px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 8pt; font-weight: 700;" +
         "}";
      label.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   } catch (e) {}
}

// Convenience builder: returns { card, body } where card is the Frame
// wrapping the subcard styling and body is the inner VerticalSizer-hosting
// Control where callers add their slider rows etc.
function optThemeBuildSubcard(parent, headerText) {
   var card = new Control(parent);
   optThemeApplySubcard(card);
   card.sizer = new VerticalSizer();
   card.sizer.margin = 8;             // tight padding to fit the 300 px card
   card.sizer.spacing = Theme.s2;     // 8 px between header and rows
   if (headerText) {
      var header = new Label(card);
      optI18nLabelUpper(header, String(headerText));
      optThemeApplySubcardHeader(header);
      card.sizer.add(header);
   }
   return card;
}

// Apply the spec's checkbox styling so toggles inside module bodies match
// the surrounding controls (currently PJSR's default CheckBox is too plain).
function optThemeApplyCheckBox(cb) {
   if (!cb) return;
   try {
      cb.styleSheet =
         "QCheckBox {" +
         " color: " + Theme.text + ";" +
         " background-color: transparent;" +
         " spacing: 8px;" +
         " font-size: 9pt; font-weight: 500;" +
         "}" +
         "QCheckBox::indicator {" +
         " width: 14px; height: 14px;" +
         " background-color: " + Theme.surfaceRaised + ";" +
         " border: 1px solid " + optThemeRgba("border") + ";" +
         " border-radius: 3px;" +
         "}" +
         "QCheckBox::indicator:hover {" +
         " border: 1px solid " + optThemeRgba("amberRing") + ";" +
         "}" +
         "QCheckBox::indicator:checked {" +
         " background-color: " + Theme.amber + ";" +
         " border: 1px solid " + Theme.amber + ";" +
         "}";
   } catch (e) {}
}
// ----------------------------------------------------------------------------
// <<< SUBCARDS + MODULE BODY — Phase 5 base ends here >>>
// ============================================================================


// ============================================================================
// >>> STATUS BOX — Phase 5 base — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Status indicator pill used by modules that follow the Status + Action
// pattern (Plate Solving, eventually MGC progress, etc.). Per DESIGN_SPEC
// §2.10, status lines pair a coloured dot with mono text. We render the
// whole thing as a single styled Label that flips colour family between
// pending (amber), ok (green) and error (red) states.
// ============================================================================

function optThemeApplyStatusBox(label, state) {
   if (!label) return;
   var color, bg, ring;
   if (state === "ok") {
      color = "#6dbf7a";
      bg    = "rgba(109, 191, 122, 0.10)";
      ring  = "rgba(109, 191, 122, 0.30)";
   } else if (state === "error") {
      color = "#e36a6a";
      bg    = "rgba(227, 106, 106, 0.10)";
      ring  = "rgba(227, 106, 106, 0.30)";
   } else {
      // "pending" / default
      color = Theme.amber;
      bg    = optThemeRgba("amberSoft");
      ring  = optThemeRgba("amberRing");
   }
   try {
      label.styleSheet =
         "QLabel {" +
         " color: " + color + ";" +
         " background-color: " + bg + ";" +
         " border: 1px solid " + ring + ";" +
         " border-radius: " + Theme.rMd + "px;" +
         " padding-top: 6px; padding-bottom: 6px;" +
         " padding-left: 10px; padding-right: 10px;" +
         " font-family: " + Theme.fontMono + ";" +
         " font-size: 9pt; font-weight: 600;" +
         "}";
   } catch (e) {}
}

// One-shot: set the text and the state colour family in a single call.
// The text is set as plain mono — no inline <b style='color:...'> spans
// needed any more; the styleSheet carries every visual decision.
function optThemeSetStatus(label, text, state) {
   if (!label) return;
   try { label.useRichText = false; } catch (eR) {}
   try { label.text = text; } catch (e) {}
   optThemeApplyStatusBox(label, state);
}
// ----------------------------------------------------------------------------
// <<< STATUS BOX — Phase 5 base ends here >>>
// ============================================================================


// ============================================================================
// >>> ACTION CARD — Phase 5 base — easy-rollback block <<<
// ----------------------------------------------------------------------------
// Big clickable card used by the Action-only module pattern (DESIGN_SPEC
// §10.3). Color Calibration is the canonical user of this: the body shows
// three cards (SPCC, Auto Linear Fit, Background Neutralization), one of
// them marked as the primary recommendation with an amber background and
// a "BEST" badge.
//
// Layout per card:
//
//   ┌────────────────────────────────────────────────┐
//   │  [I]  Title                          [BADGE] › │
//   │       hint mono                                │
//   └────────────────────────────────────────────────┘
//
// opts = { title, hint, toolTip, isPrimary, badge, iconLetter, onClick }
// ============================================================================

function optThemeBuildActionCard(parent, opts) {
   opts = opts || {};
   // `in` avoids PJSR strict Warning 162 when the caller passes opts
   // without the optional `isPrimary` key.
   var isPrimary = ("isPrimary" in opts) && opts.isPrimary === true;
   var card = new Frame(parent);
   try {
      card.styleSheet =
         "QFrame {" +
         (isPrimary
            ? " background-color: " + optThemeRgba("amberSoft") + ";" +
              " border: 1px solid " + optThemeRgba("amberRing") + ";"
            : " background-color: " + Theme.surface + ";" +
              " border: 1px solid " + optThemeRgba("border") + ";") +
         " border-radius: " + Theme.rLg + "px;" +
         "}";
   } catch (e) {}
   card.sizer = new HorizontalSizer();
   card.sizer.margin = 10;
   card.sizer.spacing = 10;
   if (opts.toolTip) {
      optApplyTooltip(card, opts.toolTip);
   }

   // Square icon box (28×28).
   var iconBox = new Control(card);
   try {
      iconBox.minWidth = 28; iconBox.maxWidth = 28;
      iconBox.minHeight = 28; iconBox.maxHeight = 28;
      iconBox.styleSheet =
         "QWidget {" +
         (isPrimary
            ? " background-color: " + Theme.amber + ";"
            : " background-color: " + Theme.surfaceRaised + ";") +
         " border: 0px;" +
         " border-radius: 7px;" +
         "}";
   } catch (eIb) {}
   iconBox.sizer = new VerticalSizer();
   iconBox.sizer.margin = 0;
   if (opts.toolTip) {
      optApplyTooltip(iconBox, opts.toolTip);
   }
   if (opts.iconLetter) {
      var iconLbl = new Label(iconBox);
      iconLbl.text = String(opts.iconLetter);
      iconLbl.textAlignment = TextAlign_Center | TextAlign_VertCenter;
      try {
         iconLbl.styleSheet =
            "QLabel {" +
            (isPrimary
               ? " color: #15110a;"
               : " color: " + Theme.amber + ";") +
            " background-color: transparent; border: 0px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 11pt; font-weight: 800;" +
            "}";
      } catch (eIl) {}
      iconBox.sizer.add(iconLbl, 100);
      if (opts.toolTip) {
         optApplyTooltip(iconLbl, opts.toolTip);
      }
   }
   card.sizer.add(iconBox);

   // Title + hint vertical stack.
   var stack = new Control(card);
   try { stack.styleSheet = "QWidget { background-color: transparent; border: 0px; }"; } catch (eS) {}
   stack.sizer = new VerticalSizer();
   stack.sizer.margin = 0;
   if (opts.toolTip) {
      optApplyTooltip(stack, opts.toolTip);
   }
   stack.sizer.spacing = 2;

   var titleLbl = new Label(stack);
   titleLbl.text = opts.title || "";
   titleLbl.textAlignment = TextAlign_Left | TextAlign_VertCenter;
   if (opts.toolTip) {
      optApplyTooltip(titleLbl, opts.toolTip);
   }
   try {
      titleLbl.styleSheet =
         "QLabel {" +
         " color: " + (isPrimary ? Theme.amber : Theme.text) + ";" +
         " background-color: transparent; border: 0px;" +
         " font-size: 10pt; font-weight: 600;" +
         "}";
   } catch (eT) {}
   stack.sizer.add(titleLbl);

   if (opts.hint) {
      var hintLbl = new Label(stack);
      hintLbl.text = opts.hint;
      hintLbl.textAlignment = TextAlign_Left | TextAlign_VertCenter;
      if (opts.toolTip) {
         optApplyTooltip(hintLbl, opts.toolTip);
      }
      hintLbl.wordWrapping = true;
      try {
         hintLbl.styleSheet =
            "QLabel {" +
            " color: " + Theme.textDim + ";" +
            " background-color: transparent; border: 0px;" +
            " font-family: " + Theme.fontUI + ";" +
            " font-size: 8pt;" +
            "}";
      } catch (eH) {}
      stack.sizer.add(hintLbl);
   }
   card.sizer.add(stack, 100);

   // Optional pill badge ("BEST", "FAST", etc.).
   if (opts.badge) {
      var badge = new Label(card);
      badge.text = String(opts.badge);
      try {
         badge.styleSheet =
            "QLabel {" +
            " background-color: " + Theme.amber + ";" +
            " color: #15110a;" +
            " border-radius: 8px;" +
            " padding-top: 1px; padding-bottom: 1px;" +
            " padding-left: 7px; padding-right: 7px;" +
            " font-family: " + Theme.fontMono + ";" +
            " font-size: 7pt; font-weight: 800;" +
            "}";
      } catch (eB) {}
      card.sizer.add(badge);
   }

   // Chevron.
   var chevron = new Label(card);
   chevron.text = "›";
   chevron.textAlignment = TextAlign_Right | TextAlign_VertCenter;
   try {
      chevron.styleSheet =
         "QLabel {" +
         " color: " + Theme.textDim + ";" +
         " background-color: transparent; border: 0px;" +
         " font-size: 14pt;" +
         "}";
      chevron.minWidth = 12; chevron.maxWidth = 12;
   } catch (eC) {}
   card.sizer.add(chevron);

   try { card.cursor = new Cursor(StdCursor_PointingHand); } catch (eCur) {}

   // BUGFIX-SPCC-PROPAGATION-BEGIN
   if (typeof opts.onClick === "function") {
      var isClicking = false;
      var fire = function() {
         if (card.enabled === false) return;
         if (isClicking) return;
         isClicking = true;
         try {
            opts.onClick();
         } finally {
            if (typeof Timer !== "undefined") {
               var t = new Timer();
               t.singleShot = true;
               t.interval = 0.05; // 50ms
               t.onTimeout = function() {
                  isClicking = false;
                  t.stop();
               };
               t.start();
            } else {
               isClicking = false;
            }
         }
      };
      card.onMousePress = fire;
      try { iconBox.onMousePress  = fire; } catch (e1) {}
      try { stack.onMousePress    = fire; } catch (e2) {}
      try { titleLbl.onMousePress = fire; } catch (e3) {}
      try { chevron.onMousePress  = fire; } catch (e4) {}
   }
   // BUGFIX-SPCC-PROPAGATION-END

   return card;
}
// ----------------------------------------------------------------------------
// <<< ACTION CARD — Phase 5 base ends here >>>
// ============================================================================

