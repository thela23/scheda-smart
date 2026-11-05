# GPT Image prompting guide

## Generate

Write prompts in this order:

1. Intended asset and visual medium.
2. Scene and main subject.
3. Composition, viewpoint, and lighting.
4. Materials, colours, and important details.
5. Literal text and placement, if any.
6. Constraints such as no watermark or no extra text.

Example:

> Editorial product photograph for a landing-page hero. A matte black travel mug on pale limestone, framed at eye level with negative space on the left. Soft morning window light, realistic surface texture. No logo, watermark, or extra objects.

Quote text that must appear exactly. Use `high` quality when small or dense typography matters, but still inspect spelling in the output.

## Edit

Separate the change from the invariants:

> Change only the background to a warm studio gradient. Preserve the person's identity, pose, clothing, crop, camera angle, and facial expression. Add no text or watermark.

For multiple inputs, identify each image by its command order and explain the relationship: “Image 1 is the scene; Image 2 is the product to place on the table.” Ask for matched scale, perspective, lighting, contact shadows, and occlusion when compositing.

For masks, describe the desired replacement and the surrounding context. A mask guides the edit but is not a pixel-exact selection.

`gpt-image-2` processes edit inputs at high fidelity automatically. Do not pass `input_fidelity`.

## Current output controls

- `size`: `auto` or a valid `WIDTHxHEIGHT` resolution.
- `quality`: `low`, `medium`, `high`, or `auto`.
- `output_format`: `png`, `jpeg`, or `webp`.
- `output_compression`: 0–100 for JPEG or WebP.

Valid custom sizes use multiples of 16, have an edge no longer than 3,840 px, stay within a 3:1 aspect ratio, and contain 655,360–8,294,400 pixels. Resolutions above 2,560×1,440 are experimental. `gpt-image-2` does not support transparent output.

Use the current OpenAI image-generation guide as the authority when capabilities change:
<https://developers.openai.com/api/docs/guides/image-generation>
