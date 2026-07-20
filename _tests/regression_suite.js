#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// =============================================================================
// PI Workflow 2.0 — REGRESSION SAFETY NET (Phase 0)
// Deterministic numeric fingerprint of the engine's pure/refactorable functions
// (ImageOps, Color Mixer, Detail, SSSC, stretch math, helpers). No GPU / Gaia /
// external tools (those are GUI-only). First run captures a baseline JSON; later
// runs compare against it and report PASS/FAIL per check. Re-run after every
// refactor step — modularisation (Phase 1) must keep this byte-identical.
// =============================================================================
var DIR  = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/_tests/";
var BASE = DIR + "regression_baseline.json";
var LOG  = DIR + "regression_suite.log";
var TOL_ABS = 1e-7, TOL_REL = 1e-6;
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} }
function rnd(x){ return (typeof x === "number" && isFinite(x)) ? Math.round(x*1e8)/1e8 : x; }

// ---- deterministic synthetic data ------------------------------------------
function synthArray(w, h){
   var a = new Float32Array(w*h);
   for (var y=0;y<h;++y) for (var x=0;x<w;++x){
      var v = 0.15 + 0.12*Math.sin(x*0.21) * Math.cos(y*0.17) + 0.05*((x*7+y*13)%11)/11;
      if (((x*3+y*5) % 97) === 0) v += 0.5;   // sparse "stars"
      a[y*w+x] = v < 0 ? 0 : v > 1 ? 1 : v;
   }
   return a;
}
function synthRGB(W, H){
   var win = new ImageWindow(W, H, 3, 32, true, true, "RGS_"+Math.floor(Math.random()*1e6));
   var rect = new Rect(0,0,W,H), N=W*H;
   var R=new Float32Array(N),G=new Float32Array(N),Bb=new Float32Array(N);
   for (var y=0;y<H;++y) for (var x=0;x<W;++x){ var i=y*W+x;
      R[i]=0.18+0.10*Math.sin(x*0.2)+0.04*Math.cos(y*0.13);
      G[i]=0.16+0.09*Math.sin(x*0.2+0.5)+0.03*Math.cos(y*0.11);
      Bb[i]=0.20+0.11*Math.sin(x*0.2+1.0)+0.05*Math.cos(y*0.09);
      if (((x*3+y*5)%89)===0){ R[i]+=0.6; G[i]+=0.55; Bb[i]+=0.5; }
      R[i]=Math.max(0,Math.min(1,R[i])); G[i]=Math.max(0,Math.min(1,G[i])); Bb[i]=Math.max(0,Math.min(1,Bb[i]));
   }
   win.mainView.beginProcess(UndoFlag_NoSwapFile);
   win.mainView.image.setSamples(R,rect,0); win.mainView.image.setSamples(G,rect,1); win.mainView.image.setSamples(Bb,rect,2);
   win.mainView.endProcess();
   return win;
}
function arrFp(a){ if(!a||!a.length) return [0]; var s=0,n=a.length; for(var i=0;i<n;++i)s+=a[i];
   return [rnd(s), rnd(a[0]), rnd(a[(n/3)|0]), rnd(a[(2*n/3)|0]), rnd(a[n-1])]; }
function viewFp(view){ var im=view.image,o=[],nc=im.numberOfChannels; for(var c=0;c<nc;++c){ im.firstSelectedChannel=c; im.lastSelectedChannel=c; o.push(rnd(im.median())); }
   im.resetSelections(); var w=im.width,h=im.height,c1=nc>1?1:0;
   o.push(rnd(im.sample((w/3)|0,(h/3)|0,0))); o.push(rnd(im.sample((2*w/3)|0,(2*h/3)|0,c1))); return o; }
function starImg(W,H,specs){ // Gaussian stars: specs=[[x,y,aR,aG,aB],...]
   var win=new ImageWindow(W,H,3,32,true,true,"RST_"+Math.floor(Math.random()*1e6));
   var rect=new Rect(0,0,W,H),N=W*H,R=new Float32Array(N),G=new Float32Array(N),Bb=new Float32Array(N);
   for(var i=0;i<N;++i){R[i]=0.03;G[i]=0.03;Bb[i]=0.03;}
   var s2=2*1.6*1.6;
   for(var k=0;k<specs.length;++k){ var sp=specs[k];
      for(var dy=-6;dy<=6;++dy)for(var dx=-6;dx<=6;++dx){ var x=sp[0]+dx,y=sp[1]+dy; if(x<0||y<0||x>=W||y>=H)continue;
         var g=Math.exp(-(dx*dx+dy*dy)/s2),id=y*W+x; R[id]+=sp[2]*g; G[id]+=sp[3]*g; Bb[id]+=sp[4]*g; } }
   win.mainView.beginProcess(UndoFlag_NoSwapFile);
   win.mainView.image.setSamples(R,rect,0); win.mainView.image.setSamples(G,rect,1); win.mainView.image.setSamples(Bb,rect,2);
   win.mainView.endProcess(); return win;
}

// ---- check registry --------------------------------------------------------
var results = {};
function check(name, fn){ try { results[name] = fn(); } catch(e){ results[name] = "ERR:"+e.message; } }

var grid = { start:336, step:2, count:343 };
function bb(T){ var c2=1.4388e7,o=[]; for(var k=0;k<grid.count;++k){var lam=grid.start+k*grid.step,x=c2/(lam*T);o.push(x>80?0:1/(Math.pow(lam,4)*(Math.exp(x)-1)));} return o; }

try {
   var winBefore = ImageWindow.windows.length;   // F3: window-leak guard (orphan detection)
   var W=96, H=72;

   // A) pure math helpers
   check("smoothstep", function(){ return [rnd(optCmSmoothstep(0.1,0.5,0.3)), rnd(optCmSmoothstep(0.1,0.5,0.05)), rnd(optCmSmoothstep(0.1,0.5,0.9))]; });
   check("ssscMedian", function(){ return [rnd(optSSSCMedian([3,1,2,5,4])), rnd(optSSSCMedian([1,2,3,4]))]; });
   check("robustRatio", function(){ return [rnd(optSSSCRobustRatio([1,1.1,0.9,1.05,5,0.95]))]; });
   check("robustLinFit", function(){ var f=optSSSCRobustLinFit([0,1,2,3,4],[0.1,1.1,2.0,3.2,3.9]); return [rnd(f.a),rnd(f.b)]; });
   check("madMidtone", function(){ return [rnd(optMadMidtone(0.1,0.05,0.25)), rnd(optMadMidtone(0.3,0.1,0.25))]; });
   check("seedBands", function(){ return [rnd(optSSSCSeedBand(0,620)),rnd(optSSSCSeedBand(1,540)),rnd(optSSSCSeedBand(2,470)),rnd(optSSSCSeedBand(2,525))]; });

   // B) ImageOps primitives
   var Y = synthArray(W,H);
   check("boxBlur_r3",  function(){ return arrFp(optCmBoxBlur(Y.slice(0),W,H,3)); });
   check("boxMin_r2",   function(){ return arrFp(optDetailBoxMin(Y.slice(0),W,H,2)); });
   check("boxMax_r2",   function(){ return arrFp(optDetailBoxMax(Y.slice(0),W,H,2)); });
   check("guidedLuma",  function(){ return arrFp(optDetailGuidedLuma(Y.slice(0),W,H,8,0.7)); });
   check("atrousLuma",  function(){ return arrFp(optDetailAtrousLuma(Y.slice(0),W,H,[1.3,1.0,1.0,1.0,1.0])); });
   check("atrousDecomp",function(){ var D=optAtrousDecompose(Y.slice(0),W,H,4); var o=[];
      if(D&&D.layers){ for(var i=0;i<D.layers.length;++i){ var s=0,a=D.layers[i]; for(var j=0;j<a.length;++j)s+=a[j]; o.push(rnd(s)); } }
      if(D&&D.residual){ var rs=0; for(var r=0;r<D.residual.length;++r)rs+=D.residual[r]; o.push(rnd(rs)); } return o; });

   // C) Color Mixer full apply (hue / saturation / vibrance)
   check("colorMixer_apply", function(){
      var win=synthRGB(W,H); var st=optColorMixerDefaultState();
      st.bands[0].saturation=40; st.bands[4].hueShift=10; st.bands[5].vibrance=30;
      optRunColorMixerOnView(win.mainView, st); var fp=viewFp(win.mainView); win.forceClose(); return fp;
   });
   check("colorMixer_mask", function(){
      var win=synthRGB(W,H); var st=optColorMixerDefaultState();
      st.bands[5].saturation=40; st.protectLowSat=false; st.protectStars=false;   // blue band, pure hue selection
      var mv=optBuildColorMixerMaskView(win.mainView, st, -1); var fp=viewFp(mv);
      try{optCloseView(mv);}catch(e){} win.forceClose(); return fp;
   });

   // D) Detail methods (each algoId)
   var detailAlgos=["localContrast","mmtTexture","edgeAware","hdrmt","dse","clahe","sigmoid","vibrance","byObjectType"];
   for (var d=0; d<detailAlgos.length; ++d){
      (function(algo){
         check("detail_"+algo, function(){
            var win=synthRGB(W,H); var st=optDetailDefaultState(); st.algoId=algo;
            optRunDetailOnView(win.mainView, st); var fp=viewFp(win.mainView); win.forceClose(); return fp;
         });
      })(detailAlgos[d]);
   }

   // E) SSSC math (integrate / fit / model residual)
   check("sssc_integrate", function(){ var e=optSSSCIntegrateSpectrum(bb(5800),grid); return [rnd(e[0]/e[1]),rnd(e[2]/e[1])]; });
   check("sssc_stage1", function(){
      var stars=[]; for(var i=0;i<14;++i){ var sp=bb(3500+i*400); var e=optSSSCIntegrateSpectrum(sp,grid);
         stars.push({ok:true,flux:sp,Rm:e[0]*1.3,Gm:e[1],Bm:e[2]*0.8}); }
      var g=optSSSCFitStage1Gains(stars,grid); return [rnd(g.gR),rnd(g.gB)];
   });
   check("sssc_stage2", function(){
      var stars=[]; for(var i=0;i<60;++i){ var sp=bb(3000+i*120); var e=optSSSCIntegrateSpectrum(sp,grid);
         var col=optSSSCLog2(e[0],e[2]);                 // colour index -> inject colour-dependent cast
         stars.push({ok:true,flux:sp,Rm:e[0]*(1.2+0.08*col),Gm:e[1],Bm:e[2]*(0.85-0.06*col)}); }
      var g=optSSSCFitStage1Gains(stars,grid); var m=optSSSCFitStage2Response(stars,grid,g,{minStars:50});
      return [rnd(m.aR),rnd(m.bR),rnd(m.aB),rnd(m.bB)];
   });
   check("sssc_stage3", function(){
      var M=[[1.1,0.08,0.02],[0.05,1,0.05],[0.03,0.1,0.9]]; var stars=[];
      for(var i=0;i<120;++i){ var sp=bb(3000+i*60); var e=optSSSCIntegrateSpectrum(sp,grid);
         stars.push({ok:true,flux:sp,Rm:(M[0][0]*e[0]+M[0][1]*e[1]+M[0][2]*e[2]),Gm:(M[1][0]*e[0]+M[1][1]*e[1]+M[1][2]*e[2]),Bm:(M[2][0]*e[0]+M[2][1]*e[1]+M[2][2]*e[2])}); }
      var m=optSSSCFitStage3CCM(stars,grid,{minStars:30}); var A=m.ccm;
      return [rnd(A[0][0]),rnd(A[0][2]),rnd(A[2][0]),rnd(A[2][2]),rnd(m.rms)];
   });
   check("sssc_photometry", function(){
      var win=starImg(64,64,[[20,20,0.5,0.4,0.3],[40,30,0.3,0.5,0.6],[15,45,0.6,0.5,0.4],[50,50,0.4,0.45,0.5]]);
      var stars=[{x:20,y:20},{x:40,y:30},{x:15,y:45},{x:50,y:50}];
      optSSSCStarPhotometry(win.mainView, stars, {satLevel:0.99}); var nOk=0,fp=[];
      for(var i=0;i<stars.length;++i){ if(stars[i].ok){nOk++; fp.push(rnd(stars[i].Rm/stars[i].Gm),rnd(stars[i].Bm/stars[i].Gm));} }
      win.forceClose(); fp.unshift(nOk); return fp;
   });

   // F) stretch math (linked auto-stretch on a synthetic image)
   check("madAutoStretch", function(){
      var win=synthRGB(W,H); optApplyMadAutoStretch(win.mainView.image, true); var fp=viewFp(win.mainView); win.forceClose(); return fp;
   });

   // G) AutoGHS core math — exercise every branch of the base transform (b = -1, <0, 0, 1, >0)
   check("autoghs_baseT", function(){
      var xs=[0.05,0.25,0.6,0.95], bs=[-1,-0.5,0,1,2.5], D=4.2, fp=[];
      for(var bi=0;bi<bs.length;++bi)for(var xi=0;xi<xs.length;++xi){
         fp.push(rnd(optAutoGhsBaseT(xs[xi],D,bs[bi]))); fp.push(rnd(optAutoGhsBaseTp(xs[xi],D,bs[bi]))); }
      return fp;
   });
   check("autoghs_transform", function(){
      var T=optAutoGhsMakeTransform(3.0,0.5,0.22,0.04,0.96), xs=[0,0.04,0.1,0.22,0.5,0.96,1], fp=[];
      for(var i=0;i<xs.length;++i) fp.push(rnd(T(xs[i]))); return fp;
   });
   check("autoghs_medianMAD", function(){
      var n=4096,a=new Float32Array(n); for(var i=0;i<n;++i){ var v=0.2+0.15*Math.sin(i*0.013); if((i%131)===0)v+=0.5; a[i]=v<0?0:v>1?1:v; }
      var m=optAutoGhsMedianMAD(a,n,2000); return [rnd(m.median),rnd(m.sigma)];
   });
   check("autoghs_stretch", function(){
      var win=synthRGB(W,H);
      // sat:1 pins the LEGACY full-colour path (out == channel*ghs(L)/L) byte-identical.
      optRunAutoGhsStretch(win.mainView,{aghs_sigmas:1.0,aghs_intensity:0.7,aghs_iterations:5,aghs_bp:2.8,aghs_saturation:1});
      var fp=viewFp(win.mainView); win.forceClose(); return fp;
   });
   // AUTOGHS-SATURATION: chroma damping toward the stretched luminance Ls. sat=1 == legacy
   // (channel*ghs/L); sat<1 pulls channels toward Ls -> less saturation + less core blowout.
   check("autoghs_saturation", function(){
      // bright coloured pixel; ghs(L) modelled as Ls (the stretched luminance target).
      var r0=0.8, g0=0.6, b0=0.4, wl=OPT_AUTOGHS_LUM_WEIGHTS;
      var L=wl[0]*r0+wl[1]*g0+wl[2]*b0, Ls=0.85, f=Ls/L;
      function apply(sat){
         var r=Ls+sat*(r0*f-Ls), g=Ls+sat*(g0*f-Ls), bl=Ls+sat*(b0*f-Ls);
         return [r>1?1:(r<0?0:r), g>1?1:(g<0?0:g), bl>1?1:(bl<0?0:bl)];
      }
      var full=apply(1), soft=apply(0.92), mono=apply(0);
      // mono == Ls on every channel (fully desaturated); soft sits between full and mono.
      var monoNeutral = (Math.abs(mono[0]-Ls)<1e-9 && Math.abs(mono[1]-Ls)<1e-9 && Math.abs(mono[2]-Ls)<1e-9) ? 1 : 0;
      return [rnd(full[0]),rnd(full[1]),rnd(full[2]), rnd(soft[0]),rnd(soft[1]),rnd(soft[2]), monoNeutral];
   });
   // AUTOGHS-NOISE-CEILING: on a faint/noisy frame the ceiling stops the stretch early, so the
   // capped median lands BELOW the uncapped one (which pushes toward the 0.22 target).
   check("autoghs_noise_ceiling", function(){
      function noisyMono(id){  // deterministic dim sky (~0.05) + strong noise, no real signal
         var W=200,H=150,win=new ImageWindow(W,H,1,32,true,false,id),N=W*H,a=new Float32Array(N),rc=new Rect(0,0,W,H);
         for(var i=0;i<N;++i){ var r=((i*1103515245+12345)>>>0)/4294967295; a[i]=0.05+0.08*(r-0.5); }   // [0.01,0.09], no clamp
         win.mainView.beginProcess(UndoFlag_NoSwapFile); win.mainView.image.setSamples(a,rc,0); win.mainView.endProcess(); return win;
      }
      // test ceiling 0.01 is deliberately low so it engages here (proves the mechanism); the
      // production value (cabramagic passes 0.05) is separate and tuned from real GUI bgNoise.
      var w0=noisyMono("AGN0"); optRunAutoGhsStretch(w0.mainView,{aghs_intensity:0.7,aghs_noiseCeiling:0});    var m0=w0.mainView.image.median(); w0.forceClose();
      var w1=noisyMono("AGN1"); optRunAutoGhsStretch(w1.mainView,{aghs_intensity:0.7,aghs_noiseCeiling:0.01}); var m1=w1.mainView.image.median(); w1.forceClose();
      return [rnd(m0), rnd(m1), (m1 < m0 - 1e-4) ? 1 : 0];   // capped (m1) strictly below uncapped (m0)
   });
   // MGC-MARS-FILTERS: NB emission line -> real MARS group (Ha/OIII NB; SII->broadband R) + applier.
   // Filters are encoded as integers (cod) so the numeric harness comparison actually detects
   // changes — a raw string array would silently pass (Math.abs(str-str)=NaN, NaN>tol is false).
   check("mgc_mars_filter", function(){
      function cod(f){ var M={L:0,Ha:1,OIII:2,R:3,G:4,B:5}; return (M[f]!==undefined)?M[f]:-1; }
      var Ha={id:"H",name:"H-alpha",wavelength:656.28}, O={id:"O",name:"OIII",wavelength:500.70}, S={id:"S",name:"SII",wavelength:672.40};
      var mMono={}, mRGB={}, mIcon={};
      optApplyMGCMarsFilters(mMono, {isNarrowband:true,isMono:true,monoLine:Ha,description:"Ha"}, false);
      optApplyMGCMarsFilters(mRGB,  {isNarrowband:true,isMono:false,recipe:"HOO",linesRGB:[Ha,O,O],description:"HOO"}, false);
      optApplyMGCMarsFilters(mIcon, {isNarrowband:true,isMono:true,monoLine:Ha,description:"Ha"}, true);  // icon -> no override
      return [ cod(optMarsFilterForLine(Ha)), cod(optMarsFilterForLine(O)), cod(optMarsFilterForLine(S)), cod(optMarsFilterForLine(null)),
               cod(mMono.grayMARSFilter), cod(mRGB.redMARSFilter), cod(mRGB.greenMARSFilter), cod(mRGB.blueMARSFilter),
               (mIcon.grayMARSFilter === undefined) ? 1 : 0 ];   // [1,2,3,0, 1, 1,2,2, 1]
   });
   // DUALBAND filter detection (GAP 2): conservative FITS-FILTER-keyword match for OSC dual-band.
   check("dualband_filter", function(){
      function b(s){ return optCabraIsDualbandFilter(s)?1:0; }
      return [ b("L-eXtreme"), b("L-Ultimate"), b("Optolong L-eNhance"), b("Duo-Band"), b("ALP-T"), b("Ha+OIII"), b("Triad Quad"),
               b("Red"), b("Ha"), b("Luminance"), b("R"), b(""), b("SII") ];   // [1,1,1,1,1,1,1, 0,0,0,0,0,0]
   });
   // SIGNAL-WEIGHTED NB add (B): SNR-advantage weight, clamped [0.10,0.70]. weak NB->low, strong->high.
   check("nb_add_weight", function(){
      return [ rnd(optCabraNbAddWeight(2,10)), rnd(optCabraNbAddWeight(5,5)), rnd(optCabraNbAddWeight(20,5)),
               rnd(optCabraNbAddWeight(0,5)), rnd(optCabraNbAddWeight(100,5)) ];   // [0.16667,0.5,0.7,0.1,0.7]
   });

   // H) Channel Combination blend expressions — pure deterministic PixelMath strings
   check("cc_blendExpr", function(){
      function sh(s){ var h=2166136261; for(var i=0;i<s.length;++i){ h^=s.charCodeAt(i); h=(h*16777619)>>>0; } return h; }
      var modes=["Replace","Darken/Min","Multiply","Colour burn","Linear burn","Darker colour",
         "Lighten/Max","Screen","Colour dodge","Linear dodge/Add","Lighter colour","Overlay",
         "Soft light","Hard light","Vivid light","Linear light","Pin light","Difference","Exclusion",
         "Subtract","Divide","Power","Arctan","Hue","Saturation","Lightness"];
      var fp=[];
      for(var i=0;i<modes.length;++i) fp.push(sh(optCcBlendExpression(modes[i],"$T","M",1.0)));
      fp.push(sh(optCcBlendExpression("Screen","$T","M",0.5)));     // opacity blend path
      fp.push(sh(optCcBlendExpression("Screen","$T","M",0.00005))); // opacity~0 -> returns A
      fp.push(sh(optCcBlendExpression("Screen","$T","M",1.0,"MK")));   // Photoshop mask: alpha = mask
      fp.push(sh(optCcBlendExpression("Multiply","$T","M",0.5,"MK"))); // Photoshop mask: alpha = 0.5*mask
      return fp;
   });

   // I) Session persistence (F4) — pure serialization round-trip (no Settings writes)
   check("session_capture", function(){
      var s=optSessionCapture(), nMenus=0, nAlgos=0, nTrue=0;
      for(var m in s.algos){ nMenus++; for(var a in s.algos[m]){ nAlgos++; if(s.algos[m][a]===true)nTrue++; } }
      return [s.schema, nMenus, nAlgos, nTrue];   // default registry = all enabled
   });
   check("session_roundtrip", function(){
      var st={schema:OPT_SESSION_SCHEMA,app:"PI Workflow",algos:{}};
      for(var i=0;i<OPT_ALGO_MENUS.length;++i){ var menu=OPT_ALGO_MENUS[i],rec={};
         for(var j=0;j<menu.algos.length;++j) rec[menu.algos[j].id]=(((i+j)%3)!==0); st.algos[menu.id]=rec; }
      var back=optSessionFromJson(optSessionToJson(st)), total=0, mism=0;
      for(var m in st.algos)for(var a in st.algos[m]){ total++; if(!back.algos[m]||back.algos[m][a]!==st.algos[m][a])mism++; }
      return [total, mism, optSessionToJson(st).length];   // mism must be 0
   });
   check("session_reject", function(){
      var bad=0; try{ optSessionFromJson('{"app":"SomethingElse","algos":{}}'); }catch(e){ bad=1; }
      var ok=0;  try{ optSessionFromJson(optSessionToJson(optSessionCapture())); ok=1; }catch(e){}
      return [bad, ok];   // [1,1]
   });
   check("session_params_roundtrip", function(){   // v2: per-tool state via the param registry (mock dialog)
      function mk(){ return { colorMixerState:optColorMixerDefaultState(), detailState:optDetailDefaultState(),
         reloadColorMixerBands:function(){}, ncColorMixerStrength:{setValue:function(){}},
         ncColorMixerSelectivity:{setValue:function(){}}, reloadDetailPanels:function(){} }; }
      var m1=mk();
      m1.colorMixerState.bands[2].saturation=42; m1.colorMixerState.globalStrength=0.7; m1.colorMixerState.selectivity=0.33;
      m1.detailState.algoId="localContrast"; m1.detailState.lcAmount=0.27; m1.detailState.lcRadius=55;
      var back=optSessionFromJson(optSessionToJson(optSessionCapture(m1)));
      var m2=mk(), r=optSessionApply(back, m2);
      return [ r.paramsApplied, rnd(m2.colorMixerState.bands[2].saturation), rnd(m2.colorMixerState.globalStrength),
         rnd(m2.colorMixerState.selectivity), m2.detailState.algoId==="localContrast"?1:0,
         rnd(m2.detailState.lcAmount), rnd(m2.detailState.lcRadius) ];   // [2,42,0.7,0.33,1,0.27,55]
   });

   // J) Continuum Subtraction — pure k-math + full mono subtraction on synthetic views
   check("cs_math", function(){
      var pairs=[]; for(var i=0;i<14;++i){ var c=0.1+i*0.05; pairs.push({nb:0.83*c+0.002*Math.sin(i), cont:c}); }
      var slope=optCsSlopeThroughOrigin(pairs), est=optCsEstimateKFromPairs(pairs);
      var med=optCsMedianSorted([0.1,0.2,0.3,0.4,0.5]), med2=optCsMedianSorted([0.1,0.2,0.3,0.4]);
      return [rnd(slope), rnd(est.k), est.n, est.ok?1:0, rnd(med), rnd(med2),
              optCsContinuumChannelForLine("H"), optCsContinuumChannelForLine("O"), optCsContinuumChannelForLine("X")];
   });
   check("cs_run", function(){
      var w=80,h=60,N=w*h, rect=new Rect(0,0,w,h);
      var nbWin=new ImageWindow(w,h,1,32,true,false,"RCS_NB_"+Math.floor(Math.random()*1e6));
      var ctWin=new ImageWindow(w,h,1,32,true,false,"RCS_CT_"+Math.floor(Math.random()*1e6));
      var nb=new Float32Array(N), ct=new Float32Array(N);
      for(var y=0;y<h;++y)for(var x=0;x<w;++x){ var i=y*w+x, base=0.1+0.05*Math.sin(x*0.2)*Math.cos(y*0.15);
         var v=base+0.08*Math.exp(-(((x-40)*(x-40)+(y-30)*(y-30))/120));
         nb[i]=v<0?0:v>1?1:v; ct[i]=base<0?0:base>1?1:base; }
      nbWin.mainView.beginProcess(UndoFlag_NoSwapFile); nbWin.mainView.image.setSamples(nb,rect,0); nbWin.mainView.endProcess();
      ctWin.mainView.beginProcess(UndoFlag_NoSwapFile); ctWin.mainView.image.setSamples(ct,rect,0); ctWin.mainView.endProcess();
      var res=optRunContinuumSubtraction(nbWin.mainView, ctWin.mainView, {k:0.85, line:"H", floor:0.0});
      var fp=viewFp(res);
      try { optCloseView(res); } catch(e){ try { res.window.forceClose(); } catch(e2){} }
      nbWin.forceClose(); ctWin.forceClose(); return fp;
   });
   // CS star-poor FALLBACK: high-pass structural regression recovers the continuum scale (k~0.7)
   // from sharp stars while ignoring the smooth emission blob + gradients (which a global fit would
   // bias). Deterministic synthetic: continuum = gradient + stars; nb = gradient + 0.7*stars + wide emission.
   check("cs_k_highpass", function(){
      var W=120,H=90,N=W*H,rect=new Rect(0,0,W,H), kTrue=0.7;
      var ct=new Float32Array(N), nb=new Float32Array(N);
      var stars=[[30,25,0.5],[80,40,0.4],[55,70,0.45],[100,20,0.35],[20,60,0.4],[70,15,0.3]];
      for(var y=0;y<H;++y)for(var x=0;x<W;++x){ var i=y*W+x;
         var bgC=0.10+0.00005*x, bgN=0.12+0.00004*y;
         var em=0.30*Math.exp(-(((x-60)*(x-60)+(y-45)*(y-45))/(2*25*25)));   // wide smooth emission (NB only)
         var sc=0; for(var s=0;s<stars.length;++s){ var dx=x-stars[s][0],dy=y-stars[s][1]; sc+=stars[s][2]*Math.exp(-((dx*dx+dy*dy)/(2*1.2*1.2))); }
         ct[i]=bgC+sc; nb[i]=bgN+kTrue*sc+em; }
      var ctW=new ImageWindow(W,H,1,32,true,false,"CSK_CT_"+Math.floor(Math.random()*1e6));
      var nbW=new ImageWindow(W,H,1,32,true,false,"CSK_NB_"+Math.floor(Math.random()*1e6));
      ctW.mainView.beginProcess(UndoFlag_NoSwapFile); ctW.mainView.image.setSamples(ct,rect,0); ctW.mainView.endProcess();
      nbW.mainView.beginProcess(UndoFlag_NoSwapFile); nbW.mainView.image.setSamples(nb,rect,0); nbW.mainView.endProcess();
      var est=optCsEstimateKHighpass(nbW.mainView.image, ctW.mainView.image);
      nbW.forceClose(); ctW.forceClose();
      return [rnd(est.k), est.ok?1:0, (Math.abs(est.k-kTrue)<0.12)?1:0];   // recovers k_true ~0.7
   });

   // K) Crop geometry — pure clamp/fit/hit-test/resize math (guards the WCS-crop fixes)
   check("crop_geom", function(){
      var W=1000,H=800;
      var r1=optCropClampRect({x:-10,y:50,width:1200,height:300}, W,H);   // clamp x<0 + width overflow
      var r2=optCropClampRect({x:990,y:790,width:3,height:3}, W,H);       // enforce min size
      var fit1=optCropRectFitsImage({x:10,y:10,width:200,height:200}, W,H)?1:0;
      var fit2=optCropRectFitsImage({x:900,y:10,width:200,height:200}, W,H)?1:0;   // overflow -> 0
      var vp=optCropImgToViewport(400,300, 0.5, 20, 10, 1, 1);
      var rz=optCropResizeFromHandle({x:100,y:100,width:300,height:200}, OPT_CROP_HANDLE_BR, 500, 380, W,H);
      var hitTL=optCropHitTest({x:100,y:100,width:300,height:200}, 100,100, 1.0, 1,1);
      var hitIn=optCropHitTest({x:100,y:100,width:300,height:200}, 250,200, 1.0, 1,1);
      return [r1.x,r1.y,r1.width,r1.height, r2.x,r2.y,r2.width,r2.height, fit1,fit2,
              vp.x,vp.y, rz.x,rz.y,rz.width,rz.height, hitTL,hitIn];
   });

   // L) Recipe engine (F5) — normalize clamps/defaults + resolve override-vs-auto
   check("recipe_normalize", function(){
      var n=optRecipeNormalize({starReduce:5, structure:-1, detailAmount:0.42, foo:99});
      return [rnd(n.starReduce), rnd(n.structure), rnd(n.coreProtect), rnd(n.detailAmount), rnd(n.saturation),
              n.label==="nebula"?1:0, n.narrowband?1:0];   // [1,0,0.5,0.42,0.15,1,0]
   });
   check("recipe_resolve", function(){
      var stats={extendedFraction:0.10, concentrationIndex:1.5, starDensity:10000, narrowbandLikely:false};
      var over=optCabraResolveRecipe(stats, {recipe:{starReduce:0.8, structure:0.9, coreProtect:0.2, detailAmount:0.5, saturation:0.6, label:"galaxy", narrowband:true}});
      var auto=optCabraResolveRecipe(stats, null), autoB=optCabraBuildRecipe(stats);
      return [rnd(over.starReduce), rnd(over.structure), over.label==="galaxy"?1:0, over.narrowband?1:0,
              (auto.starReduce===autoB.starReduce && auto.structure===autoB.structure)?1:0];   // [0.8,0.9,1,1,1]
   });
   check("recipe_intensity", function(){
      var stats={extendedFraction:0.30, concentrationIndex:1.2, starDensity:20000, narrowbandLikely:false};
      var base=optCabraBuildRecipe(stats);
      var gentle=optCabraResolveRecipe(stats, {recipeIntensity:"gentle"});
      var punchy=optCabraResolveRecipe(stats, {recipeIntensity:"punchy"});
      var auto=optCabraResolveRecipe(stats, {recipeIntensity:"auto"});
      return [ rnd(optRecipeIntensityGain("gentle")), rnd(optRecipeIntensityGain("punchy")), rnd(optRecipeIntensityGain("nope")),
               rnd(gentle.structure), rnd(base.structure), rnd(punchy.structure),
               rnd(auto.structure - base.structure),             // 0 -> auto == base
               rnd(base.coreProtect - punchy.coreProtect) ];     // 0 -> coreProtect preserved
   });

   // L2) Analysis defaults (F6 v2) — pure projection of analysis stats -> manual controls
   check("analysis_defaults", function(){
      // nebula, clean (SNR=15 -> full colour); compact high-C (planetary); starfield, noisy
      var neb={extendedFraction:0.30, concentrationIndex:1.2, starDensity:20000, narrowbandLikely:false, noise:0.01, median:0.20, background:0.05};
      var pla={extendedFraction:0.01, concentrationIndex:5.0, starDensity:3000,  narrowbandLikely:false, noise:0.02, median:0.10, background:0.04};
      var stf={extendedFraction:0.01, concentrationIndex:1.0, starDensity:50000, narrowbandLikely:true,  noise:0.05, median:0.08, background:0.06};
      var dn=optAnalysisDefaults(neb), dp=optAnalysisDefaults(pla), ds=optAnalysisDefaults(stf);
      function ot(s){ return {galaxy:0,nebula:1,globular:2,planetary:3}[s.detailObjType]; }
      return [ rnd(dn.starRedStrength), ot(dn), dn.detailObjIntensity, rnd(dn.colorMixerStrength), rnd(dn.snr),
               ot(dp), dp.detailObjIntensity, rnd(dp.colorMixerStrength),
               ot(ds), ds.narrowband?1:0, rnd(ds.colorMixerStrength) ];
   });

   // M) Quality metrics (F7) — pure image-quality statistics
   check("quality_metrics", function(){
      var win=synthRGB(W,H); var m=optQualityMetrics(win.mainView); var txt=optQualityMetricsText(m); win.forceClose();
      return [m.width, m.height, m.channels, rnd(m.background), rnd(m.median), rnd(m.noise), rnd(m.snr),
              rnd(m.saturationPct), rnd(m.dynamicRange),
              rnd(m.channelMedians[0]), rnd(m.channelMedians[1]), rnd(m.channelMedians[2]), txt.length];
   });

   // N) Multi-format export (F7) — pure extension map + real TIFF write/readback
   check("export_format", function(){
      function f(p){ var s=optExportFormatForPath(p); return s.format+"/"+s.bits+(s.float?"f":""); }
      return [ f("a.tif"), f("a.tiff"), f("a.png"), f("a.jpg"), f("a.jpeg"), f("a.fits"), f("a.fit"), f("a.xisf"), f("a.zzz") ];
   });
   check("export_write", function(){
      var win=synthRGB(64,48), tmp=DIR+"_export_test.tif";
      var spec=optExportViewToFile(win.mainView, tmp), ok=File.exists(tmp)?1:0, w2=0,h2=0;
      try { var rw=ImageWindow.open(tmp); if(rw&&rw.length){ w2=rw[0].mainView.image.width; h2=rw[0].mainView.image.height; rw[0].forceClose(); } } catch(e){}
      try { File.remove(tmp); } catch(e2){}
      win.forceClose();
      return [ok, spec.bits, w2, h2];   // [1,16,64,48]
   });

   // O) Native denoise fallback (F7) — pure denoiser-selection logic
   check("cabra_denoise_choice", function(){
      function c(m,n,p){ return optCabraDenoiseChoice(m,n,p); }
      return [ c("AUTO",true,true), c("AUTO",false,true), c("AUTO",false,false),
               c("NONE",true,true), c("PRISM",false,false), c("NXT",false,true),
               c("PRISM",false,true), c("AUTO",true,false) ];
      // ["NXT","PRISM","TGV","NONE","TGV","PRISM","PRISM","NXT"]
   });

   // P) Mask Maker (F7) — dispatch over the tiled mask builders (range + color)
   check("mask_make", function(){
      var win=synthRGB(W,H);
      var mr=optMakeMask(win.mainView, {type:"range", low:0.1, high:0.5, fuzz:0.1, modeIdx:1, smooth:2});
      var fpr=viewFp(mr); optCloseView(mr);
      var mc=optMakeMask(win.mainView, {type:"color", hue:120, hueRange:40, satLow:0.05, smooth:2});
      var fpc=viewFp(mc); optCloseView(mc);
      win.forceClose();
      return fpr.concat(fpc);
   });

   // Q) Diag layer (F3-full) — bounded ring buffer + guaranteed-close window scope
   check("diag_layer", function(){
      var sLog=OPT_DIAG_LOG, sMax=OPT_DIAG_MAX; OPT_DIAG_LOG=[]; OPT_DIAG_MAX=5;
      for(var i=0;i<8;++i) optDiagError("stage"+i, new Error("err"+i), "ctx"+i);
      var capped=OPT_DIAG_LOG.length, firstStage=OPT_DIAG_LOG[0].stage, cnt=optDiagCount();
      var txtLines=optDiagText(3).split("\n").length;
      optDiagClear(); var afterClear=optDiagCount();
      OPT_DIAG_LOG=sLog; OPT_DIAG_MAX=sMax;
      return [capped, firstStage==="stage3"?1:0, cnt, txtLines, afterClear];   // [5,1,5,3,0]
   });
   check("diag_with_window", function(){
      var before=ImageWindow.windows.length;
      var r=optWithTempWindow(function(){ return new ImageWindow(8,8,1,32,false,false,"DIAG_TW_"+Math.floor(Math.random()*1e6)); },
                              function(w){ return w.mainView.image.width; });
      var midLeak=ImageWindow.windows.length-before;
      var threw=0;
      try { optWithTempWindow(function(){ return new ImageWindow(8,8,1,32,false,false,"DIAG_TW2_"+Math.floor(Math.random()*1e6)); },
                              function(w){ throw new Error("boom"); }); } catch(e){ threw=1; }
      var afterLeak=ImageWindow.windows.length-before;
      return [r, midLeak, threw, afterLeak];   // [8,0,1,0]
   });

   // F3 window-lifecycle guard: every covered path must leave NO orphan windows.
   check("window_leak", function(){ return [ImageWindow.windows.length - winBefore]; });

   // ---- compare vs baseline or capture ----
   var nChecks=0; for (var k in results) nChecks++;
   if (!File.exists(BASE)) {
      File.writeTextFile(BASE, JSON.stringify(results, null, 1));
      L("BASELINE CAPTURED: " + nChecks + " checks -> " + BASE);
      for (var k2 in results) L("  " + k2 + " = " + JSON.stringify(results[k2]));
   } else {
      var base = JSON.parse(File.readTextFile(BASE));
      var pass=0, fail=0;
      for (var k3 in results){
         var cur=results[k3], ref=base[k3], ok=true, why="";
         if (ref===undefined){ ok=false; why="(new check, no baseline)"; }
         else if (typeof cur==="string" || typeof ref==="string"){ ok=(cur===ref); if(!ok)why="cur="+cur+" ref="+ref; }
         else if (!cur||!ref||cur.length!==ref.length){ ok=false; why="length/shape"; }
         else { for (var i=0;i<cur.length;++i){ var a=cur[i],b2=ref[i];
                  // string elements: exact match (Math.abs(str-str)=NaN, NaN>tol is false -> would never flag a diff);
                  // numeric elements: tolerance.
                  if (typeof a==="string" || typeof b2==="string"){ if(a!==b2){ ok=false; why="["+i+"] "+a+" vs "+b2; break; } }
                  else if (Math.abs(a-b2) > TOL_ABS + TOL_REL*Math.abs(b2)){ ok=false; why="["+i+"] "+a+" vs "+b2; break; } } }
         if (ok){ pass++; } else { fail++; L("  FAIL " + k3 + " " + why); }
      }
      L("REGRESSION: " + pass + " pass, " + fail + " fail (of " + nChecks + ")");
      L(fail===0 ? "RESULT: GREEN" : "RESULT: RED");
   }
   L("DONE.");
} catch(e){ L("FATAL: " + e.message + (e.stack?("\n"+e.stack):"")); }
