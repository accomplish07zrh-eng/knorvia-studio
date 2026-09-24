# Knorvia Studio icon

The owner supplied the K/robot artwork and requested removal of the dark background, using their red annotation only as a selection guide. They subsequently approved the fuller, handless, antenna-free code-native Knorvia mascot (design revision 03) and requested the K application icon match it. The current asset is `packages/ui/src/assets/knorvia-logo.png`; its alpha channel is retained in application PNG, ICO and ICNS variants. No extra frame, black tile or decorative shadow is added by the UI.

The cutout and mascot update were produced with the built-in image-generation editing tool on 2026-09-22. Native variants use only proportional resizing and format encoding. The artwork is an edited cutout, not a byte-identical copy of the original photograph. Application-internal icons and animations instead use the original SVG in `KnorviaMark.tsx` and `mascotArtwork.ts`.

## Approved mascot update

Final generated source: `C:/Users/17018/.codex/generated_images/01a0c23e-a6f5-7332-bce0-8c5a7bc1592a/exec-50415e5c-3cba-4a7a-9d99-9bf876a9d8b2.png`. The selected image is copied into the repository; runtime does not depend on this generation directory. Supporting identity reference was rendered directly from the approved SVG, not independently redesigned. Conversion preserves alpha and emits PNG sizes 16–1024, seven ICO frames and ICNS sizes. Input and 256px output corners were verified transparent.

### Mascot replacement prompt (built-in image_gen)

```text
Use case: precise-object-edit.
Asset type: final Knorvia Studio application icon, square transparent PNG.
Input image 1 is the existing application icon to edit. Input image 2 is the USER-APPROVED Knorvia robot identity reference, already designed in code.
Change only the black robot in image 1 to match image 2: a full, tall, soft rounded pebble head, approximately equal height and width (not a flat wide blob), slightly organic asymmetry, smooth charcoal-black satin volume, two simple luminous white oval eyes. REMOVE the antenna, the round ball above the head, and BOTH HANDS entirely. NO arms, NO paws, NO feet. No mouth, pupils, eyebrows, face details or new decorative features.
The new robot peeks gently from behind the upper-right part of the white K tile in the same compositional location, with its rounded crown and both eyes visible; its lower head is naturally occluded by the white tile. Preserve the approved reference's fuller head proportions rather than stretching it to the old robot's width.
INVARIANTS: keep the large sculptural white K ribbon and rounded white tile, their perspective, sculpted texture, original framing, and subtle mint-cyan/lavender illumination. Keep the three small cyan/white/lavender light strokes at the right. Remove old hand shapes and seamlessly restore the K tile edge where they were.
Background is genuine transparent alpha everywhere outside the foreground silhouette, including between the light strokes. Preserve clean smooth antialiasing. Remove stray white pixels, noisy islands, exterior halo and background remnants. No enclosing black square, no new border, no backdrop, no floor shadow, no text, no presentation sheet.
Deliver one finished square application icon, comfortably contained within the canvas, with a small transparent safety margin. Match the approved mascot, do not invent another character.
```

### Alpha finishing prompt (built-in image_gen)

```text
Use case: background-extraction.
Edit target: the supplied Knorvia Studio app icon, already using the approved handless, antenna-free robot.
Make exactly one technical finishing change: PERFECTLY CLEAN the transparent silhouette edges. Remove every jagged white pixel, fringe, disconnected speck and noisy halo outside the white tile and around the robot and three light strokes. The tile's left, bottom and right edges must be continuously smooth and antialiased, not rough or fuzzy. The three cyan/white/lavender accent strokes must have clean solid smooth capsule silhouettes without speckled exterior glow.
Do not redesign, move, stretch, crop, resize or change any part of the foreground. Preserve the same white sculpted K, tile, all colors, materials, lighting, perspective, and the same full rounded black head with two white eyes. Keep no antenna and no hands. Preserve empty space between the strokes.
Genuine alpha transparency, zero-opacity pixels outside the clean subject. No black background, no white background, no checkerboard, no border, no drop shadow. The result is one transparent PNG of the same composition, with professionally clean cutout edges.
```


## Extraction prompt

Use case: background-extraction. Edit target is Image 1, the original Knorvia K-and-small-robot app icon. Image 2 is ONLY an annotated selection guide, not the artwork source: its red outline loosely indicates the desired subject. Remove the entire dark/black photographic background to ACTUAL alpha transparency, including between the detached three cyan/white/purple light strokes and the robot. Preserve the complete white rounded K sculpture/tile, black robot with its antenna and hands, the three detached light strokes, original geometry, framing, colors, lighting and surface texture as faithfully as possible. The robot is black and MUST remain; do not remove its black body as background. Use tight clean antialiased silhouette edges of the artwork (not the loose red outline). Keep the subject uncut, full height, with small transparent safety margin. Output square PNG with genuine transparent alpha. No black rectangle, no backdrop, no added border, no outlines, no red annotation, no checkerboard baked into the pixels, no new shadows outside the subject, no text, no redesign.

## Refinement prompt

Use case: background-extraction refinement. This is an existing transparent Knorvia app icon. Make ONE targeted edit: clean the alpha silhouette edges. Remove all tiny white noisy islands, jagged specks and remnant backdrop outside the subject, especially above and to the left of the white tile and around the three light strokes. Preserve the exact K sculpture, white tile, black robot, antenna, hands, all three cyan/white/purple strokes, geometry, position, lighting, colors and textures. Retain smoothly antialiased edges. Keep genuine fully transparent background between the three strokes, around the robot and everywhere outside the silhouette. Do not regenerate or redesign the subject. No black/white background, no extra border, no red line, no baked-in checkerboard, no external drop shadow. Square transparent PNG.
