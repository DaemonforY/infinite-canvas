import { expect, test } from "bun:test";

import { applyAdjustments, FILTER_PRESETS, isNeutral, NEUTRAL_ADJUSTMENTS, rotateBy, rotatedSize, IDENTITY_GEOMETRY, type PixelBuffer } from "../src/lib/image-editor/adjustments";

function solid(r: number, g: number, b: number, width = 4, height = 4): PixelBuffer {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) data.set([r, g, b, 255], i);
    return { data, width, height };
}
const px = (buf: PixelBuffer, i = 0) => Array.from(buf.data.slice(i * 4, i * 4 + 4));

test("neutral adjustments leave pixels untouched", () => {
    const buf = solid(10, 120, 240);
    applyAdjustments(buf, NEUTRAL_ADJUSTMENTS);
    expect(px(buf).join()).toBe("10,120,240,255");
    expect(isNeutral(NEUTRAL_ADJUSTMENTS)).toBe(true);
});

test("brightness scales channels and clamps; alpha is preserved", () => {
    const buf = solid(100, 200, 50);
    applyAdjustments(buf, { ...NEUTRAL_ADJUSTMENTS, brightness: 50 });
    expect(px(buf).join()).toBe("150,255,75,255");
});

test("saturation -100 makes the image gray", () => {
    const buf = solid(200, 50, 50);
    applyAdjustments(buf, { ...NEUTRAL_ADJUSTMENTS, saturation: -100 });
    const [r, g, b] = px(buf);
    expect(r === g && g === b).toBe(true);
});

test("warmth shifts red up and blue down", () => {
    const buf = solid(100, 100, 100);
    applyAdjustments(buf, { ...NEUTRAL_ADJUSTMENTS, warmth: 50 });
    const [r, g, b] = px(buf);
    expect(r > 100 && g === 100 && b < 100).toBe(true);
});

test("vignette darkens corners more than the center", () => {
    const buf = solid(200, 200, 200, 21, 21);
    applyAdjustments(buf, { ...NEUTRAL_ADJUSTMENTS, vignette: 100 });
    const center = px(buf, 10 * 21 + 10)[0];
    const corner = px(buf, 0)[0];
    expect(center === 200 && corner < 120).toBe(true);
});

test("every filter preset only uses known adjustment keys", () => {
    const keys = Object.keys(NEUTRAL_ADJUSTMENTS).sort().join();
    for (const preset of FILTER_PRESETS) expect(Object.keys(preset.adjustments).sort().join()).toBe(keys);
});

test("rotation wraps around and swaps the output size", () => {
    expect(rotateBy(IDENTITY_GEOMETRY, -90).rotate).toBe(270);
    expect(rotateBy(rotateBy(IDENTITY_GEOMETRY, 90), 90).rotate).toBe(180);
    expect(rotatedSize(1024, 768, 90).width).toBe(768);
    expect(rotatedSize(1024, 768, 180).width).toBe(1024);
});
