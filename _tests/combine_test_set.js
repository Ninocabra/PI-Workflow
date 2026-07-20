#engine v8
#include <pjsr/UndoFlag.jsh>
#include <pjsr/ColorSpace.jsh>
#include <pjsr/SampleType.jsh>

// Builds the CabraMagic test set: per target, combine the per-filter autocrop mono
// masters into single linear images — RGB (R+G+B), LRGB (L applied), and narrowband
// SHO (R<-S,G<-H,B<-O) and HSO (R<-H,G<-S,B<-O). Saves to the test folder.
// RUN_ONLY (non-empty) limits to one target for a quick API validation pass.
var DEST = "C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/";
var LOG  = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/combine_test_set.log";
var RUN_ONLY = "";   // "" = all targets
var LRGB_ONLY = true;   // true = only (re)generate the _LRGB outputs
var B=""; function L(s){ B+=String(s)+"\n"; try{File.writeTextFile(LOG,B);}catch(e){} }

var N = "/e/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";  // not used directly; explicit paths below
function P(p){ return p; }

// Explicit per-channel paths (autocrop mono masters). Missing channels => omit key.
var TARGETS = [
 { name:"NGC3184", dir:"E:/ASTRO Sin Procesar/ED127 en Valls/NGC3184 Repetir/WBPP/master/", dim:"6248x4176",
   R:"180.00s", G:"180.00s", Bc:"180.00s", Lc:"180.00s" },
 { name:"M13", dir:"E:/ASTRO Sin Procesar/Light/M13/WBPP2_wD_wF/master/", dim:"6248x4176",
   R:"60.00s", G:"60.00s", Bc:"60.00s", Lc:"60.00s" },
 { name:"M57", dir:"E:/ASTRO Sin Procesar/Light/M57/WBPP_wF_wD/master/", dim:"6248x4176",
   R:"60.00s", G:"60.00s", Bc:"60.00s", Lc:"60.00s" },
 { name:"SH2-106", dir:"E:/ASTRO Sin Procesar/Light/SH2-106/WBPP_wF_wD/master/", dim:"6248x4176",
   R:"180.00s", G:"180.00s", Bc:"180.00s", Lc:"180.00s" },
 { name:"M13_Sept", dir:"E:/ASTRO Sin Procesar/Light/Septiembre 2024/Light 3/Plan/Light/M 13/All_M13_WBPP_w_flat_w_darks/master/", dim:"8288x5644",
   R:"60.00s", G:"60.00s", Bc:"60.00s", Lc:"60.00s" },
 { name:"Abell39", dir:"E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Abell 39/WBPP/master/", dim:"6248x4176",
   R:"30.00s", G:"30.00s", Bc:"30.00s", Lc:"30.00s", H:"180.00s", O:"180.00s", S:"180.00s" },
 { name:"Cadwell5", dir:"E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Cadwell 5 COPIADO/WBPP3/master/", dim:"6248x4176",
   R:"180.00s", G:"180.00s", Bc:"180.00s", Lc:"300.00s" },
 { name:"Collinder34", dir:"E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/WBPP/master/", dim:"6248x4176",
   R:"180.00s", G:"180.00s", Bc:"180.00s", Lc:"180.00s", H:"300.00s", O:"300.00s", S:"300.00s" },
 { name:"LDu2", dir:"E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/LDu 2 COPIADO/WBPP/master/", dim:"6248x4176",
   R:"180.00s", G:"180.00s", Bc:"180.00s", Lc:"180.00s" },
 { name:"NGC2392", dir:"E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/NGC 2392/WBPP/master/", dim:"6248x4176",
   R:"10.00s", G:"10.00s", Bc:"10.00s", Lc:"10.00s" },
 { name:"PK164", dir:"E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/PK 164+31.1/WBPP/master/", dim:"6248x4176",
   R:"30.00s", G:"30.00s", Bc:"30.00s", Lc:"30.00s", H:"180.00s", O:"180.00s", S:"180.00s" }
];

function chPath(t, filt, exp){ return t.dir + "masterLight_BIN-1_" + t.dim + "_EXPOSURE-" + exp + "_FILTER-" + filt + "_mono_autocrop.xisf"; }

function openMono(path){
   if (!File.exists(path)) throw new Error("missing channel: " + path);
   var w = ImageWindow.open(path);
   if (!w || w.length < 1) throw new Error("open failed: " + path);
   return w[0];
}
function newRGB(w,h,id){ return new ImageWindow(w,h,3,32,true,true,id); }

// ChannelCombination RGB from three source view ids into a fresh RGB window.
function combineRGB(rId,gId,bId,w,h,outId){
   var tw = newRGB(w,h,outId);
   var cc = new ChannelCombination;
   var rgbCS = 0; // RGB is colorSpace 0; prototype enum may be undefined under V8.
   try { if (typeof ChannelCombination.prototype.RGB !== "undefined") rgbCS = ChannelCombination.prototype.RGB; } catch(e){}
   cc.colorSpace = rgbCS;
   cc.channels = [[true,rId],[true,gId],[true,bId]];
   cc.executeOn(tw.mainView);
   return tw;
}
function applyLum(rgbView, lView, refId){
   // Natural LRGB: the deep L master (180-300s) is far brighter than the short RGB
   // (30-60s); combining directly explodes chrominance. LinearFit L to the green channel
   // first so scales match -> luminance gains SNR without inflating color.
   try { var lf = new LinearFit; lf.referenceViewId = refId; lf.executeOn(lView); } catch(e){}
   var lrgb = new LRGBCombination;
   // [enabled, id, weight] for L,R,G,B — enable only L so existing RGB is kept.
   lrgb.channels = [[true,lView.id,1.0],[false,"",1.0],[false,"",1.0],[false,"",1.0]];
   try { lrgb.lightness = 0.5; } catch(e){}
   try { lrgb.saturation = 1.0; } catch(e){}   // 1.0 = no extra saturation boost
   try { lrgb.chrominanceNoiseReduction = false; } catch(e){}
   lrgb.executeOn(rgbView);
}
function chromaOf(view){
   var im=view.image,w=im.width,h=im.height,n=w*h;
   if (im.numberOfChannels<3) return 0;
   var R=new Float32Array(n),G=new Float32Array(n),Bb=new Float32Array(n),rc=new Rect(0,0,w,h);
   im.getSamples(R,rc,0);im.getSamples(G,rc,1);im.getSamples(Bb,rc,2);
   var s=0,c=0,st=Math.max(1,(n/200000)|0);
   for(var i=0;i<n;i+=st){var r=R[i],g=G[i],b=Bb[i];var mx=Math.max(r,g,b);if(mx>1e-4){s+=(mx-Math.min(r,g,b))/mx;c++;}}
   return c?s/c:0;
}
function saveWin(win, name){
   var out = DEST + name + ".xisf";
   win.saveAs(out, false, false, false, false);
   L("    saved " + name + ".xisf");
}

function doTarget(t){
   L("== " + t.name + " ==");
   var sid = t.name.replace(/[^A-Za-z0-9_]/g, "_");   // valid PixInsight view identifier
   var rW=null,gW=null,bW=null,lW=null,hW=null,sW=null,oW=null, out=null;
   try {
      rW = openMono(chPath(t,"R",t.R)); gW = openMono(chPath(t,"G",t.G)); bW = openMono(chPath(t,"B",t.Bc));
      var w = rW.mainView.image.width, h = rW.mainView.image.height;
      // RGB
      if (!LRGB_ONLY) {
         out = combineRGB(rW.mainView.id, gW.mainView.id, bW.mainView.id, w, h, sid+"_rgb_tmp");
         saveWin(out, t.name+"_RGB");
      }
      // LRGB (apply L onto a fresh RGB)
      lW = openMono(chPath(t,"L",t.Lc));
      var out2 = combineRGB(rW.mainView.id, gW.mainView.id, bW.mainView.id, w, h, sid+"_lrgb_tmp");
      applyLum(out2.mainView, lW.mainView, gW.mainView.id);
      L("    LRGB chroma = " + chromaOf(out2.mainView).toFixed(3) + " (natural target ~0.10-0.25)");
      saveWin(out2, t.name+"_LRGB");
      try{ out2.forceClose(); }catch(e){}
      // Narrowband (needs H,S,O)
      if (!LRGB_ONLY && t.H && t.S && t.O){
         hW = openMono(chPath(t,"H",t.H)); sW = openMono(chPath(t,"S",t.S)); oW = openMono(chPath(t,"O",t.O));
         var sho = combineRGB(sW.mainView.id, hW.mainView.id, oW.mainView.id, w, h, sid+"_sho_tmp");
         saveWin(sho, t.name+"_SHO"); try{sho.forceClose();}catch(e){}
         var hso = combineRGB(hW.mainView.id, sW.mainView.id, oW.mainView.id, w, h, sid+"_hso_tmp");
         saveWin(hso, t.name+"_HSO"); try{hso.forceClose();}catch(e){}
      }
   } catch(e){ L("    ERROR " + t.name + ": msg=" + e.message + " str=" + String(e) + " name=" + e.name + (e.stack?("\n    stack="+e.stack):"")); }
   finally {
      var arr=[rW,gW,bW,lW,hW,sW,oW,out];
      for (var i=0;i<arr.length;++i){ try{ if(arr[i]) arr[i].forceClose(); }catch(ec){} }
   }
}

try {
   L("ChannelCombination=" + (typeof ChannelCombination) + " LRGBCombination=" + (typeof LRGBCombination));
   for (var i=0;i<TARGETS.length;++i){
      if (RUN_ONLY && TARGETS[i].name !== RUN_ONLY) continue;
      doTarget(TARGETS[i]);
   }
   L("DONE");
} catch(e){ L("FATAL: " + e.message + (e.stack?("\n"+e.stack):"")); }
