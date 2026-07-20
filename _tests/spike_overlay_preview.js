#engine v8
#include <pjsr/UndoFlag.jsh>
#include <pjsr/StdIcon.jsh>
#include <pjsr/StdButton.jsh>
// ============================================================================
// spike_overlay_preview.js — Fase 0 / feature #13 (overlay de anotacion)
// ----------------------------------------------------------------------------
// SPIKE DESECHABLE y AUTOCONTENIDO (IIFE + clase ES6, patron aprendido en el
// spike de Aladin). No incluye "PI Workflow.js", no toca el script principal,
// no incrementa el build.
//
// QUE VALIDA: que window.celestialToImage() coloca los objetos del catalogo
// OpenNGC sobre los pixeles correctos de la imagen. Toma la primera ventana con
// solucion astrometrica, hace cone-search en OpenNGC por su FoV, y dibuja
// markers + etiquetas (con declutter anti-solape) sobre el render STF de la
// imagen, en un dialogo. Si los markers caen sobre las galaxias/nebulosas
// reales -> el enfoque del overlay esta validado.
//
// REQUISITO: tener abierta al menos UNA imagen con solucion astrometrica
// (WCS). CÓMO: PixInsight -> SCRIPT -> Execute Script File... -> este fichero.
// ============================================================================

(function () {

var CATALOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/catalogs/NGC.csv";
var MAX_DIM = 1100;   // lado maximo del bitmap mostrado
var LABEL_CAP = 60;   // tope duro de etiquetas (declutter)

// --- categoria + color (0xAARRGGBB) ----------------------------------------
function classify(t) {
   switch (t) {
      case "G": case "GPair": case "GTrpl": case "GGroup": return "Galaxias";
      case "PN": return "PN"; case "SNR": return "SNR";
      case "HII": case "Neb": case "RfN": case "EmN": case "Cl+N": return "Nebulosas";
      case "DrkN": return "Neb.oscura";
      case "OCl": return "C.abierto"; case "GCl": return "C.globular";
      case "*": case "**": case "*Ass": return "Estrellas";
      case "Nova": return "Nova";
      case "Dup": case "NonEx": case "Other": case "": return null;
      default: return "Otros";
   }
}
var CATCOLOR = {
   "Galaxias": 0xffffc850, "Nebulosas": 0xff6ec8ff, "PN": 0xff8affc0,
   "SNR": 0xffff8080, "C.abierto": 0xffffe080, "C.globular": 0xffff80c0,
   "Estrellas": 0xffb0b0b0, "Neb.oscura": 0xff9090a0, "Nova": 0xffffffff, "Otros": 0xffa0a0a0
};

function hms(s){ if(!s)return null; var p=s.split(":"); if(p.length<3)return null;
   var h=+p[0],m=+p[1],x=+p[2]; return isFinite(h+m+x)?(h+m/60+x/3600)*15:null; }
function dms(s){ if(!s)return null; var g=s.trim().charAt(0)==="-"?-1:1;
   var p=s.replace(/^[+-]/,"").split(":"); if(p.length<3)return null;
   var d=+p[0],m=+p[1],x=+p[2]; return isFinite(d+m+x)?g*(d+m/60+x/3600):null; }
function angSep(r1,d1,r2,d2){ var R=Math.PI/180;
   var a=Math.pow(Math.sin((d2-d1)*R/2),2)+Math.cos(d1*R)*Math.cos(d2*R)*Math.pow(Math.sin((r2-r1)*R/2),2);
   return 2*Math.asin(Math.min(1,Math.sqrt(a)))/R; }

function readCatalog() {
   var txt = File.readTextFile(CATALOG);
   var lines = txt.split(/\r?\n/);
   var head = lines[0].split(";"); var ix={};
   for (var i=0;i<head.length;++i) ix[head[i].replace(/^\s+|\s+$/g,"")]=i;
   var out=[];
   for (var L=1;L<lines.length;++L){
      if(!lines[L])continue; var c=lines[L].split(";");
      var t=(c[ix["Type"]]||"").replace(/^\s+|\s+$/g,""); var cat=classify(t);
      if(cat===null)continue;
      var ra=hms(c[ix["RA"]]), dec=dms(c[ix["Dec"]]); if(ra===null||dec===null)continue;
      var v=parseFloat(c[ix["V-Mag"]]), b=parseFloat(c[ix["B-Mag"]]);
      var mag=isFinite(v)?v:(isFinite(b)?b:null);
      var maj=parseFloat(c[ix["MajAx"]]);
      var cn=(c[ix["Common names"]]||"").split(",")[0].replace(/^\s+|\s+$/g,"");
      out.push({name:(c[ix["Name"]]||"").replace(/^\s+|\s+$/g,""), cat:cat, ra:ra, dec:dec,
                mag:mag, size:isFinite(maj)?maj:null, label: cn || (c[ix["Name"]]||"").replace(/^\s+|\s+$/g,"")});
   }
   return out;
}

function firstSolvedWindow() {
   var ws = ImageWindow.windows;
   for (var i=0;i<ws.length;++i){ try{ if(ws[i].hasAstrometricSolution) return ws[i]; }catch(e){} }
   return null;
}

// Auto-stretch (STF estandar de PixInsight) sobre un CLON, para que render()
// muestre la imagen visible (no lineal/negra). No toca la vista original.
function mtfFn(m,x){ if(x<=0)return 0; if(x>=1)return 1; if(Math.abs(x-m)<1e-9)return 0.5;
   return ((m-1)*x)/(((2*m-1)*x)-m); }
function renderAutoStretched(view){
   var img=view.image, w=img.width, h=img.height, n=img.numberOfChannels;
   var tmp=null;
   try {
      tmp=new ImageWindow(w,h,n,32,true,img.isColor,"spike_tmp_"+Math.floor(Math.random()*1e6));
      tmp.mainView.beginProcess(UndoFlag_NoSwapFile);
      tmp.mainView.image.assign(img);
      tmp.mainView.endProcess();
      var ti=tmp.mainView.image, sc=-2.8, tb=0.25, rows=[];
      for (var c=0;c<n;++c){
         ti.firstSelectedChannel=c; ti.lastSelectedChannel=c;
         var med=ti.median(), dev=ti.avgDev();
         var c0=Math.max(0,Math.min(1, med + sc*dev));
         rows.push([c0, mtfFn(tb, med-c0), 1, 0, 1]);
      }
      ti.resetSelections();
      var H=new HistogramTransformation;
      if (n>=3) H.H=[rows[0],rows[1],rows[2],[0,0.5,1,0,1],[0,0.5,1,0,1]];
      else      H.H=[[0,0.5,1,0,1],[0,0.5,1,0,1],[0,0.5,1,0,1],rows[0],[0,0.5,1,0,1]];
      H.executeOn(tmp.mainView, false);
      var bmp=tmp.mainView.image.render();
      tmp.forceClose(); tmp=null;
      return bmp;
   } catch(e){
      console.warningln("auto-stretch fallo, render lineal: " + e);
      try{ if(tmp) tmp.forceClose(); }catch(e2){}
      return view.image.render();
   }
}

function buildAnnotatedBitmap(win, rows, report) {
   var view = win.mainView, W = view.image.width, H = view.image.height;
   var center = win.imageToCelestial(W/2, H/2);
   // round-trip check
   var back = win.celestialToImage(new Point(center.x, center.y));
   report.roundtrip = "centro img (" + (W/2).toFixed(0) + "," + (H/2).toFixed(0) + ") -> RA/Dec (" +
      center.x.toFixed(4) + "," + center.y.toFixed(4) + ") -> img (" + back.x.toFixed(1) + "," + back.y.toFixed(1) + ")";
   var corners=[win.imageToCelestial(0,0),win.imageToCelestial(W,0),win.imageToCelestial(0,H),win.imageToCelestial(W,H)];
   var radius=0; for (var k=0;k<4;++k) radius=Math.max(radius, angSep(center.x,center.y,corners[k].x,corners[k].y));

   // objetos realmente dentro del rectangulo de la imagen
   var vis=[];
   for (var i=0;i<rows.length;++i){
      var r=rows[i];
      if (angSep(center.x,center.y,r.ra,r.dec) > radius*1.05) continue;   // pre-filtro barato
      var p=win.celestialToImage(new Point(r.ra,r.dec));
      if (p.x<0||p.y<0||p.x>=W||p.y>=H) continue;
      r.px=p.x; r.py=p.y; vis.push(r);
   }
   report.fov = "FoV ~" + (radius*2).toFixed(2) + " deg (radio " + radius.toFixed(3) + "); objetos en imagen: " + vis.length;

   // prioridad: mas brillante y mas grande primero
   vis.sort(function(a,b){ return (a.mag==null?99:a.mag)-(b.mag==null?99:b.mag) || (b.size||0)-(a.size||0); });

   var full = renderAutoStretched(view);
   var sc = Math.min(1, MAX_DIM/Math.max(W,H));
   var bmp = (sc<1) ? full.scaledTo(Math.round(W*sc), Math.round(H*sc)) : full;

   var g = new Graphics(bmp);
   g.antialiasing = true;
   var font = new Font("Verdana"); try{ font.pixelSize = 12; }catch(e){}
   g.font = font;
   var placed=[], labels=0;
   function overlaps(x0,y0,x1,y1){ for(var i=0;i<placed.length;++i){ var q=placed[i];
      if(x0<q[2]&&x1>q[0]&&y0<q[3]&&y1>q[1]) return true; } return false; }
   for (var j=0;j<vis.length;++j){
      var o=vis[j]; var col=CATCOLOR[o.cat]||0xffa0a0a0;
      var sx=o.px*sc, sy=o.py*sc;
      g.pen=new Pen(col,1.5);
      g.drawEllipse(sx-6,sy-6,sx+6,sy+6);          // marker: siempre
      if (labels>=LABEL_CAP) continue;              // etiqueta: con declutter
      var tw=Math.round(o.label.length*7)+4, th=15;
      var lx=sx+8, ly=sy-th;
      if (lx+tw>bmp.width) lx=sx-8-tw;
      if (ly<0) ly=sy+2;
      if (overlaps(lx,ly,lx+tw,ly+th)) continue;
      placed.push([lx,ly,lx+tw,ly+th]);
      g.pen=new Pen(0xff000000,3); g.drawText(lx+2,ly+12,o.label);   // halo
      g.pen=new Pen(col,1);        g.drawText(lx+2,ly+12,o.label);
      ++labels;
   }
   g.end();
   report.labels = labels;
   report.total = vis.length;
   return bmp;
}

function SpikeMsg(t){ new MessageBox(t,"Spike overlay (#13)",StdIcon_Warning,StdButton_Ok).execute(); }

class SpikeOverlayDialog extends Dialog {
 constructor(bmp, report) {
   super();
   var self=this;
   this.windowTitle = "Spike #13 - overlay OpenNGC sobre imagen resuelta";
   this.userResizable = true;
   this.minWidth = Math.min(1200, Math.max(700, bmp.width+20));
   this.minHeight = Math.min(900, Math.max(560, bmp.height+90));

   this.info=new Label(this); this.info.useRichText=true; this.info.wordWrapping=true;
   this.info.text = "<b>Overlay OpenNGC.</b> " + report.fov + " · etiquetas dibujadas: " + report.labels +
      "/" + report.total + " (cap " + LABEL_CAP + ").<br/>Round-trip: " + report.roundtrip +
      " (deberia volver al centro). ¿Los circulos caen sobre los objetos reales?";

   this.canvas=new Control(this); this.canvas.__bmp=bmp;
   this.canvas.minWidth=bmp.width; this.canvas.minHeight=bmp.height;
   this.canvas.onPaint=function(){ var gg=new Graphics(this); try{ gg.drawBitmap(0,0,this.__bmp);}finally{gg.end();} };

   this.btnClose=new PushButton(this); this.btnClose.text="Cerrar"; this.btnClose.defaultButton=true;
   this.btnClose.onClick=function(){ self.ok(); };

   this.buttons=new HorizontalSizer; this.buttons.addStretch(); this.buttons.add(this.btnClose);
   this.sizer=new VerticalSizer; this.sizer.margin=8; this.sizer.spacing=8;
   this.sizer.add(this.info); this.sizer.add(this.canvas,100); this.sizer.add(this.buttons);
 }
}

console.show();
console.noteln("=> Spike overlay: buscando ventana con solucion astrometrica...");
var win = firstSolvedWindow();
if (!win) {
   console.criticalln("No hay ninguna ventana con solucion astrometrica. Abre/soluciona una imagen (ImageSolver) y reintenta.");
   SpikeMsg("No hay ninguna imagen con solucion astrometrica (WCS) abierta.\nSoluciona una imagen y reintenta.");
} else {
   console.noteln("=> Usando: " + win.mainView.id);
   var rows = readCatalog();
   console.noteln("=> Catalogo OpenNGC: " + rows.length + " objetos.");
   var report = {};
   var bmp = buildAnnotatedBitmap(win, rows, report);
   console.noteln("=> " + report.fov);
   console.noteln("=> Round-trip: " + report.roundtrip);
   console.noteln("=> Etiquetas: " + report.labels + " / " + report.total + " objetos en imagen.");
   (new SpikeOverlayDialog(bmp, report)).execute();
   console.noteln("=> Spike overlay cerrado.");
}

})();
