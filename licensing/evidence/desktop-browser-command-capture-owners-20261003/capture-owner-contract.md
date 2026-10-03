# Complete capture result owner

Output /tmp/knorvia-capture44-initial.ts. Only import type ControlledView from
./browserCommandTypes.js. Export async captureScreenshotWithCssPixelCorrection
(view:ControlledView,params:Record<string,unknown>):Promise<{data?:string}>. Keep
nonexported result interface {data?:string} if useful, no additional public exports.
Buffer Node global is available. At most TWO CDP capture calls (first + one correction).

FIRST await view.cdp.send('Page.captureScreenshot',SAME params), treating returned
object as result (no runtime validation/clone). This call is outside fallback catches;
its rejection must propagate by identity. After await, if !view.normalizeScreenshotToCssPixels
or !first.data return SAME first. Read correction target from params.clip only now:
truthy object, not Array; width/height/scale must each typeof number, finite, >0.
Other clip fields ignored. CSS target width=max(1,Math.round(width)), height likewise;
scale retains original number. Parse first data as PNG header; invalid target/header
returns SAME first. Header parsing: Buffer.from(data.slice(0,64),'base64'), require
at least24 bytes, signature bytes137/80/78/71/13/10/26/10, ASCII offsets12..16
equals IHDR; UInt32BE width at16 and height20, both>0. Catch all header errors=>null.
Do not decode entire image or inspect chunk CRC/type/length beyond these rules.

Uniform raster scale iff abs(actual.width/target.width - actual.height/target.height)
<=0.001; nonuniform first=>SAME first. Target match iff width AND height deltas<1,
strict. If first width>target.width AND first height>target.height: try resize first,
return resized result or SAME first, WITHOUT a second capture regardless of failure.

Resize procedure: if !view.resizeScreenshotToCssPixels OR !result.data return null,
outside try. Within try invoke live view.resizeScreenshotToCssPixels(result.data,
SAME target object) with view receiver; await sync-or-promise return. Falsey string=>
null. Parse resized header and require strict target match; success {...result,data:
resizedData}, preserving extra result properties and shallow spread/getter behavior.
All port/parse/spread errors INSIDE try =>null; precheck property access throws propagate.

Otherwise compute firstMatches, widthCorrection=target.width/first.width,
heightCorrection likewise. QualityScale=1 if no truthy resize port; else minimum of
2,4096/target.width,4096/target.height,sqrt(16777216/(target.width*target.height));
use this minimum only if finite AND >=1.25, otherwise1. No clamp beyond those rules.
If firstMatches AND qualityScale===1 return first. Corrected scale = originalScale *
(firstMatches?qualityScale:((widthCorrection+heightCorrection)/2)*qualityScale).
If nonfinite OR correctedScale<originalScale OR abs(delta)<0.001 return first.

Try ONE corrected await cdp.send('Page.captureScreenshot', {...params,clip:
{...params.clip,scale:correctedScale}}), so top-level and clip are new objects,
other fields/refs retained; call/spread/await errors fall back to first. Read
corrected.data outside that try; falsey=>first. Parse corrected header; invalid or
nonuniform relative to target=>first. Strict target match=>SAME corrected object.
If corrected width AND height>target: try resize corrected; truthy successful
resized result returned, otherwise choose between original capture results below.

Final choose by width*height: if products differ, larger wins SAME object. On equal
products compute abs(second.width-first.width)/first.width +
abs(second.height-first.height)/first.height; <=0.001 wins SAME second, otherwise
SAME first. No resize of arbitrary undersized/mixed-scale captures, no new error
wrapping/retries, fixed DPR assumption, logging, state mutation or target hardcoding.
