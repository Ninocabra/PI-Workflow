// ===== ANNOTATIONS-UI-BEGIN (feature #13: pestaña "Anotaciones") =====
// La pestaña Anotaciones es una OptWorkflowTab COMPLETA (construida en
// dialog_chrome.js): hereda de forma nativa el panel "Selección de Imágenes",
// los slots de memoria, la barra de imágenes disponibles y el preview, igual que
// las demás pestañas. Aquí solo se AÑADE la lógica de anotación:
//   - secciones propias (Objetos del catálogo / Estrellas / Mapa y export) via
//     addProcessSection sobre tab.leftContent.
//   - el overlay (markers + etiquetas + estrellas) se pinta con el hook
//     preview.preview.onOverlayPaint(g, scale, scrollX, scrollY), respetando el
//     zoom/pan nativo del preview. La imagen anotada = preview.currentView (la que
//     el usuario elige con Selección de Imágenes / slots de memoria).
//   - el mapa Aladin (v2, canvas 2D) se embebe en el previewCard, apilado con el
//     preview (toggle).
// Motor: engine/annotations.js. Gated por OPT_ANNOTATIONS_ENABLED.

// Auto-stretch (STF) sobre un clon, solo para la EXPORTACION a PNG/JPEG (el preview
// en vivo ya muestra la imagen estirada por el flujo). No toca la vista original.
function optAnnMtf(m, x) {
   if (x <= 0) return 0; if (x >= 1) return 1;
   if (Math.abs(x - m) < 1e-9) return 0.5;
   return ((m - 1) * x) / (((2 * m - 1) * x) - m);
}
function optAnnRenderStretched(view) {
   var img = view.image, w = img.width, h = img.height, n = img.numberOfChannels, tmp = null;
   try {
      tmp = new ImageWindow(w, h, n, 32, true, img.isColor, "ann_tmp_" + Math.floor(Math.random() * 1e6));
      tmp.mainView.beginProcess(UndoFlag_NoSwapFile);
      tmp.mainView.image.assign(img);
      tmp.mainView.endProcess();
      var ti = tmp.mainView.image, sc = -2.8, tb = 0.25, rows = [];
      for (var c = 0; c < n; ++c) {
         ti.firstSelectedChannel = c; ti.lastSelectedChannel = c;
         var med = ti.median(), dev = ti.avgDev();
         var c0 = Math.max(0, Math.min(1, med + sc * dev));
         rows.push([c0, optAnnMtf(tb, med - c0), 1, 0, 1]);
      }
      ti.resetSelections();
      var H = new HistogramTransformation;
      if (n >= 3) H.H = [rows[0], rows[1], rows[2], [0, 0.5, 1, 0, 1], [0, 0.5, 1, 0, 1]];
      else        H.H = [[0, 0.5, 1, 0, 1], [0, 0.5, 1, 0, 1], [0, 0.5, 1, 0, 1], rows[0], [0, 0.5, 1, 0, 1]];
      H.executeOn(tmp.mainView, false);
      var bmp = tmp.mainView.image.render();
      tmp.forceClose(); tmp = null;
      return bmp;
   } catch (e) {
      try { console.warningln("Annotations: auto-stretch fallo, render lineal — " + e); } catch (e0) {}
      try { if (tmp) tmp.forceClose(); } catch (e1) {}
      return view.image.render();
   }
}

// Genera el HTML de Aladin Lite v2 (canvas 2D, sin WebGL) centrado en el campo,
// con el footprint (4 esquinas) dibujado. Placeholders por .replace().
function optAnnSkyMapHTML(center, corners, fovDeg) {
   var poly = "[";
   for (var i = 0; i < corners.length; ++i)
      poly += (i ? "," : "") + "[" + corners[i].x.toFixed(6) + "," + corners[i].y.toFixed(6) + "]";
   poly += "]";
   var target = center.x.toFixed(6) + " " + center.y.toFixed(6);
   var html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://aladin.cds.unistra.fr/AladinLite/api/v2/latest/aladin.min.css">
<style> html,body{ margin:0; padding:0; height:100%; background:#000; }
  #aladin-lite-div{ width:100%; height:100vh; }
  #err{ color:#e06d6d; font-family:Consolas,monospace; padding:10px; } </style>
</head><body>
<div id="aladin-lite-div"></div><div id="err"></div>
<script>
  function piwSkyInit(){
    try {
      var aladin = A.aladin('#aladin-lite-div', {
        survey:'P/DSS2/color', fov:__FOV__, target:'__TARGET__',
        showReticle:false, showZoomControl:true, showFullscreenControl:true,
        showLayersControl:true, showGotoControl:true, showFrame:true, showCooGrid:false
      });
      var ov = A.graphicOverlay({ color:'#ffc850', lineWidth:2 });
      aladin.addOverlay(ov); ov.add(A.polygon(__POLY__));
    } catch(e){ document.getElementById('err').textContent = 'Aladin error: ' + e; }
  }
</script>
<script src="https://code.jquery.com/jquery-1.12.4.min.js"></script>
<script src="https://aladin.cds.unistra.fr/AladinLite/api/v2/latest/aladin.min.js"
   onload="piwSkyInit();"
   onerror="document.getElementById('err').textContent='No pude cargar Aladin (sin red o CDN bloqueado).';"></script>
</body></html>`;
   return html.split("__FOV__").join(fovDeg.toFixed(4))
              .split("__TARGET__").join(target)
              .split("__POLY__").join(poly);
}

// ============================================================================
// configureAnnotTab: añade la lógica de anotación a la OptWorkflowTab annotTab.
// ============================================================================
PIWorkflowOptDialog.prototype.configureAnnotTab = function () {
   var self = this;
   var tab = this.annotTab;          // OptWorkflowTab (con Image Selection + memoria + preview)
   var preview = tab.preview;        // OptPreviewPane
   var pv = preview.preview;         // OptPreviewControl (bitmap + zoom/pan + onOverlayPaint)

   var st = { objects: [], stars: [], showStars: false, showRealColor: false, starsLoaded: false,
              magLimit: 99, active: {}, subActive: {}, selected: "", win: null, mapMode: false, __combo: [] };
   for (var i = 0; i < OPT_ANN_CATEGORIES.length; ++i) {
      st.active[OPT_ANN_CATEGORIES[i]] = true;
      var sst = OPT_ANN_SUBTYPES[OPT_ANN_CATEGORIES[i]] || [];
      if (sst.length > 1) { st.subActive[OPT_ANN_CATEGORIES[i]] = {}; for (var sj = 0; sj < sst.length; ++sj) st.subActive[OPT_ANN_CATEGORIES[i]][sst[sj]] = true; }
   }

   // Controles asignados dentro de los build callbacks (los handlers los cierran).
   var status = null, depthLabel = null, objCombo = null, starStatus = null, btnSky = null, web = null;

   function repaint() { try { pv.viewport.repaint(); } catch (e) { try { pv.repaint(); } catch (e2) {} } }

   // --- Dibujo del overlay (estrellas + markers DSO + etiquetas + leyenda) sobre
   // un Graphics ya posicionado: `disp` = factor imagen->salida, offset (offX,offY).
   function paintOverlay(g, disp, offX, offY) {
      var f = new Font("Verdana"); try { f.pixelSize = 12; } catch (eF) {}
      g.font = f;
      g.brush = new Brush(0x00000000);
      // Estrellas (Gaia): circulos cian de tamaño constante en pantalla.
      if (st.showStars && st.stars.length) {
         for (var si = 0; si < st.stars.length; ++si) {
            var s = st.stars[si];
            if (st.magLimit < 99 && (s.mag == null || s.mag > st.magLimit)) continue;
            var sx = s.ix * disp + offX, sy = s.iy * disp + offY;
            var rr = Math.max(3.5, 9 - (s.mag == null ? 12 : s.mag) * 0.35);
            g.pen = new Pen(st.showRealColor ? s.color : 0xff00e0ff, 1.8);
            g.drawEllipse(sx - rr, sy - rr, sx + rr, sy + rr);
         }
      }
      // DSO: filtro (magnitud + categorias) y coords de salida.
      var vis = [];
      for (var i = 0; i < st.objects.length; ++i) {
         var o = st.objects[i];
         if (!st.active[o.cat]) continue;
         if (!optAnnSubtypeActive(o, st.subActive)) continue;
         if (st.magLimit < 99 && (o.mag == null || o.mag > st.magLimit)) continue;
         o.cx = o.ix * disp + offX; o.cy = o.iy * disp + offY;
         o.aC = (o.aPx || 0) * disp; o.bC = (o.bPx || 0) * disp;
         vis.push(o);
      }
      // markers: elipse (poligono orientado por el eje mayor) o circulo pequeño.
      for (var m = 0; m < vis.length; ++m) {
         var v = vis[m], col = OPT_ANN_CATCOLOR[v.cat] || 0xffa0a0a0;
         var sel = (v.name === st.selected);
         g.pen = new Pen(sel ? 0xffffffff : col, sel ? 2.5 : 1.5);
         if (v.aC >= 5) {
            var a = v.aC, b = Math.max(2, v.bC), mx = v.mux, my = v.muy, nx = -v.muy, ny = v.mux;
            var NSEG = 48, prevX = 0, prevY = 0;
            for (var t = 0; t <= NSEG; ++t) {
               var ang = 2 * Math.PI * t / NSEG, ex = a * Math.cos(ang), ey = b * Math.sin(ang);
               var X = v.cx + ex * mx + ey * nx, Y = v.cy + ex * my + ey * ny;
               if (t > 0) g.drawLine(prevX, prevY, X, Y);
               prevX = X; prevY = Y;
            }
         } else {
            var rad = sel ? 8 : 5;
            g.drawEllipse(v.cx - rad, v.cy - rad, v.cx + rad, v.cy + rad);
         }
      }
      // etiquetas: ancla a la PUNTA del eje mayor (sigue la orientacion -> queda
      // pegada al borde de la elipse, no lejos como al usar cx + semieje recto).
      for (var q = 0; q < vis.length; ++q) {
         var vq = vis[q];
         if (vq.aC >= 5) {
            var ldir = (vq.mux >= 0) ? 1 : -1;        // punta que apunta a la derecha
            vq.px = vq.cx + ldir * vq.aC * vq.mux + 4;
            vq.py = vq.cy + ldir * vq.aC * vq.muy - 7;
         } else {                                     // marcador circular pequeño
            vq.px = vq.cx + Math.max(8, vq.aC + 4);
            vq.py = vq.cy - 7;
         }
      }
      var labeled = optAnnDeclutterLabels(vis, { cap: 60, offsetX: 0, offsetY: 0,
         measure: function (t) { try { return g.font.width(t); } catch (e2) { return t.length * 7; } } });
      for (var k = 0; k < labeled.length; ++k) {
         var L = labeled[k];
         var c2 = (L.name === st.selected) ? 0xffffffff : (OPT_ANN_CATCOLOR[L.cat] || 0xffa0a0a0);
         var lx = L.__labelRect[0], ly = L.__labelRect[1];
         g.pen = new Pen(0xdd000000, 3); g.drawText(lx + 2, ly + 12, L.label);
         g.pen = new Pen(c2, 1);          g.drawText(lx + 2, ly + 12, L.label);
      }
      // leyenda (esquina sup. izq.): categorias presentes + estrellas.
      var items = [], seen = {};
      for (var li = 0; li < vis.length; ++li)
         if (!seen[vis[li].cat]) { seen[vis[li].cat] = true; items.push({ label: optT(optAnnCatLabelEN(vis[li].cat)), color: OPT_ANN_CATCOLOR[vis[li].cat] || 0xffa0a0a0 }); }
      if (st.showStars && st.stars.length) items.push({ label: optT("Stars (Gaia)"), color: st.showRealColor ? 0xffffffff : 0xff00e0ff });
      if (items.length) {
         var lh = 17, pad = 5, wmax = 0;
         for (var iw = 0; iw < items.length; ++iw) { try { wmax = Math.max(wmax, g.font.width(items[iw].label)); } catch (eW) { wmax = Math.max(wmax, items[iw].label.length * 7); } }
         var bw = wmax + 30, bh = items.length * lh + pad;
         g.brush = new Brush(0xb0101014); g.pen = new Pen(0x50ffffff, 1);
         g.fillRect(8, 8, 8 + bw, 8 + bh); g.drawRect(8, 8, 8 + bw, 8 + bh);
         g.brush = new Brush(0x00000000);
         for (var it = 0; it < items.length; ++it) {
            var yy = 8 + pad + it * lh + lh / 2;
            g.pen = new Pen(items[it].color, 2); g.drawEllipse(14, yy - 4, 22, yy + 4);
            g.pen = new Pen(0xdd000000, 3); g.drawText(29, yy + 4, items[it].label);
            g.pen = new Pen(0xffffffff, 1);  g.drawText(29, yy + 4, items[it].label);
         }
      }
   }

   // Overlay sobre el preview nativo: imagen px -> pantalla usando el bitmap del
   // preview (posible downsample) y el zoom/scroll nativos.
   pv.onOverlayPaint = function (g, scale, scrollX, scrollY) {
      try {
         if (st.mapMode || !st.win) return;
         if (!st.objects.length && !(st.showStars && st.stars.length)) return;
         var bmp = pv.bitmap; if (!bmp) return;
         var imgW = 1; try { imgW = st.win.mainView.image.width; } catch (eImg) { imgW = bmp.width; }
         var eff = (bmp.width / (imgW || bmp.width)) * scale;
         g.antialiasing = true;
         paintOverlay(g, eff, -scrollX, -scrollY);
      } catch (e) { try { console.warningln("Annotations overlay: " + e); } catch (e0) {} }
   };

   function currentView() { return preview.candidateView || preview.currentView; }

   function analyze() { doAnalyze(null); }        // Analizar = solo catálogo local
   // doAnalyze(source): local + (si source) consulta online a ese survey/catálogo.
   function doAnalyze(source) {
      var view = currentView();
      if (!optSafeView(view)) { if (status) status.text = optT("Select/process an image first (with Image Selection)."); return; }
      var win = view.window;
      if (status) status.text = source ? (optT("Analyzing") + " " + view.id + " + " + optT("querying") + " " + source + "…") : (optT("Analyzing") + " " + view.id + "…");
      try { if (typeof CoreApplication !== "undefined" && CoreApplication.processEvents) CoreApplication.processEvents(); } catch (ePE) {}
      try {
         var q = optAnnQueryImage(win, source ? { online: true, source: source } : {});
         if (!q.ok) { if (status) status.text = optT("Could not analyze") + " (" + q.reason + ")."; return; }
         st.objects = q.objects; st.win = win; st.stars = []; st.starsLoaded = false; st.selected = "";
         if (st.mapMode && web) { optSetControlVisible(web, false); optSetControlVisible(preview.control, true); st.mapMode = false; if (btnSky) btnSky.text = optT("Sky map (Aladin)"); }
         if (objCombo) {
            objCombo.clear(); objCombo.addItem("— " + q.objects.length + " " + optT("objects") + " —");
            var sorted = q.objects.slice().sort(function (a, b) { return (a.mag == null ? 99 : a.mag) - (b.mag == null ? 99 : b.mag); });
            st.__combo = sorted;
            for (var i2 = 0; i2 < sorted.length; ++i2)
               objCombo.addItem(sorted[i2].label + "  [" + optT(optAnnCatLabelEN(sorted[i2].cat)) + (sorted[i2].mag != null ? ", m" + sorted[i2].mag.toFixed(1) : "") + "]");
         }
         var extra = (q.online > 0) ? (" · <b>+" + q.online + " " + optT("from") + " " + source + "</b>")
                   : (source ? (q.onlineError ? " · " + source + " " + optT("failed") : " · " + source + ": 0 " + optT("new")) : "");
         if (status) status.text = "<b>" + view.id + "</b> · FoV ~" + q.fovDeg.toFixed(2) + " deg · " + q.objects.length + " " + optT("DSO objects") + extra + ".";
         repaint();
      } catch (e) { if (status) status.text = optT("Analysis error:") + " " + e; try { console.criticalln("Annotations analyze: " + e); } catch (e0) {} }
   }

   function loadStars() {
      if (!st.win) { if (starStatus) starStatus.text = optT("Press <b>Analyze</b> first."); return; }
      if (starStatus) starStatus.text = optT("Querying Gaia…");
      try { CoreApplication.processEvents(); } catch (ePE) { try { processEvents(); } catch (e2) {} }
      try {
         var qs = optAnnQueryStars(st.win, { magHigh: 15, limit: 6000 });
         if (!qs.ok) { if (starStatus) starStatus.text = "Gaia: " + qs.reason + (qs.reason === "no-gaia" ? " " + optT("(install the Gaia process + DR3 database)") : ""); st.stars = []; st.starsLoaded = false; repaint(); return; }
         st.stars = qs.stars; st.starsLoaded = true;
         if (starStatus) starStatus.text = "<b>" + qs.stars.length + "</b> " + optT("stars (Gaia ≤ mag 15).");
         repaint();
      } catch (e) { if (starStatus) starStatus.text = optT("Gaia error:") + " " + e; }
   }

   function exportAnnotated() {
      var view = currentView();
      if (!optSafeView(view) || !st.win) { if (status) status.text = optT("Analyze an image first."); return; }
      try {
         var W = view.image.width, H = view.image.height;
         var esc = Math.min(1, 2400 / Math.max(W, H));
         var base = optAnnRenderStretched(view);
         var bmp = (esc < 1) ? base.scaledTo(Math.round(W * esc), Math.round(H * esc)) : base;
         var g = new Graphics(bmp);
         try { g.antialiasing = true; paintOverlay(g, esc, 0, 0); } finally { g.end(); }
         var fd = new SaveFileDialog(); fd.caption = optT("Save annotated image");
         fd.filters = [["PNG", "*.png"], ["JPEG", "*.jpg"]];
         if (!fd.execute()) return;
         var path = fd.filePath || fd.fileName;
         if (!/\.(png|jpe?g)$/i.test(path)) path += ".png";
         if (status) status.text = bmp.save(path) ? (optT("Annotated image saved:") + "<br/>" + path) : optT("Could not save.");
      } catch (e) { if (status) status.text = optT("Save error:") + " " + e; try { console.criticalln("Annotations export: " + e); } catch (e0) {} }
   }

   function toggleSky() {
      if (st.mapMode) { if (web) optSetControlVisible(web, false); optSetControlVisible(preview.control, true); st.mapMode = false; if (btnSky) btnSky.text = optT("Sky map (Aladin)"); return; }
      var view = currentView();
      if (!optSafeView(view)) { if (status) status.text = optT("Press Analyze first (I need the solved image)."); return; }
      var win = view.window, solved = false; try { solved = win.hasAstrometricSolution; } catch (e0) {}
      if (!solved) { if (status) status.text = optT("The image has no astrometric solution (WCS)."); return; }
      try {
         var W = view.image.width, H = view.image.height;
         var c = win.imageToCelestial(W / 2, H / 2);
         var corners = [win.imageToCelestial(0, 0), win.imageToCelestial(W, 0), win.imageToCelestial(W, H), win.imageToCelestial(0, H)];
         var fovDeg = optAnnAngSep(c.x, c.y, corners[0].x, corners[0].y) * 2 * 1.5;
         var htmlPath = File.systemTempDirectory + "/piw_skymap.html";
         File.writeTextFile(htmlPath, optAnnSkyMapHTML(c, corners, fovDeg));
         if (!web) { web = new WebView(tab.previewCard); web.minWidth = 400; web.minHeight = 300; tab.previewCard.sizer.add(web, 100); }
         web.loadContent(htmlPath);
         optSetControlVisible(preview.control, false); optSetControlVisible(web, true);
         st.mapMode = true; if (btnSky) btnSky.text = optT("Back to annotations");
      } catch (e) { if (status) status.text = optT("Could not open the map:") + " " + e; try { console.criticalln("Annotations sky map: " + e); } catch (e0) {} }
   }

   // WebView de Aladin apilado en el previewCard (oculto al inicio).
   web = new WebView(tab.previewCard);
   web.minWidth = 400; web.minHeight = 300;
   tab.previewCard.sizer.add(web, 100);
   optSetControlVisible(web, false);

   // ---- Secciones propias (cabeceras colapsables como el resto) ----
   // "Objetos del catálogo": profundidad + categorías + estrellas (Gaia) +
   // desplegable + estado + Analizar (CTA al final, como los botones de accion).
   tab.addProcessSection("Catalog objects", [], { build: function (body) {
      depthLabel = new Label(body); depthLabel.text = optT("Depth: all"); body.sizer.add(depthLabel);
      var depth = new Slider(body); depth.setRange(0, 200); depth.value = 200;
      try { optThemeApplySliderStyle(depth); } catch (e) {}
      depth.onValueUpdated = function (v) { st.magLimit = (v >= 200) ? 99 : (v / 10); depthLabel.text = (v >= 200) ? optT("Depth: all") : (optT("Depth: mag ≤") + " " + st.magLimit.toFixed(1)); repaint(); };
      body.sizer.add(depth);
      for (var ci = 0; ci < OPT_ANN_CATEGORIES.length; ++ci) {
         (function (cat) {
            var col = OPT_ANN_CATCOLOR[cat] || 0xffa0a0a0;
            var hex = "#" + (col & 0xffffff).toString(16).replace(/^(.{0,5})$/, function (s) { return ("000000" + s).slice(-6); });
            var subs = OPT_ANN_SUBTYPES[cat] || [];
            var hasSubs = subs.length > 1;
            // fila: [checkbox categoria] .......... [flechita ▾] (solo si >1 subtipo)
            var row = new HorizontalSizer; row.spacing = 4;
            var cb = new CheckBox(body); cb.checked = true; optI18nLabel(cb, optAnnCatLabelEN(cat));
            try { cb.styleSheet = "QCheckBox{ color:" + hex + "; }"; } catch (e) {}
            cb.onCheck = function (c) { st.active[cat] = c; repaint(); };
            row.add(cb); row.addStretch();
            var subBoxes = [], drop = null;
            if (hasSubs) {
               drop = new PushButton(body); drop.text = "▾"; drop.setFixedWidth(26);
               try { optThemeApplyActionButton(drop); } catch (e) {}
               row.add(drop);
            }
            body.sizer.add(row);
            // sub-checkboxes indentadas, ocultas hasta pulsar la flechita.
            if (hasSubs) {
               for (var si = 0; si < subs.length; ++si) {
                  (function (ty) {
                     var scb2 = new CheckBox(body);
                     scb2.text = "      • " + optT(optAnnTypeLabelEN(ty));
                     scb2.checked = true;
                     try { scb2.styleSheet = "QCheckBox{ color:" + hex + "; }"; } catch (e) {}
                     scb2.onCheck = function (c) { if (!st.subActive[cat]) st.subActive[cat] = {}; st.subActive[cat][ty] = c; repaint(); };
                     try { optSetControlVisible(scb2, false); } catch (e) { scb2.visible = false; }
                     subBoxes.push(scb2); body.sizer.add(scb2);
                  })(subs[si]);
               }
               drop.onClick = function () {
                  var show = !subBoxes[0].visible;
                  for (var b = 0; b < subBoxes.length; ++b) {
                     try { optSetControlVisible(subBoxes[b], show); } catch (e) { subBoxes[b].visible = show; }
                  }
                  drop.text = show ? "▴" : "▾";
               };
            }
         })(OPT_ANN_CATEGORIES[ci]);
      }
      // Estrellas (Gaia) dentro de Objetos del catálogo (petición usuario).
      var scb = new CheckBox(body); scb.checked = false; optI18nLabel(scb, "Stars (Gaia)");
      try { optThemeApplyCheckBox(scb); } catch (e) {}
      scb.onCheck = function (c) { st.showStars = c; if (c && !st.starsLoaded) loadStars(); else repaint(); };
      var ccb = new CheckBox(body); ccb.checked = false; optI18nLabel(ccb, "Real star colour (BP-RP)");
      try { optThemeApplyCheckBox(ccb); } catch (e) {}
      ccb.onCheck = function (c) { st.showRealColor = c; repaint(); };
      starStatus = new Label(body); starStatus.useRichText = true; starStatus.wordWrapping = true;
      body.sizer.add(scb); body.sizer.add(ccb); body.sizer.add(starStatus);
      // Surveys online: cada botón consulta un catálogo/servicio del campo de la
      // imagen y añade los DSO que NO están en el catálogo local (deduplicados).
      // Requiere red; si falla, quedan los locales. (checkbox -> botones, petición usuario)
      var srvLabel = new Label(body); optI18nLabel(srvLabel, "Search online surveys:");
      body.sizer.add(srvLabel);
      var srvRow = new HorizontalSizer; srvRow.spacing = 4;
      function addSurveyButton(text, source, tipEN) {
         var b = new PushButton(body); b.text = text;
         try { optThemeApplyActionButton(b); } catch (e) {}
         try { b.toolTip = optT(tipEN); } catch (e) {}
         b.onClick = function () { doAnalyze(source); };
         srvRow.add(b);
         return b;
      }
      addSurveyButton("SIMBAD", "SIMBAD",
         "Queries SIMBAD for the field and adds extended DSO not present in the local catalogue (e.g. Abell planetary nebulae).");
      addSurveyButton("VizieR", "VizieR",
         "Queries VizieR (HyperLEDA) and adds galaxies with a diameter not present in the local catalogue. Requires the VizieR service to be available.");
      srvRow.addStretch();
      body.sizer.add(srvRow);
      // desplegable de objetos encontrados
      objCombo = new ComboBox(body); objCombo.editEnabled = false;
      try { optThemeApplyChannelComboStyle(objCombo); } catch (e) {}
      objCombo.onItemSelected = function (idx) { st.selected = (idx > 0 && st.__combo && st.__combo[idx - 1]) ? st.__combo[idx - 1].name : ""; repaint(); };
      body.sizer.add(objCombo);
      status = new Label(body); status.useRichText = true; status.wordWrapping = true;
      status.text = optT("Select an image (above) and press Analyze."); body.sizer.add(status);
      var btnA = new PushButton(body); optI18nLabel(btnA, "Analyze");
      try { optThemeApplyModuleCta(btnA); } catch (e) {}
      btnA.onClick = analyze; body.sizer.add(btnA);
   }});

   tab.addProcessSection("Sky map & export", [], { build: function (body) {
      btnSky = new PushButton(body); optI18nLabel(btnSky, "Sky map (Aladin)");
      try { optThemeApplyModuleCta(btnSky); } catch (e) {}
      btnSky.onClick = toggleSky; body.sizer.add(btnSky);
      var bE = new PushButton(body); optI18nLabel(bE, "Save annotated image");
      try { optThemeApplyActionButton(bE); } catch (e) {}
      bE.onClick = exportAnnotated; body.sizer.add(bE);
   }});

   this.annotTab.leftContent.sizer.addStretch();   // como las otras pestañas: secciones arriba, tight
};
// ===== ANNOTATIONS-UI-END =====
