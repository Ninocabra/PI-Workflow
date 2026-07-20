#engine v8
// Objective look-distance bench: compares CabraMagic outputs to the user's reference
// final using framing-robust distribution metrics (per-channel bg/median/p99 + chroma).
var SAMP="C:/Users/ninoc/Documents/PixInsight/CabraSpace/Pagina Web/Imagenes Prueba/NB_blend_samples/";
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/compare_to_reference.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var REF="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/Imagenes/Collinder 34 Final_5.tif";
var MINE=[{name:"my_HOO",path:SAMP+"Dispatch_Collinder34_HOO.xisf"},{name:"my_SHO",path:SAMP+"Dispatch_Collinder34_SHO.xisf"}];

function feats(path){
   if(!File.exists(path))return null;
   var w=ImageWindow.open(path)[0],v=w.mainView,im=v.image;
   var k=Math.ceil(Math.max(im.width,im.height)/1200);
   if(k>1){var P=new IntegerResample;P.zoomFactor=-k;P.downsamplingMode=0;P.executeOn(v);}
   im=v.image;var W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H);
   var ch=[new Float32Array(n),new Float32Array(n),new Float32Array(n)];
   for(var c=0;c<3;c++)im.getSamples(ch[c],rc,c);
   function pct(a,p){var s=[],st=Math.max(1,(n/40000)|0);for(var i=0;i<n;i+=st)s.push(a[i]);s.sort(function(x,y){return x-y;});return s[Math.min(s.length-1,(s.length*p)|0)];}
   var f={bg:[],med:[],p99:[]};
   for(var c2=0;c2<3;c2++){f.bg.push(pct(ch[c2],0.05));f.med.push(pct(ch[c2],0.5));f.p99.push(pct(ch[c2],0.99));}
   // mean chroma over signal pixels
   var cs=0,cc=0,st2=Math.max(1,(n/100000)|0);
   for(var i2=0;i2<n;i2+=st2){var r=ch[0][i2],g=ch[1][i2],b=ch[2][i2];var mx=Math.max(r,g,b);if(mx>0.05){cs+=(mx-Math.min(r,g,b))/mx;cc++;}}
   f.chroma=cc?cs/cc:0;
   w.forceClose();
   return f;
}
function show(tag,f){
   if(!f){L(tag+": MISSING");return;}
   L(tag+":");
   L("  bg   R/G/B = "+f.bg[0].toFixed(3)+" / "+f.bg[1].toFixed(3)+" / "+f.bg[2].toFixed(3));
   L("  med  R/G/B = "+f.med[0].toFixed(3)+" / "+f.med[1].toFixed(3)+" / "+f.med[2].toFixed(3)+"   (ratio R:B = "+(f.med[0]/Math.max(1e-4,f.med[2])).toFixed(2)+")");
   L("  p99  R/G/B = "+f.p99[0].toFixed(3)+" / "+f.p99[1].toFixed(3)+" / "+f.p99[2].toFixed(3));
   L("  chroma     = "+f.chroma.toFixed(3));
}
function dist(a,b){var d=0;for(var i=0;i<3;i++){d+=Math.pow(a.bg[i]-b.bg[i],2)+Math.pow(a.med[i]-b.med[i],2)+0.5*Math.pow(a.p99[i]-b.p99[i],2);}d+=Math.pow(a.chroma-b.chroma,2);return Math.sqrt(d);}
try{
   var ref=feats(REF); show("REFERENCE (Final_5)",ref);
   L("");
   for(var m=0;m<MINE.length;m++){var f=feats(MINE[m].path);show(MINE[m].name,f);if(ref&&f)L("  -> distance to ref = "+dist(ref,f).toFixed(4));L("");}
   L("DONE");
}catch(e){L("ERROR: "+e.message);}
