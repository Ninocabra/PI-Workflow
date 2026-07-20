#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// Parameter optimization bench: generates a neutral base (Collinder34 SHO) once, then
// sweeps saturation x red-balance on a small clone, scoring each against the user's
// reference final (Collinder 34 Final_5) with framing-robust distribution metrics.
var MDIR="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/WBPP/master/";
var REF ="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/Imagenes/Collinder 34 Final_5.tif";
var LOG ="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/opt_bench.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function ch(f,e){return MDIR+"masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){var w=ImageWindow.open(p);return w[0].mainView;}
function downsmall(v){var k=Math.ceil(Math.max(v.image.width,v.image.height)/1100);if(k>1){var P=new IntegerResample;P.zoomFactor=-k;P.downsamplingMode=0;P.executeOn(v);}}
function feats(v){var im=v.image,W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H);var c=[new Float32Array(n),new Float32Array(n),new Float32Array(n)];for(var i=0;i<3;i++)im.getSamples(c[i],rc,i);
   function pct(a,p){var s=[],st=Math.max(1,(n/40000)|0);for(var j=0;j<n;j+=st)s.push(a[j]);s.sort(function(x,y){return x-y;});return s[Math.min(s.length-1,(s.length*p)|0)];}
   var f={bg:[],med:[],p99:[]};for(var k=0;k<3;k++){f.bg.push(pct(c[k],0.05));f.med.push(pct(c[k],0.5));f.p99.push(pct(c[k],0.99));}
   var cs=0,cc=0,st2=Math.max(1,(n/80000)|0);for(var m=0;m<n;m+=st2){var r=c[0][m],g=c[1][m],b=c[2][m],mx=Math.max(r,g,b);if(mx>0.05){cs+=(mx-Math.min(r,g,b))/mx;cc++;}}f.chroma=cc?cs/cc:0;return f;}
function dist(a,b){var d=0;for(var i=0;i<3;i++)d+=Math.pow(a.bg[i]-b.bg[i],2)+Math.pow(a.med[i]-b.med[i],2)+0.5*Math.pow(a.p99[i]-b.p99[i],2);d+=2*Math.pow(a.chroma-b.chroma,2);return Math.sqrt(d);}
function refFeats(){var w=ImageWindow.open(REF)[0],v=w.mainView;downsmall(v);var f=feats(v);w.forceClose();return f;}

try{
   var ref=refFeats();
   L("REF: bg("+ref.bg.map(function(x){return x.toFixed(2);}).join(",")+") med("+ref.med.map(function(x){return x.toFixed(2);}).join(",")+") chroma="+ref.chroma.toFixed(3)+" R:B="+(ref.med[0]/ref.med[2]).toFixed(2));
   // base (neutral saturation), then downsample small for fast sweep
   var H=op(ch("H","300.00s")),O=op(ch("O","300.00s")),S=op(ch("S","300.00s")),R=op(ch("R","180.00s")),G=op(ch("G","180.00s")),Bc=op(ch("B","180.00s"));
   var base=optCabraComposeRGBNB(H,O,S,R,G,Bc,"SHO",{tag:"optb",saturation:1.0,hueShift:0,redBoost:1.0});
   downsmall(base); L("base ready ("+base.image.width+"x"+base.image.height+")");
   var sats=[1.4,1.8,2.2,2.6], reds=[1.0,1.3,1.6,2.0];
   var best=null;
   for(var si=0;si<sats.length;si++)for(var ri=0;ri<reds.length;ri++){
      var c=optCabraClonePM(base,"sw_"+si+"_"+ri);
      optCabraSaturate(c,sats[si],-0.012); optCabraRedBalance(c,reds[ri]); optCabraSetBlackPoint(c,0.10);
      var f=feats(c),dd=dist(ref,f);
      L("sat="+sats[si]+" red="+reds[ri]+" -> chroma="+f.chroma.toFixed(3)+" R:B="+(f.med[0]/Math.max(1e-4,f.med[2])).toFixed(2)+" dist="+dd.toFixed(4));
      if(!best||dd<best.d)best={d:dd,sat:sats[si],red:reds[ri],chroma:f.chroma,rb:f.med[0]/Math.max(1e-4,f.med[2])};
      c.window.forceClose();
   }
   L("");L("BEST: sat="+best.sat+" red="+best.red+" dist="+best.d.toFixed(4)+" (chroma="+best.chroma.toFixed(3)+" R:B="+best.rb.toFixed(2)+" vs ref chroma="+ref.chroma.toFixed(3)+" R:B="+(ref.med[0]/ref.med[2]).toFixed(2)+")");
   L("DONE");
}catch(e){L("ERROR: "+e.message+(e.stack?("\n"+e.stack):""));}
