# PI Workflow

**A Simple, Flexible, and Optimized Processing Suite for PixInsight**

PI Workflow is a comprehensive astrophotography processing interface that unifies the entire post-processing pipeline into a single, elegant, and highly optimized environment. By replacing scattered process windows and redundant preview boxes, it provides a structured, responsive, and seamless workflow from raw linear data to the final masterpiece.

---

## 🌟 Key Features & Advantages

### 🚀 Simple and Flexible Workflow
* **Logical Sequencing:** Structured into four sequential, non-destructive tabs: **Pre-Processing**, **Stretching (Star Split)**, **Post-Processing**, and **Channel Combination**.
* **Smart Image Selection:** Automatically detects and filters appropriate master files (`R`, `G`, `B`, `L`, `Ha`, `OIII`, `SII`, etc.) from your workspace.

### 👁️ Universal Preview Canvas
* **One Canvas to Rule Them All:** A single, high-performance, interactive preview panel shared across all tabs and tools. No more cluttering your screen with dozens of temporary preview windows.
* **Fast Downsampled Calculations:** Speeds up slider adjustments in real-time using a resolution reduction factor (1 to 6). PixInsight only runs the full-resolution calculation when you commit the change.

### ⚖️ Advanced Comparison Tools (Unique to PI Workflow)
These comparison features solve classic workflow bottlenecks and are not natively available in PixInsight:
* **Interactive Split-Screen (Split View):** Click the **Split** button to divide the preview pane. Slide the vertical division bar side-to-side to inspect the exact "before" (original/previous) and "after" (processed candidate) details in real-time.
* **Multi-Algorithm Comparison Grid:** With a single click, compare multiple algorithms side-by-side in a custom mosaic grid:
  * **Gradient Correction:** View MGC, AutoDBE, ABE, and GraXpert results at once.
  * **Star Split:** Compare SXT and StarNet2 separation layers side-by-side.
  * **Sharpening:** Compare BXT, Unsharp Mask, HDRMT, LHE, DSE, and Cosmic Clarity in a 3x2 grid.
* **8-Slot Transient Memory:** Save up to 8 processing stages per tab and toggle between them instantly with simple left/right clicks to evaluate subtle parameter adjustments.

---

## 🛠️ The Pipeline at a Glance

1. **Pre-Processing (Linear Phase):**
   * Plate solving integration.
   * Gradient Correction (MGC, AutoDBE, ABE, GraXpert) with live gradient-model preview.
   * Color Calibration (SPCC with Gaia DR3/SP catalog, Auto Linear Fit, Background Neutralization).
   * Deconvolution (BlurXTerminator, Cosmic Clarity).

2. **Stretching (The Dynamic-Range Switch):**
   * **Star Split:** Separate stars from nebulae (using StarXTerminator or StarNet2) before stretching to protect star profiles.
   * **Dual-Zone Stretching:** Independent stretching for the *Starless* layer (hyperbolic, reveal gas) and the *Stars* layer (logarithmic, preserve colors) using **VeraLux**, **MAS**, **AutoSTF**, **Statistical Stretch**, or **Curves**.

3. **Post-Processing (Non-Linear Perceptual Phase):**
   * Noise Reduction (NoiseXTerminator, TGVDenoise, Cosmic Clarity).
   * Sharpening (BlurXTerminator, USM, HDRMT, LHE, Dark Structure Enhance, Cosmic Clarity).
   * Color Balance (Hue/Intensity wheels, Saturation, SCNR).
   * Curves Transformation with real-time histogram overlay.
   * Procedural Masking (Range Mask, Color Mask, FAME) with live staging.

4. **Channel Combination (The Final Blend):**
   * Multi-slot composition (up to 6 layers) allowing LRGB, RGB, and Narrowband (Ha/OIII/SII) blending.
   * Real-time preview of layer opacities, curves, and blend modes (skipping the native PixInsight double-resampling pixelation).

---

## 💾 Installation

### Option A: Automatic Updates via Repository (Recommended)
This is the easiest method. It ensures you always have the latest version with automatic update notifications inside PixInsight:

1. Open **PixInsight**.
2. Go to the top menu and select **Resources > Updates > Manage Repositories** (Recursos > Actualizaciones > Administrar repositorios).
3. Click the **Add** (Añadir) button.
4. Paste the following URL:
   ```text
   https://ninocabra.github.io/PI-Workflow/
   ```
5. Click **OK**, then click **OK** again to close the manager.
6. Go to the top menu and select **Resources > Updates > Check for Updates** (Recursos > Actualizaciones > Buscar actualizaciones).
7. PixInsight will find the script. Click **Apply** (Aplicar) and **restart PixInsight**.
8. The script will be available under **Script > Utilities > PI Workflow**.

### Option B: Manual Installation
1. Download [PI-Workflow.zip](https://github.com/Ninocabra/PI-Workflow/raw/main/PI-Workflow.zip) from this repository.
2. Extract the contents. You will find a `src/scripts/` folder structure containing:
   * `PI Workflow.js`
   * `PI Workflow_UI.js`
   * `PI Workflow_resources.jsh`
   * `PI Workflow_help.xhtml`
3. Copy these four files into your PixInsight installation's script folder (usually `C:\Program Files\PixInsight\src\scripts\`).
4. In PixInsight, go to **Script > Feature Scripts**, click **Add**, select the directory where you copied the files, and click **Done**.

---

## 👥 Authors & Support

* **Developed by:** @Ninocabra
* **Support:** For questions, bug reports, or feature requests, please open an issue in this GitHub repository.
