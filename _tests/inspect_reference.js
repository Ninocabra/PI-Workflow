#engine v8
var SRC="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/Collinder 34 COPIADO/Imagenes/Collinder 34 Final_5.tif";
var PNG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/ref_collinder34.png";
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/inspect_reference.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
function pctl(view,c){ var im=view.image,w=im.width,h=im.height,n=w*h,a=new Float32Array(n);
  im.getSamples(a,new Rect(0,0,w,h),c); var s=[],st=Math.max(1,(n/50000)|0);
  for(var i=0;i<n;i+=st)s.push(a[i]); s.sort(function(x,y){return x-y;});
  return {bg:s[(s.length*0.05)|0], med:s[(s.length*0.5)|0], hi:s[(s.length*0.999)|0]}; }
try{
  if(!File.exists(SRC)){L("MISSING "+SRC);}else{
    var win=ImageWindow.open(SRC)[0],v=win.mainView,im=v.image;
    L("dims "+im.width+"x"+im.height+" ch="+im.numberOfChannels);
    var names=["R","G","B"];
    for(var c=0;c<Math.min(3,im.numberOfChannels);++c){var p=pctl(v,c);
      L(names[c]+": bg(5%)="+p.bg.toFixed(4)+" median="+p.med.toFixed(4)+" hi(99.9%)="+p.hi.toFixed(4));}
    var k=Math.ceil(Math.max(im.width,im.height)/1200);
    if(k>1){var P=new IntegerResample;P.zoomFactor=-k;P.downsamplingMode=0;P.executeOn(v);}
    win.saveAs(PNG,false,false,false,false); L("saved PNG "+PNG);
    win.forceClose();
  }
  L("DONE");
}catch(e){L("ERROR: "+e.message);}
