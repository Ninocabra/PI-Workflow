#engine v8
// Measures the SPREAD of the user's OWN multiple final versions per target, to quantify
// the artistic range and a central (median) target for the auto-recipe to aim at.
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/ref_spread.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
var GROUPS=[
 {n:"Collinder34 (neb)", files:[
   NER+"Collinder 34 COPIADO/Imagenes/Collinder 34 Final.tif",
   NER+"Collinder 34 COPIADO/Imagenes/Collinder 34 Final_2.tif",
   NER+"Collinder 34 COPIADO/Imagenes/Collinder 34 Final_3.tif",
   NER+"Collinder 34 COPIADO/Imagenes/Collinder 34 Final_4.tif",
   NER+"Collinder 34 COPIADO/Imagenes/Collinder 34 Final_5.tif"]},
 {n:"Cadwell5/IC342 (galaxy)", files:[
   NER+"Cadwell 5 COPIADO/Imagenes/Imagenes 3/Cadwell 5 Final.tif",
   NER+"Cadwell 5 COPIADO/Imagenes/Imagenes 3/Cadwell 5 Final_2.tif",
   NER+"Cadwell 5 COPIADO/Imagenes/Imagenes 3/TEST2/Cadwell5_Final_3.tif",
   NER+"Cadwell 5 COPIADO/Imagenes/Imagenes 3/TEST2/Cadwell5_Final_4.tif"]},
 {n:"M82 (galaxy)", files:[
   NER+"M82/WBPP2/Images/M82_Final_1.tif", NER+"M82/WBPP2/Images/M82_Final_2.tif",
   NER+"M82/WBPP2/Images/M82_Final_3.tif", NER+"M82/WBPP2/Images/M82_Final_4.tif"]},
 {n:"LDu2 (neb)", files:[
   NER+"LDu 2 COPIADO/Imagenes/final.png", NER+"LDu 2 COPIADO/Imagenes/LDu_2_final_2.png"]}
];
function feat(path){
   if(!File.exists(path))return null;
   var w; try{w=ImageWindow.open(path)[0];}catch(e){return null;}
   var v=w.mainView; var k=Math.ceil(Math.max(v.image.width,v.image.height)/1000);
   if(k>1){var P=new IntegerResample;P.zoomFactor=-k;P.downsamplingMode=0;P.executeOn(v);}
   var im=v.image,W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H);
   var c=[new Float32Array(n),new Float32Array(n),new Float32Array(n)];for(var i=0;i<3;i++)im.getSamples(c[i],rc,i);
   function pct(a,p){var s=[],st=Math.max(1,(n/40000)|0);for(var j=0;j<n;j+=st)s.push(a[j]);s.sort(function(x,y){return x-y;});return s[Math.min(s.length-1,(s.length*p)|0)];}
   var medR=pct(c[0],0.5),medB=pct(c[2],0.5);
   var Y=new Float32Array(n);for(var q=0;q<n;q++)Y[q]=0.2126*c[0][q]+0.7152*c[1][q]+0.0722*c[2][q];
   var cs=0,cc=0,st2=Math.max(1,(n/60000)|0);for(var m=0;m<n;m+=st2){var r=c[0][m],g=c[1][m],b=c[2][m],mx=Math.max(r,g,b);if(mx>0.05){cs+=(mx-Math.min(r,g,b))/mx;cc++;}}
   w.forceClose();
   return {chroma:cc?cs/cc:0, rb:medR/Math.max(1e-4,medB), lum:pct(Y,0.5)};
}
function stats(arr,key){var v=arr.map(function(f){return f[key];}).sort(function(a,b){return a-b;});return {min:v[0],med:v[(v.length/2)|0],max:v[v.length-1]};}
try{
   for(var g=0;g<GROUPS.length;g++){var G=GROUPS[g];var fs=[];
      for(var i=0;i<G.files.length;i++){var f=feat(G.files[i]);if(f){fs.push(f);}}
      if(!fs.length){L(G.n+": no refs");continue;}
      var ch=stats(fs,"chroma"),rb=stats(fs,"rb"),lu=stats(fs,"lum");
      L(G.n+"  ("+fs.length+" versiones)");
      L("  chroma min/med/max = "+ch.min.toFixed(3)+" / "+ch.med.toFixed(3)+" / "+ch.max.toFixed(3));
      L("  R:B    min/med/max = "+rb.min.toFixed(2)+" / "+rb.med.toFixed(2)+" / "+rb.max.toFixed(2));
      L("  lum    min/med/max = "+lu.min.toFixed(2)+" / "+lu.med.toFixed(2)+" / "+lu.max.toFixed(2));
   }
   L("DONE");
}catch(e){L("ERR: "+e.message);}
