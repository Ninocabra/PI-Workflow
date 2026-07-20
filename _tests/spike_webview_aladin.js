#engine v8
// ============================================================================
// spike_webview_aladin.js — Fase 0 / feature #13 (mapa del cielo, Aladin)
// ----------------------------------------------------------------------------
// SPIKE DESECHABLE y AUTOCONTENIDO. No incluye "PI Workflow.js", no toca el
// script principal, no incrementa el build. Bórralo cuando terminemos la Fase 0.
//
// HALLAZGO (spike v3): el WebView de PixInsight ejecuta JS y TIENE red (CDN OK),
// pero NO tiene WebGL -> Aladin Lite v3 (exige WebGL2) no arranca embebido.
// Esta versión prueba ALADIN LITE v2 (canvas 2D, sin WebGL, requiere jQuery):
// si renderiza, el mapa embebido en la pestaña es viable por la vía v2.
//
// CÓMO EJECUTARLO: PixInsight -> SCRIPT -> Execute Script File... -> este fichero.
// Necesita VENTANA VISIBLE + INTERNET. Envuelto en IIFE + clase ES6 (v8).
// ============================================================================

(function () {

var SPIKE_TITLE = "Spike #13 - Aladin Lite v2 en WebView (Fase 0)";

// Region de prueba hardcodeada: Orion / M42 (RA 83.8221, Dec -5.3911, FoV 1.6).
var SPIKE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://aladin.cds.unistra.fr/AladinLite/api/v2/latest/aladin.min.css">
<style>
  html,body { margin:0; padding:0; height:100%;
    font-family:Consolas,"JetBrains Mono",monospace; background:#0e0e10; color:#e8e8ea; }
  #diag { padding:10px 12px; font-size:13px; line-height:1.7; border-bottom:1px solid #333; background:#17171a; }
  #diag b { color:#d9a560; }
  .ok   { color:#6dbf7a; font-weight:bold; }
  .bad  { color:#e06d6d; font-weight:bold; }
  .pend { color:#d9a560; }
  #aladin-lite-div { width:100%; height:74vh; background:#000; }
</style>
</head>
<body>
  <div id="diag">
    <div><b>Spike Aladin Lite v2</b> (canvas 2D, sin WebGL) - region: Orion (M42)</div>
    <div>1. JavaScript ejecuta: <span id="js" class="bad">NO</span></div>
    <div>2. jQuery cargado (red): <span id="jq" class="pend">cargando...</span></div>
    <div>3. Aladin v2 cargado (red): <span id="cdn" class="pend">cargando...</span></div>
    <div>4. Aladin v2 init + tiles: <span id="aladin" class="pend">esperando...</span></div>
  </div>
  <div id="aladin-lite-div"></div>

  <script>
    (function(){ var e=document.getElementById('js'); e.textContent='SI'; e.className='ok'; })();
    window.onerror=function(msg){
      var e=document.getElementById('aladin');
      if(e && e.className!=='ok'){ e.textContent='window.onerror: '+msg; e.className='bad'; }
    };
    // Definida ANTES de los <script src> para que el onload de aladin.min.js
    // pueda invocarla (si se define despues, el onload no la encuentra).
    function spikeInitAladinV2(){
      var e=document.getElementById('aladin');
      try {
        var aladin = A.aladin('#aladin-lite-div', {
          survey:'P/DSS2/color', fov:1.6, target:'83.8221 -5.3911',
          showReticle:true, showZoomControl:true, showFullscreenControl:false,
          showLayersControl:true, showGotoControl:true, showFrame:true, showCooGrid:false
        });
        try {
          var ov=A.graphicOverlay({color:'#d9a560', lineWidth:2});
          aladin.addOverlay(ov);
          var r=83.8221, d=-5.3911, s=0.30;
          ov.add(A.polygon([[r-s,d-s],[r+s,d-s],[r+s,d+s],[r-s,d+s]]));
        } catch(eo){}
        e.textContent='init OK - ¿ves el cielo (DSS) abajo con recuadro dorado?'; e.className='ok';
      } catch(err){ e.textContent='init ERROR: '+err; e.className='bad'; }
    }
  </script>
  <script src="https://code.jquery.com/jquery-1.12.4.min.js"
    onload="var e=document.getElementById('jq'); e.textContent='SI'; e.className='ok';"
    onerror="var e=document.getElementById('jq'); e.textContent='NO (jQuery no cargo)'; e.className='bad';"></script>
  <script src="https://aladin.cds.unistra.fr/AladinLite/api/v2/latest/aladin.min.js"
    onload="var e=document.getElementById('cdn'); e.textContent='SI (aladin v2 cargado)'; e.className='ok'; spikeInitAladinV2();"
    onerror="var e=document.getElementById('cdn'); e.textContent='NO (aladin v2 no cargo)'; e.className='bad';"></script>
</body>
</html>`;

function spikeOpenInBrowser(path) {
   try {
      if (typeof ExternalProcess === "undefined") {
         console.criticalln("ExternalProcess no disponible en este build.");
         return;
      }
      new ExternalProcess().start("cmd", ["/c", "start", "", path]);   // Windows
   } catch (e) {
      console.criticalln("No pude abrir en el navegador: " + e);
   }
}

class SpikeAladinDialog extends Dialog {
 constructor() {
   super();

   var self = this;
   this.windowTitle = SPIKE_TITLE;
   this.userResizable = true;
   this.minWidth = 780;
   this.minHeight = 760;

   this.htmlPath = File.systemTempDirectory + "/piw_spike_aladin.html";
   try { File.writeTextFile(this.htmlPath, SPIKE_HTML); }
   catch (eW) { console.criticalln("No pude escribir el HTML temporal: " + eW); }

   this.info = new Label(this);
   this.info.useRichText = true;
   this.info.wordWrapping = true;
   this.info.text =
      "<b>" + SPIKE_TITLE + "</b><br/>" +
      "Necesita <b>internet</b>. Mira los 4 checks arriba del panel. Si ves el cielo (DSS) " +
      "con un recuadro dorado, el mapa embebido (via Aladin v2) es viable. Si no, usa el boton " +
      "<i>Abrir en navegador</i> para comprobar la Ruta B.";

   this.web = new WebView(this);
   this.web.minWidth = 740;
   this.web.minHeight = 560;
   try { this.web.loadContent(this.htmlPath); }
   catch (eL) { console.criticalln("WebView.loadContent fallo: " + eL); }

   this.btnReload = new PushButton(this);
   this.btnReload.text = "Recargar";
   this.btnReload.onClick = function() { try { self.web.reload(); } catch (e) { console.warningln("reload: " + e); } };

   this.btnBrowser = new PushButton(this);
   this.btnBrowser.text = "Abrir en navegador (Ruta B)";
   this.btnBrowser.onClick = function() { spikeOpenInBrowser(self.htmlPath); };

   this.btnClose = new PushButton(this);
   this.btnClose.text = "Cerrar";
   this.btnClose.defaultButton = true;
   this.btnClose.onClick = function() { self.ok(); };

   this.buttons = new HorizontalSizer;
   this.buttons.spacing = 6;
   this.buttons.add(this.btnReload);
   this.buttons.add(this.btnBrowser);
   this.buttons.addStretch();
   this.buttons.add(this.btnClose);

   this.sizer = new VerticalSizer;
   this.sizer.margin = 8;
   this.sizer.spacing = 8;
   this.sizer.add(this.info);
   this.sizer.add(this.web, 100);
   this.sizer.add(this.buttons);
 }
}

console.show();
console.noteln("=> Spike Aladin v2/WebView: escribiendo HTML y abriendo el dialogo...");
(new SpikeAladinDialog()).execute();
console.noteln("=> Spike cerrado. Reporta los 4 checks + si viste el cielo (embebido v2 y/o navegador).");

})();
