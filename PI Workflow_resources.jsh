/*
 * PI Workflow_resources.jsh
 * External contextual help, tooltips, and repository manifest for PI Workflow.
 * Keep this file in the same directory as PI Workflow.js.
 */

#ifndef PI_WORKFLOW_OPT_6D_RESOURCES_JSH
#define PI_WORKFLOW_OPT_6D_RESOURCES_JSH 1

var OPT6D_RESOURCE_VERSION = "30-opt-6d-1";

/*
 * Short contextual tooltips.
 * Keys intentionally use human-readable labels so future long help can be added
 * without changing the main script.
 */
var OPT6D_TOOLTIPS = {
   "title.PI Workflow": "<b>PI Workflow</b><br/>End-to-end PixInsight processing cockpit. It keeps canonical image ownership, previews, memory slots, masks, and workflow stages synchronized across Pre, Stretch, Channel Combination, Post, and Export tabs.",
   "button.Recommended Repositories": "<b>Recommended Repositories</b><br/>Shows the PixInsight update repositories and non-repository resources required by the processes and scripts used by this workflow.",
   "section.Plate Solving": "<b>Plate Solving</b><br/>Solves the current image with ImageSolver and stores the astrometric WCS required by SPCC, SPFC, MGC/MARS, and catalog-based operations.",
   "section.Gradient Correction": "<b>Gradient Correction</b><br/>Removes additive sky glow, residual moonlight, and multiplicative illumination gradients with MGC/MARS, AutoDBE, ABE, or GraXpert. This stage should normally be performed on strictly linear data before SPCC so the physical background model and later color calibration are not biased by an already distorted pedestal.",
   "section.Color Calibration": "<b>Color Calibration</b><br/>Applies SPCC, Auto Linear Fit, SCNR, or related color-balancing methods. SPCC is the physically preferred route because it compares solved stars against Gaia DR3/SP spectra; Auto Linear Fit is the practical fallback when Gaia resources are unavailable or the field is too poor in usable catalog stars.",
   "section.Deconvolution": "<b>Deconvolution</b><br/>Improves stellar and non-stellar detail using BlurXTerminator or compatible deconvolution processes. It is intended for linear, well-calibrated data after gradient removal and color preparation, when the script can still assume a mathematically linear PSF model.",
   "section.Star Split": "<b>Star Split</b><br/>Separates stars and starless signal so each layer can be stretched and processed under different assumptions. The starless layer can tolerate stronger nebular contrast and denoising, while the stars layer should remain compact, chromatically clean, and easy to recombine without halos.",
   "section.RGB / STARLESS": "<b>RGB / STARLESS Stretch</b><br/>Controls the stretch applied to the main nebula, galaxy, or starless signal. This is the place to reveal faint gas and dust without letting stars dominate the histogram. MAS and Auto STF are good first passes; curves and local tonal tools should then refine contrast more selectively.",
   "section.STARS": "<b>Stars Stretch</b><br/>Controls the independent stretch of the star layer. The goal is usually to preserve star color, keep cores compact, and avoid adding a bright gray pedestal when the stars are recombined over the main signal.",
   "section.Noise Reduction": "<b>Noise Reduction</b><br/>Applies non-linear denoising after stretch or after starless/star separation. In most cases the dark background should receive the strongest attenuation while bright nebular cores, dust edges, and small stars remain protected with a mask.",
   "section.Sharpening": "<b>Sharpening</b><br/>Enhances detail after denoising through multiscale contrast tools such as HDRMT, LHE, USM, or dark-structure enhancement. Moderate, masked sharpening is preferred so local volume increases without ringing, crunchy halos, or amplified background noise.",
   "section.Color / Saturation": "<b>Color / Saturation</b><br/>Final color balancing and saturation shaping for the post-stretch image. Use it to steer palette relationships and local chroma intensity after the major structural work, not as a substitute for missing linear calibration.",
   "section.Curves": "<b>Curves</b><br/>Manual tonal shaping. Curves can adjust RGB/K, individual channels, saturation, shadows, highlights, and local contrast. Smooth, deliberate curve moves are usually safer than aggressive global histogram pushes.",
   "section.Masking": "<b>Masking</b><br/>Builds reusable grayscale masks for Post Processing and Channel Combination. White pixels receive the operation; black pixels are protected. Live preview now uses the same full-resolution mask logic as Generate Active Mask and only reduces the finished mask for display.",
   "section.Image Selection": "<b>Image Selection</b><br/>Selects the current workflow image and memory record for the active tab.",
   "section.Image 1": "<b>Channel Combination Image 1</b><br/>Base layer for the Channel Combination stack. Its resolution anchors the blended preview and final composition.",
   "section.Image 2": "<b>Channel Combination Image 2</b><br/>Optional blend layer. Activate it and choose a source before blending.",
   "section.Image 3": "<b>Channel Combination Image 3</b><br/>Optional blend layer. Use blend modes and opacity-like brightness/saturation controls for creative integration.",
   "section.Image 4": "<b>Channel Combination Image 4</b><br/>Optional blend layer for stars, luminance, narrowband, or synthetic color additions.",
   "section.Image 5": "<b>Channel Combination Image 5</b><br/>Optional blend layer for advanced composites.",
   "section.Image 6": "<b>Channel Combination Image 6</b><br/>Optional blend layer for advanced composites.",
   "group.GraXpert Parameters": "<b>GraXpert Parameters</b><br/>Native GraXpert process settings for AI background extraction. GraXpert is especially useful when diffuse nebulosity or IFN makes classical background sampling unreliable, because the model tries to distinguish real sky signal from unwanted background structure.",
   "group.GraXpert Denoise Settings": "<b>GraXpert Denoise Settings</b><br/>Native GraXpert denoising controls. Strength determines how strongly the AI model suppresses visible noise; batch size controls how the image is tiled in memory and therefore affects throughput more than image character.",
   "group.MGC Parameters": "<b>MGC Parameters</b><br/>MultiscaleGradientCorrection settings. MGC uses MARS reference data plus SPFC scale factors to model the physical sky background. It is strongest when WCS, environmental references, and filter metadata are all configured correctly.",
   "group.NoiseXTerminator Settings": "<b>NoiseXTerminator Settings</b><br/>AI noise-reduction controls. Detail is the critical preservation parameter: too little detail protection makes backgrounds look waxy, while too much leaves visible grain. Use masks so the strongest action falls on low-SNR background zones instead of bright nebular cores.",
   "group.TGVDenoise Settings": "<b>TGVDenoise Settings</b><br/>Classical edge-aware denoising based on total-variation minimization. It is useful when AI tools are unavailable or when you want explicit control over luminance, chrominance, edge protection, iteration count, and frequency behavior.",
   "group.Cosmic Clarity Denoise Settings": "<b>Cosmic Clarity Denoise Settings</b><br/>External SetiAstro denoising options. Requires the standalone Cosmic Clarity application and ExternalProcess support.",
   "group.Color Correction": "<b>Color Correction</b><br/>Per-layer hue anchor and channel multipliers. This is intended for controlled palette steering during blending, such as nudging a narrowband layer toward a warmer or cooler family, not for replacing proper linear calibration upstream.",
   "group.Histogram": "<b>Histogram / Curves</b><br/>Per-layer curve shaping for the selected channel. Use it for controlled shadow lifting, highlight restraint, and local saturation shaping before the layer enters the final blend equation.",
   "group.Curves": "<b>Curves</b><br/>Adjusts local tonal response for the selected channel. Smooth transitions are usually safer than steep bends because abrupt curves can posterize gradients, exaggerate noise, or create unnatural transitions in blended layers.",
   "combo.Algorithm:": "<b>Algorithm</b><br/>Selects the process used by this section. AI tools usually converge faster and can be more forgiving on difficult data; classical tools remain easier to audit and reproduce because their behavior depends more directly on explicit parameters.",
   "combo.Correction:": "<b>Correction</b><br/>Subtraction is the standard choice for additive sky glow, light pollution, and moonlight. Division should be reserved for multiplicative illumination defects such as strong residual vignetting or flat-field mismatch.",
   "combo.Gradient scale:": "<b>Gradient scale</b><br/>Approximate spatial scale used by MGC to describe the background model. Larger values favor broad, smooth illumination structures; smaller values let the solver react to tighter background transitions, but they also increase the risk of mistaking faint nebulosity for removable gradient.",
   "combo.Structure separation:": "<b>Structure separation</b><br/>Controls how strongly MGC tries to keep astronomical structure separate from the gradient model. Higher values protect broader nebular forms and extended galaxies more aggressively; lower values let the model absorb more medium-scale variation.",
   "combo.Source:": "<b>Source</b><br/>Selects the workflow image feeding this slot. Choose None to disable the slot source without deleting its settings.",
   "combo.Mask:": "<b>Mask</b><br/>Optional per-image mask from mask memory. None applies the slot controls everywhere. A selected mask limits this Image slot's brightness, saturation, color correction, and curves to the mask's white areas.",
   "combo.Blend mode:": "<b>Blend mode</b><br/>Controls how this slot is composited over the previous layers. Screen and lighten-style behavior is often appropriate for stars and gentle overlays; normal or additive behavior is more suitable for luminance injections, nebular builds, and narrowband support layers.",
   "combo.Channel:": "<b>Channel</b><br/>Selects which channel the curves or extraction operation targets. RGB/K affects overall luminance response, while individual R, G, or B channels let you reshape color balance and channel-specific contrast deliberately.",
   "combo.Denoise Mode:": "<b>Denoise Mode</b><br/>Full Image denoises luminance and chrominance together. Luminance Only protects the current color balance and is safer when chroma is already clean, but it will leave most low-frequency blotchy color noise untouched.",
   "combo.Denoise Model:": "<b>Denoise Model</b><br/>Walking Noise targets directional pattern noise. Standard is the general-purpose denoising model.",
   "combo.Sharpening Mode:": "<b>Sharpening Mode</b><br/>Controls whether sharpening targets stars, non-stellar structures, or both. Star-focused sharpening is useful for tightening profiles; non-stellar sharpening is safer for dust lanes and nebular texture when stars have already been split away.",
   "combo.Zoom:": "<b>Zoom</b><br/>Changes preview magnification without changing the underlying image data.",
   "combo.Mode:": "<b>Mode</b><br/>In Range Selection, Binary creates a hard black/white mask, Luminance uses perceptual RGB weighting, and Brightness uses the maximum RGB channel value so strong signal in any one channel, for example pure Ha red or OIII cyan, is still captured at full weight.",
   "combo.Preset:": "<b>Preset</b><br/>Sets a starting hue window for Color Mask. Fine tune Hue deg, Hue range, and Sat min after choosing a preset.",
   "combo.Mask type:": "<b>Mask type</b><br/>FAME output mode. Binary fills drawn shapes, Lightness follows pixel brightness, Chrominance follows color saturation, Color isolates the selected hue family, and Gradient interpolates between the two right-click anchor points.",
   "combo.Shape:": "<b>Shape</b><br/>FAME drawing primitive. Freehand traces a polygon, Brush paints circular stamps, Spray Can scatters points, and Ellipse/Rectangle generate geometric masks.",
   "combo.Color:": "<b>Color</b><br/>Hue family used by FAME Color mode.",
   "numeric.Smoothing:": "<b>Smoothing</b><br/>GraXpert background-model smoothing. Higher values force a broader, calmer background solution; lower values let the model follow tighter variations. Recommended: 0.20-0.60 for most gradients. If the model starts absorbing faint real nebulosity, reduce it. Range: 0.00-1.00.",
   "numeric.Strength:": "<b>Strength</b><br/>GraXpert AI denoising strength. This is the primary aggression control for how hard the model suppresses visible noise texture. Recommended: 0.60-1.00 for stretched data, lower for delicate star fields or fine dust detail. Values above about 1.20 can start to look synthetic. Range: 0.00-2.00.",
   "numeric.Batch size:": "<b>Batch size</b><br/>GraXpert tile batch size. It controls how many image tiles are processed together, so it mainly affects throughput and memory pressure, not the mathematical look of the result. Higher values can be faster on GPUs with more VRAM; lower values are safer on constrained systems. Range: 1-16.",
   "numeric.Brightness:": "<b>Brightness</b><br/>Layer intensity multiplier applied before global blending. Values near 1.00 preserve the original layer energy; small deviations such as 0.80-1.20 are usually enough for balancing stars, luminance, or narrowband support layers without breaking contrast relationships. Range: 0.00-2.00.",
   "numeric.Saturation:": "<b>Saturation</b><br/>Layer or color saturation multiplier. Use modest increases first, especially on narrowband or star layers, because excessive values clip hue transitions and make low-SNR chroma noise obvious. Recommended: 0.80-1.40. Range depends on the section, typically 0.00-2.00.",
   "numeric.Hue saturation:": "<b>Hue saturation</b><br/>Strength of the hue-anchor correction for the current layer. It determines how forcefully the selected anchor steers nearby hues toward the intended chromatic family. Recommended: 0.50-1.50 for subtle palette steering. Range: 0.00-4.00.",
   "numeric.R multiplier:": "<b>R multiplier</b><br/>Red-channel multiplier for the current layer. Use this for small spectral balance corrections, for example warming a layer or restoring Ha dominance, not as a substitute for proper calibration. Recommended: 0.90-1.10. Range: 0.00-2.00.",
   "numeric.G multiplier:": "<b>G multiplier</b><br/>Green-channel multiplier for the current layer. Useful for controlling green cast or for balancing SHO/HOO blends, but large moves easily destabilize hue relationships. Recommended: 0.90-1.10. Range: 0.00-2.00.",
   "numeric.B multiplier:": "<b>B multiplier</b><br/>Blue-channel multiplier for the current layer. Useful for emphasizing OIII or cooling stellar color balance, but strong increases also amplify blue-channel noise quickly. Recommended: 0.90-1.10. Range: 0.00-2.00.",
   "numeric.SCNR amount:": "<b>SCNR amount</b><br/>Green suppression amount for the current layer. Use it only when the green dominance is clearly artificial, for example residual processing cast, not when the image contains legitimate teal or green narrowband structure. Recommended: 0.30-0.70. Range: 0.00-1.00.",
   "numeric.Contrast:": "<b>Contrast</b><br/>Curve contrast intensity for live shaping. Small values are usually enough because this control can steepen midtone transitions quickly and magnify noise if pushed too far. Recommended: 0.00-0.20. Range: 0.00-1.00.",
   "numeric.Shadows lift:": "<b>Shadows lift</b><br/>Raises dark tones before blending. Use carefully to recover buried faint signal or soften an overly black background, but avoid turning the layer pedestal gray. Recommended: 0.00-0.08. Range: 0.00-0.50.",
   "numeric.Highlights compress:": "<b>Highlights compress</b><br/>Compresses bright tones before clipping occurs. Useful for star cores, galaxy nuclei, or blended luminance layers that are dominating the composite. Recommended: 0.00-0.15. Range: 0.00-0.50.",
   "numeric.Denoise:": "<b>Denoise</b><br/>Main noise-reduction amount for the selected tool. Increase only until the visible background noise becomes acceptable; beyond that point most tools begin to trade real texture for a smoother but less credible surface. Exact range depends on the selected engine.",
   "numeric.Iterations:": "<b>Iterations</b><br/>Number of optimization passes. More iterations usually converge toward a cleaner solution, but each pass costs time and increases the chance of eroding faint small-scale structure if the other regularization settings are already aggressive.",
   "numeric.Edge protection:": "<b>Edge protection</b><br/>Protects high-contrast edges during denoising. Lower values let the solver push more strongly into stars and sharp dust edges; higher values preserve those structures but leave more residual noise near boundaries.",
   "numeric.Smoothness:": "<b>Smoothness</b><br/>Controls smoothness of the background model or the denoising regularization, depending on the active tool. Higher values usually look cleaner, but they can also flatten weak nebulosity, suppress dust texture, or encourage over-modeling of the background.",
   "numeric.Luminance strength:": "<b>Luminance strength</b><br/>TGVDenoise strength on luminance. This primarily affects grain and mottling in the brightness structure. Recommended: 3-8 for moderate noise; higher values should be paired with strong edge protection or masking. Range: 1-20.",
   "numeric.Chrominance strength:": "<b>Chrominance strength</b><br/>TGVDenoise strength on color noise. This is usually safe to push a bit harder than luminance because low-frequency chroma blotches are visually objectionable and often carry less useful structure. Recommended: 2-6. Range: 0-20.",
   "numeric.HF/LF scale:": "<b>HF/LF scale</b><br/>Frequency-split boundary between high-frequency and low-frequency denoising. Lower values focus the treatment on fine grain; higher values push more of the broad mottled background into the low-frequency branch. Recommended: 3-8. Range: 1-15.",
   "numeric.Denoise Luma:": "<b>Denoise Luma</b><br/>Cosmic Clarity luminance denoise amount. It targets brightness noise while trying to preserve structural edges. Recommended: 0.30-0.60; higher values risk a waxy or over-processed background. Range: 0.00-1.00.",
   "numeric.Denoise Color:": "<b>Denoise Color</b><br/>Cosmic Clarity chrominance denoise amount. Use this to suppress low-frequency color blotches more aggressively than luminance grain. Recommended: 0.30-0.70. Range: 0.00-1.00.",
   "numeric.Low:": "<b>Low</b><br/>Lower Range Selection threshold in normalized sample values. Pixels below this level fall outside the selected range and therefore become black unless Invert is enabled. Raise it to exclude the dark background and keep only stronger structures. Range: 0.000-1.000.",
   "numeric.High:": "<b>High</b><br/>Upper Range Selection threshold in normalized sample values. Pixels above this level fall outside the selected range and therefore become black unless Invert is enabled. Lower it when you want to isolate midtones and avoid the brightest stellar cores or nebular highlights. Range: 0.000-1.000.",
   "numeric.Fuzz:": "<b>Fuzz</b><br/>Soft transition width around the Low and High thresholds. Increase it to create feathered mask boundaries and avoid harsh seams; keep it low when isolating compact stars, galaxy cores, or other tightly bounded structures. Range: 0.000-0.500.",
   "numeric.Smooth:": "<b>Smooth</b><br/>Gaussian smoothing radius applied to the generated mask after thresholding. Use 0 for exact geometry, 1-3 to soften small halos and jagged boundaries, and larger values for broad local adjustments that must blend invisibly into their surroundings. Range: 0.00-10.00.",
   "numeric.Hue deg:": "<b>Hue deg</b><br/>Center hue for Color Mask, measured in degrees around the hue wheel. Red is near 0/360, yellow near 60, green near 120, cyan near 180, blue near 240, and magenta near 300. Move this until the preview locks onto the exact emission or cast you want to isolate. Range: 0-360.",
   "numeric.Hue range:": "<b>Hue range</b><br/>Total angular width selected around Hue deg. Narrow ranges isolate very specific hue families, for example pure OIII cyan, while wider ranges include neighboring tones and are more suitable for broad palette regions. Range: 1-180 degrees.",
   "numeric.Sat min:": "<b>Sat min</b><br/>Minimum saturation required before a pixel contributes to Color Mask. This is one of the most important controls for real data: raising it rejects gray background noise and weakly colored artifacts, while lowering it includes subtler chromatic signal at the cost of admitting more noisy pixels. Range: 0.000-1.000.",
   "numeric.Brush radius:": "<b>Brush radius</b><br/>FAME brush/spray radius in source-image pixels. Larger values cover broad structures faster; small values are better for stars and edges. Range: 1-200 px.",
   "numeric.Spray density:": "<b>Spray density</b><br/>FAME Spray Can fill density. Low values create sparse stochastic coverage; high values fill the radius more completely. Range: 0.00-1.00.",
   "numeric.Blur amount:": "<b>Blur amount</b><br/>FAME final Gaussian blur radius in pixels. Use 0 for sharp geometry, 2-8 for typical feathering, and higher values for broad local adjustments. Range: 0-50 px.",
   "check.Active": "<b>Active</b><br/>When checked, this slot participates in the live blend and final Channel Combination output.",
   "check.Live": "<b>Live</b><br/>When checked, this slot drives the preview as you edit its controls. Only one individual slot can be live at a time.",
   "check.Color": "<b>Color</b><br/>Enables the color-anchor and channel multiplier controls for this slot.",
   "check.Histogram": "<b>Histogram</b><br/>Shows the curves editor and applies the selected curve to this slot.",
   "check.See all Images Blended": "<b>See all Images Blended</b><br/>When checked, the preview composites all active Channel Combination slots while preserving preview resolution, zoom, and pan.",
   "check.Use active mask": "<b>Use active mask</b><br/>Applies the current workflow mask before running this operation. White areas are affected more strongly; black areas are protected.",
   "check.Enable color separation": "<b>Enable color separation</b><br/>Lets the denoiser treat luminance and chrominance noise separately.",
   "check.Enable frequency separation": "<b>Enable frequency separation</b><br/>Splits high- and low-frequency noise components before denoising.",
   "check.Remove Aberration First": "<b>Remove Aberration First</b><br/>Runs the tool's aberration correction before denoising or sharpening when supported.",
   "check.SCNR green": "<b>SCNR green</b><br/>Suppresses artificial green cast in the current layer. Avoid on true green/teal signal unless needed.",
   "check.Invert": "<b>Invert</b><br/>Swaps protected and affected mask areas. White still means affected after inversion.",
   "button.Apply Gradient Correction": "<b>Apply Gradient Correction</b><br/>Creates a candidate image using the selected gradient-removal algorithm. Review the preview before Set to Current.",
   "button.Apply Color Calibration": "<b>Apply Color Calibration</b><br/>Creates a candidate color-calibrated image. For narrowband RGB composites, SPCC is switched to narrowband-aware handling when possible.",
   "button.Apply Noise Reduction": "<b>Apply Noise Reduction</b><br/>Runs the selected denoising tool on a candidate view, optionally through the active mask.",
   "button.Apply Sharpening": "<b>Apply Sharpening</b><br/>Runs the selected sharpening tool on a candidate view. Use masks and moderate settings to avoid artifacts.",
   "button.Reset Hue Anchor": "<b>Reset Hue Anchor</b><br/>Recomputes the slot color statistics and returns the color anchor to the measured mean hue.",
   "button.Refresh Sources": "<b>Refresh Sources</b><br/>Refreshes the list of workflow images available for Channel Combination slots.",
   "button.Show/Hide Mask": "<b>Show/Hide Mask</b><br/>Toggles display of the active Post mask in the preview pane without changing which mask is active.",
   "button.Solve Image": "<b>Solve Image</b><br/>Runs ImageSolver on the active image and stores WCS metadata for catalog-based processing.",
   "button.Set to Current": "<b>Set to Current</b><br/>Commits the candidate preview as the current workflow image for this tab.",
   "button.Previous": "<b>Previous</b><br/>Temporarily displays the image state before the current candidate operation.",
   "button.Current": "<b>Current</b><br/>Displays the current committed image for the active workflow key.",
   "button.Candidate": "<b>Candidate</b><br/>Displays the pending result of the last operation before it is committed.",

   // --- Stretching: Auto STF (Histogram Transform) ---
   "numeric.Shadows clipping:": "<b>Shadows clipping</b><br/>Sigma offset below the median used to set the shadow clip point. More negative values are more conservative (preserve faint signal); less negative values clip aggressively for a deeper black. Recommended: -2.8 for RGB/Starless, -0.5 for Stars. Range: -10.0 to 0.0.",
   "numeric.Boost clipping factor:": "<b>Boost clipping factor</b><br/>Extra shadow-clipping multiplier applied only when Boost is enabled. Increases the bite of Shadows clipping. Use sparingly: aggressive boost clips real signal. Recommended: 0.50-1.00. Range: 0.0-5.0.",
   "numeric.Boost bkgd. factor:": "<b>Boost background factor</b><br/>Extra background-target multiplier applied only when Boost is enabled. Pushes the midtone closer to the Target background more strongly. Recommended: 1.5-3.0. Range: 0.0-10.0.",
   "check.Apply Boost to Auto STF": "<b>Apply Boost to Auto STF</b><br/>Enables a stronger Auto STF using the two Boost factors. Use when the standard STF leaves the background too dark, the midtones too dim, or faint structure invisible.",

   // --- Stretching: Multiscale Adaptive Stretch (MAS) ---
   "numeric.Aggressiveness:": "<b>Aggressiveness</b><br/>MAS midtone-push strength. Higher values produce a more dramatic stretch and stronger contrast but reveal more noise. Recommended: 0.60-0.80 for RGB/Starless, 0.05-0.15 for Stars. Range: 0.0-1.0.",
   "numeric.Dynamic range compression:": "<b>Dynamic range compression</b><br/>MAS upper-tone compression. Higher values flatten highlights to preserve detail in bright structures (galaxy cores, star clusters); too high looks artificial and flat. Recommended: 0.30-0.50 for RGB/Starless, 0.00-0.10 for Stars. Range: 0.0-1.0.",
   "combo.Scale separation:": "<b>Scale separation</b><br/>MAS wavelet scale in pixels. Defines the spatial scale at which detail is preserved against the background model. Larger values protect broad structure but compress globally; smaller values focus on fine details. Default 1024 suits most data. Range: 16-4096 px.",
   "check.Contrast Recovery": "<b>Contrast Recovery</b><br/>Restores mid-frequency contrast lost during Dynamic Range Compression. Enable to keep the stretched image punchy; disable for a smoother but flatter look.",
   "numeric.Intensity:": "<b>Intensity</b><br/>Strength of MAS Contrast Recovery. Higher values restore more local contrast (useful for nebular filaments and dust lanes); too high produces a crunchy appearance. Recommended: 0.70-1.00. Range: 0.0-1.0.",
   "check.Color Saturation": "<b>Color Saturation</b><br/>Enables saturation boost during MAS stretch. Compensates the natural desaturation that nonlinear stretches introduce on low-luminance signal.",
   "check.Lightness mask": "<b>Lightness mask</b><br/>Protects bright pixels (stars, galaxy cores) from MAS saturation boost. Recommended ON: prevents over-saturated bright structures while still boosting subtle nebular color.",

   // --- Stretching: Statistical Stretch ---
   "numeric.Target Median:": "<b>Target Median</b><br/>Statistical Stretch target median luminance after stretch. Lower values produce a darker background; higher values brighten the midtones more aggressively. Recommended: 0.20-0.30 for RGB/Starless. Range: 0.01-1.0.",
   "numeric.Blackpoint Sigma:": "<b>Blackpoint Sigma</b><br/>Statistical Stretch black clipping in sigmas below the median. Higher values keep more shadow detail; lower values clip aggressively for a deeper black. Recommended: 4-6. Range: 0-10.",
   "check.No Black Clip": "<b>No Black Clip</b><br/>Disables shadow clipping entirely. Use when you want to preserve all dark data, for example before HDR processing or when the noise floor still carries useful faint signal.",
   "check.HDR Compress": "<b>HDR Compress</b><br/>Enables highlight compression after the main Statistical Stretch. Useful for fields with very bright cores (M31, M42, globular clusters) that would otherwise burn out.",
   "numeric.HDR Amount:": "<b>HDR Amount</b><br/>Statistical Stretch HDR compression strength. Higher values flatten highlights more aggressively, recovering detail in bright structures. Recommended: 0.20-0.40 for moderate compression. Range: 0.0-1.0.",
   "numeric.HDR Knee:": "<b>HDR Knee</b><br/>Brightness threshold where HDR compression begins to act. Lower values affect more of the tonal range; higher values only compress the very brightest pixels. Recommended: 0.30-0.50. Range: 0.1-1.0.",
   "check.Luma Only (preserve color)": "<b>Luma Only (preserve color)</b><br/>Applies Statistical Stretch only to luminance, preserving the original RGB color relationships. Recommended when color is already well calibrated and you want to avoid stretch-induced color shifts.",
   "numeric.Luma Blend:": "<b>Luma Blend</b><br/>Blend ratio between luma-stretched and RGB-stretched output. 0 = pure RGB stretch, 1 = pure luma stretch. Balances color preservation against natural-looking contrast. Recommended: 0.50-0.70. Range: 0.0-1.0.",
   "check.Normalize Range [0,1]": "<b>Normalize Range [0,1]</b><br/>Rescales the output to fill the [0,1] range after stretching. Enable for consistent output across different exposures; disable if you intend to chain multiple stretches.",
   "numeric.Curves Boost:": "<b>Curves Boost</b><br/>Optional sigmoid contrast curve applied after Statistical Stretch. Small values add a gentle S-curve; too high causes hard clipping at both ends. Recommended: 0.00-0.15. Range: 0.0-0.5.",

   // --- Stretching: Star Stretch ---
   "numeric.Stretch Amount:": "<b>Stretch Amount</b><br/>Star Stretch hyperbolic strength. Higher values brighten faint stars more aggressively but expand the brightest cores; lower values preserve tighter star profiles. Recommended: 4.0-6.0. Range: 0.0-8.0.",
   "numeric.Color Boost:": "<b>Color Boost</b><br/>Star Stretch saturation multiplier applied to star colors. Compensates the chromatic flattening typical of stretched stars and recovers natural star tints. Recommended: 0.8-1.3. Range: 0.0-2.0.",
   "check.Remove Green via SCNR": "<b>Remove Green via SCNR</b><br/>Applies SCNR after the star stretch to suppress green casts. Recommended ON: stars almost never have legitimate green emission, so any green is artificial.",

   // --- Stretching: VeraLux HyperMetric ---
   "numeric.Target Bg:": "<b>Target Bg</b><br/>VeraLux target background luminance after stretch. Lower values keep the background dark; higher values lift it to reveal faint structure. Recommended: 0.15-0.25 for RGB/Starless. Range: 0.01-1.0.",
   "numeric.Log D (Stretch):": "<b>Log D (Stretch)</b><br/>VeraLux logarithmic stretch strength (HyperMetric D parameter). Higher values produce more aggressive stretching of faint signal; too high crushes mid-range contrast. Recommended: 1.5-3.0. Range: 0.0-7.0.",
   "numeric.Protect b:": "<b>Protect b</b><br/>VeraLux bright-pixel protection (b parameter). Higher values protect highlights from over-stretching, preserving star cores and galaxy nuclei. Recommended: 4.0-8.0. Range: 0.1-15.0.",
   "numeric.Star Core:": "<b>Star Core</b><br/>VeraLux star-core convergence. Higher values produce tighter star profiles by compressing the brightest pixels harder. Recommended: 2.5-4.0. Range: 1.0-10.0.",
   "numeric.Grip:": "<b>Grip</b><br/>VeraLux adherence to the original tonal distribution. 1.0 preserves the relative tonal shape; lower values let VeraLux reshape the histogram more freely. Recommended: 0.8-1.0. Range: 0.0-1.0.",

   // --- Stretching: explicit-key tooltips for shared labels ---
   "stretch.stf.targetBg": "<b>Target background (Auto STF)</b><br/>Auto STF target midtone after stretch. Lower values darken the background; higher values produce a brighter midtone-pushed look. Recommended: 0.25 for RGB/Starless, 0.03 for Stars. Range: 0.0-1.0.",
   "stretch.mas.bg": "<b>Target background (MAS)</b><br/>MAS target background mean after stretch. Lower values keep the histogram peak near zero (darker); higher values lift the background closer to gray. Recommended: 0.15 for RGB/Starless, 0.02 for Stars. Range: 0.0-1.0.",
   "stretch.mas.csAmount": "<b>Amount (Color Saturation)</b><br/>MAS saturation strength applied during stretching. Compensates the natural desaturation of nonlinear stretches on low-luminance signal. Recommended: 0.60-0.80. Range: 0.0-1.0.",
   "stretch.mas.csBoost": "<b>Boost (Color Saturation)</b><br/>Extra saturation boost applied to low-saturation pixels in MAS. Use to wake up subtle color in dust lanes and faint nebulosity without over-saturating already-colorful structures. Recommended: 0.40-0.60. Range: 0.0-1.0.",

   "generic.ComboBox": "<b>Dropdown</b><br/>Choose one processing option. Hover the label or section title for context about the available choices.",
   "generic.Button": "<b>Button</b><br/>Runs the action named on the button.",
   "generic.CheckBox": "<b>Check box</b><br/>When enabled, this option changes how the next preview or process is generated.",
   "generic.NumericControl": "<b>Slider / numeric control</b><br/>Drag for coarse changes or type a value for precision. In this workflow, sliders are not merely cosmetic: most of them map directly to process parameters with meaningful operating ranges, so small moves near the default are usually preferable to large exploratory jumps.",
   "generic.Section": "<b>Section</b><br/>Expand this section to configure and run one step of the workflow."
};

/*
 * Longer contextual documentation can be moved here progressively.
 * The main script already exposes lookup functions for these entries.
 */
var OPT6D_LONG_HELP = {
   "GraXpert": "The native GraXpert process exposes Background Extraction, Denoising, and Deconvolution. PI Workflow uses Background Extraction in the Pre tab and GraXpert Denoise in the Post tab, while preserving the legacy GraXpert script fallback for older installations. In the linear stage, GraXpert is especially useful when diffuse IFN, dust, or weak nebular signal makes manual sample placement unreliable.",
   "NarrowbandSPCC": "When a workflow image is tagged as a narrowband RGB composite, such as SHO, HOO, HSO, HOS, OSS, OHH, OSH, OHS, HSS, REAL1, REAL2, or FORAXX, PI Workflow passes H-alpha, OIII, and SII channel metadata to SPCC and SPFC when the installed process exposes scriptable narrowband parameters. If a single mono H/O/S channel is selected, SPCC is rejected because a pseudo-RGB mono copy would produce mathematically invalid color calibration.",
   "MGC_NB": "For narrowband RGB composites, PI Workflow first looks for a configured MGC_NB process icon. This avoids warnings on PixInsight builds where MGC filter selection is visible in the GUI but not exposed as scriptable JavaScript properties, and it keeps the physical gradient model aligned with the same filter assumptions used by SPFC.",
   "Masking": "Range Selection and Color Mask live previews are generated with the same full-resolution mask logic as Generate Active Mask, then reduced only for display. This prevents noisy images from producing a smooth low-resolution preview but a grainy full-resolution active mask. It also keeps live mask design aligned with the final geometry and intensity behavior described in the help manual.",
   "ChannelCombinationMasks": "Each Channel Combination Image slot can optionally select a mask from mask memory. The mask is applied only while that slot's brightness, saturation, color correction, and curves are executed; other slots are unaffected. This allows per-layer selective treatment, such as saturating only stars or protecting a nebular base while adjusting an overlay layer."
};

/*
 * PixInsight update repositories and related non-repository resources.
 * Verified during PI Workflow preparation on 2026-05-11.
 */
var OPT6D_RECOMMENDED_REPOSITORIES = [
   {
      name: "GraXpert Process for PixInsight",
      url: "https://pixinsight.deepskyforge.com/update/graxpert-process/",
      requiredFor: "Native GraXpert process in Process > Etc: Background Extraction and Denoising.",
      status: "Required for native GraXpert process mode. Keep the trailing slash."
   },
   {
      name: "SetiAstro PixInsight Scripts",
      url: "https://raw.githubusercontent.com/setiastro/pixinsight-updates/main/",
      requiredFor: "Auto Dynamic Background Extraction, Statistical Stretch, and SetiAstro helper scripts used by compatible workflow paths.",
      status: "Recommended. Requires PixInsight build 1605 or higher according to SetiAstro."
   },
   {
      name: "Cosmic Clarity standalone application",
      url: "https://www.setiastro.com/astro-programs/cosmic-clarity",
      requiredFor: "Cosmic Clarity denoising and sharpening paths invoked through ExternalProcess.",
      status: "External application, not a PixInsight update repository."
   },
   {
      name: "RC Astro BlurXTerminator",
      url: "https://www.rc-astro.com/BlurXTerminator/PixInsight",
      requiredFor: "BlurXTerminator deconvolution/sharpening process.",
      status: "Required only if using BlurXTerminator."
   },
   {
      name: "RC Astro NoiseXTerminator",
      url: "https://www.rc-astro.com/NoiseXTerminator/PixInsight",
      requiredFor: "NoiseXTerminator noise reduction process.",
      status: "Required only if using NoiseXTerminator."
   },
   {
      name: "RC Astro StarXTerminator",
      url: "https://www.rc-astro.com/StarXTerminator/PixInsight",
      requiredFor: "StarXTerminator star split / mask generation process.",
      status: "Required only if using StarXTerminator."
   },
   {
      name: "RC Astro TensorFlow GPU Libraries for Windows",
      url: "https://www.rc-astro.com/TensorFlow/PixInsight/GPU",
      requiredFor: "GPU acceleration support for RC Astro tools on Windows.",
      status: "Optional. Choose either GPU or CPU TensorFlow repository, not both."
   },
   {
      name: "RC Astro TensorFlow CPU Libraries for Windows",
      url: "https://www.rc-astro.com/TensorFlow/PixInsight/CPU",
      requiredFor: "CPU TensorFlow support for RC Astro tools on Windows.",
      status: "Optional. Choose either GPU or CPU TensorFlow repository, not both."
   },
   {
      name: "VeraLux PixInsight Native Module",
      url: "https://raw.githubusercontent.com/lucasssvaz/VeraLuxPixInsight/main/dist/",
      requiredFor: "VeraLux Stretch native process path.",
      status: "Recommended for VeraLux workflows."
   },
   {
      name: "VeraLux PJSR Port (legacy fallback)",
      url: "https://raw.githubusercontent.com/lucasssvaz/VeraLuxPorting/main/dist/",
      requiredFor: "Legacy JavaScript/PJSR VeraLux fallback scripts.",
      status: "Optional fallback if the native module is not used."
   }
];

var OPT6D_NON_REPOSITORY_REQUIREMENTS = [
   {
      name: "PixInsight official core updates",
      url: "https://pixinsight.com/",
      requiredFor: "Core processes: ImageSolver, SPCC, SPFC, MultiscaleGradientCorrection, MultiscaleAdaptiveStretch, PixelMath, ChannelCombination, ChannelExtraction, and other standard tools.",
      status: "Usually configured by PixInsight itself; not normally a third-party repository."
   },
   {
      name: "Gaia DR3/SP local database files",
      url: "https://pixinsight.com/dist/",
      requiredFor: "SPCC and SPFC catalog/spectrophotometric calibration.",
      status: "Install through PixInsight's Gaia process or the PixInsight distribution system."
   },
   {
      name: "MARS .xmars reference database",
      url: "https://pixinsight.com/dist/",
      requiredFor: "MultiscaleGradientCorrection / MARS gradient correction.",
      status: "Download from PixInsight resources and configure in the MGC preferences."
   }
];

#endif
