import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { decompressFrames, parseGIF } from "gifuct-js";

// Re-encode an animated GIF with something drawn on every frame (the AI-content watermark),
// keeping each frame's timing and the loop. Frames are composited the way a browser plays them
// (frame patches over the previous picture, honouring disposal), then quantized to 256 colours.

type Draw = (context: CanvasRenderingContext2D, width: number, height: number) => void;

export async function watermarkGif(blob: Blob, draw: Draw): Promise<Blob> {
    const gif = parseGIF(await blob.arrayBuffer());
    const frames = decompressFrames(gif, true);
    const width = gif.lsd.width;
    const height = gif.lsd.height;
    if (!frames.length || !width || !height) throw new Error("gif has no frames");

    const scene = canvas2d(width, height); // what the viewer sees so far
    const patch = canvas2d(1, 1);
    const output = canvas2d(width, height); // scene + mark, the frame we encode
    const encoder = GIFEncoder();

    for (const frame of frames) {
        const { top, left, width: frameWidth, height: frameHeight } = frame.dims;
        const restore = frame.disposalType === 3 ? scene.context.getImageData(0, 0, width, height) : undefined;

        patch.canvas.width = frameWidth;
        patch.canvas.height = frameHeight;
        patch.context.putImageData(new ImageData(new Uint8ClampedArray(frame.patch), frameWidth, frameHeight), 0, 0);
        scene.context.drawImage(patch.canvas, left, top); // drawImage keeps transparent pixels see-through

        output.context.clearRect(0, 0, width, height);
        output.context.drawImage(scene.canvas, 0, 0);
        draw(output.context, width, height);
        const rgba = output.context.getImageData(0, 0, width, height).data;
        const transparent = hasTransparency(rgba);
        const format = transparent ? "rgba4444" : "rgb565";
        const palette = quantize(rgba, 256, transparent ? { format, oneBitAlpha: true } : { format });
        const index = applyPalette(rgba, palette, format);
        const transparentIndex = transparent ? palette.findIndex((color) => color[3] === 0) : -1;
        encoder.writeFrame(index, width, height, {
            palette,
            delay: frame.delay,
            transparent: transparentIndex >= 0,
            transparentIndex: Math.max(0, transparentIndex),
            dispose: transparentIndex >= 0 ? 2 : 1, // full frames: replace, clearing first when see-through
        });

        if (frame.disposalType === 2) scene.context.clearRect(left, top, frameWidth, frameHeight);
        else if (restore) scene.context.putImageData(restore, 0, 0);
    }

    encoder.finish();
    return new Blob([encoder.bytes() as BlobPart], { type: "image/gif" });
}

function canvas2d(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("canvas unavailable");
    return { canvas, context };
}

function hasTransparency(rgba: Uint8ClampedArray) {
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 128) return true;
    return false;
}
