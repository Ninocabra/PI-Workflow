#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Reusable headless test for the REAL Detail & Contrast engine (7 algorithms).
var DIR = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/";
var LOG = DIR + "cm_detail_suite.log";
var BUF = "", PASS = 0, FAIL = 0;
function L(s){ BUF += String(s)+"\n"; try { File.writeTextFile(LOG, BUF); } catch(e){} }
function check(n,c,d){ if(c){PASS++;L("PASS  "+n+(d?("  ["+d+"]"):""));}else{FAIL++;L("FAIL  "+n+(d?("  ["+d+"]"):""));} }

var STAR_X = 64, STAR_Y = 64;   // location of an isolated bright "star"
function makeTest(){
   var w=256,h=256;var win=new ImageWindow(w,h,3,32,true,true,"dtest");var v=win.mainView,img=v.image,rect=new Rect(0,0,w,h);
   var R=new Float32Array(w*h),G=new Float32Array(w*h),B=new Float32Array(w*h);
   var cx=w/2,cy=h/2;
   for(var y=0;y<h;++y)for(var x=0;x<w;++x){var i=y*w+x;
      var dx=x-cx,dy=y-cy,r2=(dx*dx+dy*dy)/(0.18*w*w);
      var val=0.28+0.25*Math.exp(-r2);             // nebula
      val+=0.025*Math.sin(x*0.6)*Math.sin(y*0.6);  // fine texture
      if(val<0)val=0;if(val>1)val=1;R[i]=val;G[i]=val;B[i]=val;}
   // isolated bright stars
   var stars=[[STAR_X,STAR_Y],[180,90],[120,200],[210,210]];
   for(var s=0;s<stars.length;++s){var i2=stars[s][1]*w+stars[s][0];R[i2]=0.95;G[i2]=0.95;B[i2]=0.95;}
   v.beginProcess(UndoFlag_NoSwapFile);img.setSamples(R,rect,0);img.setSamples(G,rect,1);img.setSamples(B,rect,2);v.endProcess();return v;
}
function meanAbsDiff(va,vb){var ia=va.image,ib=vb.image,w=ia.width,h=ia.height,rect=new Rect(0,0,w,h);
   var A=new Float32Array(w*h),Bf=new Float32Array(w*h);ia.getSamples(A,rect,0);ib.getSamples(Bf,rect,0);
   var s=0;for(var i=0;i<A.length;++i)s+=Math.abs(A[i]-Bf[i]);return s/A.length;}
function stdAround(v,cx,cy,rad){var img=v.image,w=img.width,h=img.height;var vals=[],sum=0,n=0;
   for(var y=cy-rad;y<=cy+rad;++y)for(var x=cx-rad;x<=cx+rad;++x){if(x<0||y<0||x>=w||y>=h)continue;var s=img.sample(x,y,0);vals.push(s);sum+=s;++n;}
   var m=sum/n,vv=0;for(var i=0;i<n;++i)vv+=(vals[i]-m)*(vals[i]-m);return Math.sqrt(vv/n);}
function sampleAt(v,x,y){return v.image.sample(x,y,0);}
function clone(v,id){return optCloneView(v,id,false);}

function run(){
   L("engine: detail run="+(typeof optRunDetailOnView)+" def="+(typeof optDetailDefaultState)+" guided="+(typeof optDetailGuidedLuma)+" atrous="+(typeof optDetailAtrousLuma));
   var base=makeTest();
   var algos=["localContrast","multiscale","edgeAware","highPass","mmtTexture","dehaze"];
   for(var a=0;a<algos.length;++a){
      var st=optDetailDefaultState(); st.algoId=algos[a];
      // push params to a clearly visible level
      st.lcAmount=0.6;st.mdFine=0.8;st.mdMedium=0.5;st.eaAmount=1.2;st.hpAmount=1.0;st.srStrength=0.7;st.txAmount=1.0;st.dhStrength=0.9;
      var t=clone(base,"d_"+algos[a]);
      var err=null;
      try{ optRunDetailOnView(t,st); }catch(e){ err=e.message; }
      check("run "+algos[a]+" no error", err===null, err||"ok");
      if(err===null){
         var d=meanAbsDiff(base,t);
         check(algos[a]+" changed image", d>0.0008, "meanAbsDiff="+d.toFixed(5));
      }
      try{t.window.forceClose();}catch(e){}
   }
   // Targeted: Star Reduction (now optStarReduceOnView, used by Stretching > Stars)
   // lowers the isolated star peak but protects a dim point.
   var tSR=clone(base,"sr");optStarReduceOnView(tSR,0.7,2);
   var before=sampleAt(base,STAR_X,STAR_Y),after=sampleAt(tSR,STAR_X,STAR_Y);
   check("star reduction lowers star peak", after<before-0.08, "before="+before.toFixed(3)+" after="+after.toFixed(3));
   check("star reduction func exists", typeof optStarReduceOnView==="function", "");
   try{tSR.window.forceClose();}catch(e){}
   // Targeted: Local Contrast increases LARGE-scale contrast (bright centre vs dark corner).
   function avgAround(v,cx,cy,rad){var img=v.image,w=img.width,h=img.height,s=0,n=0;for(var y=cy-rad;y<=cy+rad;++y)for(var x=cx-rad;x<=cx+rad;++x){if(x<0||y<0||x>=w||y>=h)continue;s+=img.sample(x,y,0);++n;}return s/n;}
   var stLC=optDetailDefaultState();stLC.algoId="localContrast";stLC.lcAmount=0.30;stLC.lcRadius=60;
   var tLC=clone(base,"lc");optRunDetailOnView(tLC,stLC);
   var cB=avgAround(base,128,128,6)-avgAround(base,30,30,6);
   var cA=avgAround(tLC,128,128,6)-avgAround(tLC,30,30,6);
   check("local contrast raises large-scale contrast", cA>cB, "contrastBefore="+cB.toFixed(4)+" after="+cA.toFixed(4));
   try{tLC.window.forceClose();}catch(e){}
   // Targeted: empty/zero params -> negligible change (high-pass amount 0).
   var stZ=optDetailDefaultState();stZ.algoId="highPass";stZ.hpAmount=0;
   var tZ=clone(base,"z");optRunDetailOnView(tZ,stZ);
   check("zero-amount high-pass ~ no change", meanAbsDiff(base,tZ)<0.0005, "d="+meanAbsDiff(base,tZ).toFixed(6));
   try{tZ.window.forceClose();}catch(e){}
   try{base.window.forceClose();}catch(e){}
   L("");L("SUMMARY  PASS="+PASS+"  FAIL="+FAIL);
}
try{run();}catch(e){L("ERROR: "+e.message+(e.stack?("\n"+e.stack):""));}
