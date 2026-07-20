#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Runs the CabraMagic analyzer + classifier + recipe over every image in the test
// folder and dumps a table (for tuning the metrics/recipe coefficients).
var DIR = "C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/";
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/cm_cabra_testset.log";
var B=""; function L(s){ B+=String(s)+"\n"; try{File.writeTextFile(LOG,B);}catch(e){} }
function pad(s,n){ s=String(s); while(s.length<n) s+=" "; return s; }
function padL(s,n){ s=String(s); while(s.length<n) s=" "+s; return s; }

function listImages(dir){
   var out=[], ff=new FileFind;
   if (ff.begin(dir+"*")){
      do {
         if (ff.isDirectory || ff.name==="." || ff.name==="..") continue;
         var lo=ff.name.toLowerCase();
         if (lo.indexOf(".xisf")>=0 || lo.indexOf(".tif")>=0 || lo.indexOf(".tiff")>=0) out.push(ff.name);
      } while(ff.next());
   }
   out.sort();
   return out;
}

function run(){
   var files=listImages(DIR);
   L("Test set analysis — "+files.length+" images");
   L("");
   L(pad("FILE",34)+pad("WxH",12)+padL("ext",8)+padL("C",7)+padL("starD",9)+padL("spread",8)+padL("chroma",8)+pad("  nb",6)+pad("  label",11)+"  recipe[sReduce/struct/coreP/detail/sat]");
   L(new Array(120).join("-"));
   for (var i=0;i<files.length;++i){
      var path=DIR+files[i], win=null;
      try {
         win=ImageWindow.open(path);
         if(!win||win.length<1){ L(pad(files[i],34)+"OPEN FAIL"); continue; }
         var v=win[0].mainView, im=v.image;
         // Analyze at native resolution — no IntegerResample (it pops a confirmation
         // dialog when the image carries an astrometric solution, and full-res matches
         // what CabraMagic actually runs on in the GUI).
         var a=optCabraAnalyze(v), c=optCabraClassify(a), r=optCabraBuildRecipe(a);
         L(pad(files[i],34)+pad(v.image.width+"x"+v.image.height,12)+
           padL(a.extendedFraction.toFixed(3),8)+padL(a.concentrationIndex.toFixed(2),7)+
           padL(a.starDensity.toFixed(0),9)+padL((a.starSpread||0).toFixed(3),8)+padL((a.meanChroma||0).toFixed(3),8)+pad("  "+(a.narrowbandLikely?"Y":"-"),6)+
           pad("  "+c.className,11)+"  "+r.starReduce+"/"+r.structure+"/"+r.coreProtect+"/"+r.detailAmount+"/"+r.saturation);
      } catch(e){ L(pad(files[i],34)+"ERROR: "+(e.message||e)); }
      finally { try{ if(win&&win[0]) win[0].forceClose(); }catch(ec){} }
   }
   L("");L("DONE");
}
try{run();}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
