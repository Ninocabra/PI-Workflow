#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Runs the REAL CabraMagic analyzer/classifier over the user's linear training
// set and logs stats + classification (filenames are the ground-truth hint).
var TDIR = "C:/Users/ninoc/Downloads/Imagenes training/";
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/cm_cabra_real.log";
var BUF = "";
function L(s){ BUF += String(s)+"\n"; try { File.writeTextFile(LOG, BUF); } catch(e){} }

var FILES = ["IC_1396_AstroBackyard.tif","ORION_STACKED.tif","PLEIADES_STACKED.tif",
             "ROSETTE_STACKED.tif","Soul_Nebula_AstroBackyard.tif","TULIP_4HOURS_20MINS.tif","WITCH1.tif"];
// expected (hint): mostly nebula; Pleiades = cluster/star-dominated.
var EXP = {"IC_1396_AstroBackyard.tif":"nebula","ORION_STACKED.tif":"nebula","PLEIADES_STACKED.tif":"starfield",
           "ROSETTE_STACKED.tif":"nebula","Soul_Nebula_AstroBackyard.tif":"nebula","TULIP_4HOURS_20MINS.tif":"nebula","WITCH1.tif":"nebula"};

// Extra real galaxies / planetary nebula (absolute paths). 'linear' marks raw masters.
var EXTRA = [
   { name:"NGC2392 Eskimo (B mono, LINEAR)", exp:"compact", linear:true,
     path:"E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/NGC 2392/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-10.00s_FILTER-B_mono_autocrop.xisf" },
   { name:"NGC2392 Eskimo (R mono, LINEAR)", exp:"compact", linear:true,
     path:"E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/NGC 2392/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-10.00s_FILTER-R_mono_autocrop.xisf" },
   { name:"NGC2392 Eskimo (G mono, LINEAR)", exp:"compact", linear:true,
     path:"E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/NGC 2392/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-10.00s_FILTER-G_mono_autocrop.xisf" },
   { name:"NGC1560 edge-on galaxy (RGB, LINEAR)", exp:"compact", linear:true,
     path:"E:/ASTRO Sin Procesar/ED127 en Valls/ASI 585 MC/NGC 1560/WBPP/master/masterLight_BIN-1_3840x2160_EXPOSURE-180.00s_FILTER-Galx_combined_RGB_autocrop.xisf" },
   { name:"NGC3184 spiral galaxy (RGB, STRETCHED)", exp:"compact", linear:false,
     path:"E:/ASTRO Sin Procesar/ED127 en Valls/NGC3184 Repetir/PiMagic-NGC3184-2026-01-31-11-41-51/PiMagic/Final_NGC3184_RGB.tif" }
];

function run(){
   L("engine: analyze="+(typeof optCabraAnalyze)+"  IntegerResample="+(typeof IntegerResample));
   var ok=0,tot=0;
   for (var f=0; f<FILES.length; ++f){
      var path=TDIR+FILES[f];
      if (!File.exists(path)){ L("MISSING "+FILES[f]); continue; }
      var wins=null;
      try { wins=ImageWindow.open(path); } catch(eO){ L("OPEN ERR "+FILES[f]+": "+eO.message); continue; }
      if (!wins||wins.length<1){ L("OPEN FAIL "+FILES[f]); continue; }
      var win=wins[0], view=win.mainView, img=view.image;
      var W=img.width,H=img.height;
      // Native resolution — no IntegerResample (pops a confirmation dialog when the
      // image has an astrometric solution, and full-res matches CabraMagic's GUI use).
      var a,c,r;
      try { a=optCabraAnalyze(view); c=optCabraClassify(a); r=optCabraBuildRecipe(a); }
      catch(eA){ L("ANALYZE ERR "+FILES[f]+": "+eA.message); try{win.forceClose();}catch(e){} continue; }
      var exp=EXP[FILES[f]]||"?";
      var hit=(c.className===exp)||(c.className==="compact"&&exp==="nebula")||(c.className==="nebula"&&exp==="starfield"&&a.extendedFraction>0.2);
      ++tot; if(hit)++ok;
      L((hit?"OK ":"XX ")+FILES[f]+"  "+view.image.width+"x"+view.image.height+
        "  ext="+a.extendedFraction.toFixed(4)+" C="+a.concentrationIndex.toFixed(2)+
        " starDens="+a.starDensity.toFixed(0)+" nb="+a.narrowbandLikely+
        "  -> "+c.className+"  (exp "+exp+")");
      L("     recipe: starReduce="+r.starReduce+" structure="+r.structure+" coreProtect="+r.coreProtect+" detail="+r.detailAmount+" sat="+r.saturation);
      try{win.forceClose();}catch(e){}
   }
   L("");L("--- EXTRA: galaxies / planetary (calibration; report only) ---");
   for (var g=0; g<EXTRA.length; ++g){
      var E=EXTRA[g];
      if (!File.exists(E.path)){ L("MISSING "+E.name); continue; }
      var ws=null; try{ ws=ImageWindow.open(E.path); }catch(eo){ L("OPEN ERR "+E.name+": "+eo.message); continue; }
      if (!ws||ws.length<1){ L("OPEN FAIL "+E.name); continue; }
      var w2=ws[0], v2=w2.mainView, im2=v2.image, W2=im2.width, H2=im2.height;
      var a2,c2,r2;
      try{ a2=optCabraAnalyze(v2); c2=optCabraClassify(a2); r2=optCabraBuildRecipe(a2); }
      catch(ea){ L("ANALYZE ERR "+E.name+": "+ea.message); try{w2.forceClose();}catch(e){} continue; }
      L((c2.className===E.exp?"OK ":".. ")+E.name+(E.linear?"":"  [STRETCHED]")+
        "  "+v2.image.width+"x"+v2.image.height+"  ext="+a2.extendedFraction.toFixed(4)+
        " C="+a2.concentrationIndex.toFixed(2)+" starDens="+a2.starDensity.toFixed(0)+
        " nb="+a2.narrowbandLikely+"  -> "+c2.className+"  (exp "+E.exp+")");
      L("     recipe: starReduce="+r2.starReduce+" structure="+r2.structure+" coreProtect="+r2.coreProtect+" detail="+r2.detailAmount+" sat="+r2.saturation);
      try{w2.forceClose();}catch(e){}
   }
   L("");L("SUMMARY  "+ok+"/"+tot+" match expected (Pleiades is a fuzzy case)");
}
try{run();}catch(e){L("ERROR: "+e.message+(e.stack?("\n"+e.stack):""));}
