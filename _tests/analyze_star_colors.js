#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
var DIR="C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/NB_blend_samples/";
var FILES=["Collinder34_SOL1_HOO.xisf","Collinder34_SOL2_SHO.xisf"];
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/analyze_star_colors.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function analyze(path){
   var w=ImageWindow.open(path)[0],v=w.mainView,im=v.image,W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H);
   var R=new Float32Array(n),G=new Float32Array(n),Bb=new Float32Array(n);
   im.getSamples(R,rc,0);im.getSamples(G,rc,1);im.getSamples(Bb,rc,2);
   var Y=new Float32Array(n); for(var i=0;i<n;i++)Y[i]=0.2126*R[i]+0.7152*G[i]+0.0722*Bb[i];
   var bg=optCmBoxBlur(Y,W,H,6);   // local background (radius 6)
   var sr=0,sg=0,sb=0,wsum=0,cnt=0;
   for(var y=1;y<H-1;y++){var rb=y*W;for(var x=1;x<W-1;x++){var idx=rb+x,vv=Y[idx];
      if(vv<0.35)continue;
      if(vv-bg[idx]<0.25)continue;                 // PROMINENCE: stand out from nebula
      if(!(vv>=Y[idx-1]&&vv>=Y[idx+1]&&vv>=Y[idx-W]&&vv>=Y[idx+W]))continue;
      var wt=vv-bg[idx];sr+=R[idx]*wt;sg+=G[idx]*wt;sb+=Bb[idx]*wt;wsum+=wt;cnt++;}}
   if(wsum<=0){L(path.replace(DIR,"")+": no isolated stars");w.forceClose();return;}
   var mr=sr/wsum,mg=sg/wsum,mb=sb/wsum,mx=Math.max(mr,mg,mb);
   L(path.replace(DIR,""));
   L("  isolated stars="+cnt+"  meanRGB=("+mr.toFixed(3)+","+mg.toFixed(3)+","+mb.toFixed(3)+")  hue/max=("+(mr/mx).toFixed(2)+","+(mg/mx).toFixed(2)+","+(mb/mx).toFixed(2)+")");
   var verdict="neutral/white";
   if(mb>mr*1.2&&mb>mg*1.1)verdict="BLUE";
   else if(mr>mg*1.15&&mb>mg*1.15)verdict="MAGENTA";
   else if(mr>mb*1.2&&mr>mg*1.1)verdict="RED/orange";
   L("  -> "+verdict);
   w.forceClose();
}
try{for(var f=0;f<FILES.length;f++){var p=DIR+FILES[f];if(File.exists(p))analyze(p);else L("missing "+FILES[f]);}L("DONE");}
catch(e){L("ERROR: "+e.message);}
