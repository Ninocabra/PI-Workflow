#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

var DIR = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/";
var LOG = DIR + "detail_invest_00_probe.log";
var BUF = "";
function L(s){ BUF += String(s)+"\n"; try { File.writeTextFile(LOG, BUF); } catch(e){} }

L("=== Probe Start ===");
L("optRunDetailOnView type: " + typeof optRunDetailOnView);
L("optDetailDefaultState type: " + typeof optDetailDefaultState);
L("optRunAutoGhsStretch type: " + typeof optRunAutoGhsStretch);
L("optCabraClonePM type: " + typeof optCabraClonePM);
L("ImageWindow type: " + typeof ImageWindow);

// Test: can we open a known XISF file?
var testPath = "C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/NGC3184_RGB.xisf";
L("Test path: " + testPath);
L("File exists: " + File.exists(testPath));

try {
   L("Opening image...");
   var ws = ImageWindow.open(testPath);
   L("ImageWindow.open returned: " + (ws ? ws.length : "null") + " windows");
   if (ws && ws.length > 0) {
      var v = ws[0].mainView;
      L("View id: " + v.id + " size: " + v.image.width + "x" + v.image.height + " ch:" + v.image.numberOfChannels);
      // get samples test
      var count = v.image.width * v.image.height;
      var rect = new Rect(0,0, v.image.width, v.image.height);
      var R = new Float32Array(count);
      v.image.getSamples(R, rect, 0);
      var sum = 0; for (var i = 0; i < count; i++) sum += R[i];
      L("Mean red channel: " + (sum/count).toFixed(5));
      // Try stretch
      L("Applying AutoGHS stretch...");
      optRunAutoGhsStretch(v, { aghs_intensity: 0.75, aghs_bp: 3.0 });
      L("Stretch done. New mean: " + (function(){
         var Rn = new Float32Array(count); v.image.getSamples(Rn, rect, 0);
         var s=0; for(var i=0;i<count;i++)s+=Rn[i]; return (s/count).toFixed(5);
      })());
      // Try clone
      L("Cloning...");
      var cl = optCabraClonePM(v, "test_clone_01");
      L("Clone id: " + cl.id);
      // Try detail method
      L("Running localContrast...");
      var st = optDetailDefaultState();
      st.algoId = "localContrast"; st.lcAmount = 0.20; st.lcRadius = 80;
      optRunDetailOnView(cl, st);
      L("localContrast OK");
      try { cl.window.forceClose(); } catch(e){}
      try { v.window.forceClose(); } catch(e){}
   }
} catch(e) {
   L("ERROR: " + e.message + (e.stack ? "\n" + e.stack : ""));
}

L("=== Probe End ===");
