#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// NO-OP AUDIT: run each non-GPU pipeline stage in sequence on a real linear RGB and report
// whether it actually MODIFIES the image (fingerprint delta). A stage that "succeeds" but
// leaves the image unchanged is a silent no-op (the pattern behind the ABE & BXT/NXT bugs).
// BXT/NXT are skipped here (known GPU-only no-op headless). dialog=null throughout.
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/audit_stages.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
function m82(f,e){return NER+"M82/WBPP2/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono.xisf";}
function col(f,e){return NER+"Collinder 34 COPIADO/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}

function fp(v){ // fingerprint: median per channel + chroma + HF, on a decimated grid
   var im=v.image,W0=im.width,H0=im.height,k=Math.ceil(Math.max(W0,H0)/1000);if(k<1)k=1;
   var W=Math.floor(W0/k),H=Math.floor(H0/k),n=W*H,rc=new Rect(0,0,W0,H0);
   var c=[];for(var ic=0;ic<im.numberOfChannels;ic++){var full=new Float32Array(W0*H0);im.getSamples(full,rc,ic);var red=new Float32Array(n);for(var y=0;y<H;y++){var sy=(y*k)*W0;for(var x=0;x<W;x++)red[y*W+x]=full[sy+x*k];}c.push(red);full=null;}
   while(c.length<3)c.push(c[0]);
   function med(a){var s=a.slice(0);s.sort(function(p,q){return p-q;});return s[s.length>>1];}
   var Y=new Float32Array(n),my=0;for(var j=0;j<n;j++){Y[j]=0.2126*c[0][j]+0.7152*c[1][j]+0.0722*c[2][j];my+=Y[j];}my/=n;
   var cs=0,cc=0;for(var m=0;m<n;m++){var mx=Math.max(c[0][m],c[1][m],c[2][m]);if(mx>0.05){cs+=(mx-Math.min(c[0][m],c[1][m],c[2][m]))/mx;cc++;}}
   var bl=optCmBoxBlur(Y,W,H,4),hf=0;for(var q=0;q<n;q++)hf+=Math.abs(Y[q]-bl[q]);
   return {mR:med(c[0]),mG:med(c[1]),mB:med(c[2]),chroma:cc?cs/cc:0,hf:hf/n};
}
function dist(a,b){return Math.abs(a.mR-b.mR)+Math.abs(a.mG-b.mG)+Math.abs(a.mB-b.mB)+Math.abs(a.chroma-b.chroma)+Math.abs(a.hf-b.hf);}

function step(view, name, fn, gpu){
   var before=fp(view),ok=true,err="";
   try{ fn(); }catch(e){ ok=false; err=e.message; }
   var after=fp(view),d=dist(before,after);
   var verdict = d>1e-6 ? "OK (changed "+d.toExponential(2)+")" : (gpu?"no-op [GPU, expected headless]":"*** NO-OP / NO CHANGE ***");
   L("   "+name+": "+(ok?verdict:("EXCEPTION: "+err)));
}

function audit(label, map){
   L(""); L("======== "+label+" ========");
   if(!optSafeView(map.R)){L("  channels missing");return;}
   var v=optCabraCombineRGB(map.R.id,map.G.id,map.B.id,map.R.image.width,map.R.image.height,"aud_"+label.replace(/[^A-Za-z0-9]/g,""));
   var stats,recipe;
   try{ stats=optCabraAnalyze(v); recipe=optCabraBuildRecipe(stats); }catch(e){ recipe={starReduce:0.2,structure:0.3,saturation:0.3}; }
   L("  recipe: starReduce="+recipe.starReduce+" structure="+recipe.structure+" saturation="+recipe.saturation);
   // --- optCabraMagicRun non-GPU stage sequence ---
   step(v,"background (GraXpert->AutoDBE->ABE)", function(){ optCabraBackgroundFallback(v); }, false);
   step(v,"color: BackgroundNeutralization",     function(){ optRunBackgroundNeutralization(v); }, false);
   step(v,"color: AutoLinearFit",                function(){ optRunAutoLinearFitWorkflow(v); }, false);
   step(v,"sharpen: BXT",                         function(){ optExecuteBlurXConfiguredOnView(v,{automatic_psf:true,sharpen_stars:0.1,adjust_star_halos:0,sharpen_nonstellar:0.3,correct_only:false}); }, true);
   step(v,"denoise: NXT",                         function(){ optExecuteNoiseXConfiguredOnView(v,{denoise:0.8,iterations:2,enable_color_separation:false,enable_frequency_separation:false,denoise_color:0,denoise_lf:0,denoise_lf_color:0,frequency_scale:5}); }, true);
   step(v,"stretch: AutoGHS",                     function(){ optRunAutoGhsStretch(v,{aghs_intensity:0.7}); }, false);
   step(v,"removeGreen: SCNR",                    function(){ optCabraRemoveGreen(v); }, false);
   if(recipe.starReduce>0.02) step(v,"starReduce",function(){ optStarReduceOnView(v,recipe.starReduce,2); }, false);
   step(v,"structure: localContrast",            function(){ var dst=(typeof optDetailDefaultState==="function")?optDetailDefaultState():{}; dst.algoId="localContrast"; dst.lcAmount=recipe.structure; optRunDetailOnView(v,dst); }, false);
   step(v,"saturation: HueSat",                   function(){ optApplyHueSaturationCorrectionToView(v,0,1+recipe.saturation); }, false);
   // --- compose-only finishing helpers (applied on the now-stretched image) ---
   step(v,"compose: optCabraSaturate",           function(){ optCabraSaturate(v,1.3,-0.012); }, false);
   step(v,"compose: optCabraRedBalance",         function(){ optCabraRedBalance(v,1.2); }, false);
   step(v,"compose: optCabraTameHighlights",     function(){ optCabraTameHighlights(v,0.88,0.30); }, false);
   step(v,"compose: optCabraTargetBrightness",   function(){ optCabraTargetBrightness(v,0.18); }, false);
   step(v,"compose: optCabraSetBlackPoint",      function(){ optCabraSetBlackPoint(v,0.08); }, false);
   try{ v.window.forceClose(); ["R","G","B"].forEach(function(k){if(map[k]&&map[k].window)map[k].window.forceClose();}); }catch(e){}
}

try{
   L("=== PIPELINE STAGE NO-OP AUDIT (non-GPU stages must change the image) ===");
   audit("M82_galaxy", {R:op(m82("R","60.00s")),G:op(m82("G","60.00s")),B:op(m82("B","60.00s"))});
   audit("Collinder34_neb", {R:op(col("R","180.00s")),G:op(col("G","180.00s")),B:op(col("B","180.00s"))});
   L(""); L("DONE");
}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
