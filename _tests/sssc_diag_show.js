#engine v8
#include <pjsr/UndoFlag.jsh>
// Stretch DIAG_RGB (before) and DIAG_SSSC (after) with the same linked auto-stretch so
// the user can see the SSSC result is balanced (not red).
function autoStretchLinked(win) {
   var view = win.mainView, img = view.image, n = img.numberOfChannels, med = 0, mad = 0;
   for (var c = 0; c < n; ++c) { img.firstSelectedChannel = c; img.lastSelectedChannel = c; med += img.median(); mad += (typeof img.MAD==="function")?img.MAD():img.avgDev(); }
   img.resetSelections(); med /= n; mad /= n;
   var C = -2.80, Bk = 0.25, normMad = 1.4826*mad, c0 = Math.range(med + C*normMad, 0, 1), x = med - c0;
   if (x < 0.01) x = 0.01;
   var m = (x*(Bk-1))/(2*Bk*x - Bk - x);
   var ht = new HistogramTransformation;
   ht.H = [[0,0.5,1,0,1],[0,0.5,1,0,1],[0,0.5,1,0,1],[c0,m,1,0,1],[0,0.5,1,0,1]];
   view.beginProcess(UndoFlag_NoSwapFile); ht.executeOn(view, false); view.endProcess();
}
try {
   var wins = ImageWindow.windows, before=null, after=null;
   for (var i=0;i<wins.length;++i){ var id=wins[i].mainView.id; if(id==="DIAG_RGB") before=wins[i]; if(id==="DIAG_SSSC") after=wins[i]; }
   if (before){ autoStretchLinked(before); before.show(); before.zoomToFit(); }
   if (after){ autoStretchLinked(after); after.show(); after.zoomToFit(); }
   console.noteln("=> shown DIAG_RGB (before) and DIAG_SSSC (after).");
} catch(e){ console.criticalln("ERR: "+e.message); }
