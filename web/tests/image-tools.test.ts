import { expect, test } from "bun:test";

import { isHeicFile, isImageFile, qualitySteps, renameForType, resolveOutputSize, resolveOutputType } from "../src/lib/image-tools";

test("resize presets never upscale and keep the aspect ratio", () => {
    expect(resolveOutputSize(4032, 3024, { mode: "longEdge", value: 2048 })).toEqual({ width: 2048, height: 1536, capped: false });
    expect(resolveOutputSize(800, 600, { mode: "longEdge", value: 2048 })).toEqual({ width: 800, height: 600, capped: false });
    expect(resolveOutputSize(1000, 500, { mode: "percent", value: 50 })).toEqual({ width: 500, height: 250, capped: false });
    expect(resolveOutputSize(1000, 500, { mode: "none" })).toEqual({ width: 1000, height: 500, capped: false });
});

test("48MP photos are scaled to the browser canvas limit", () => {
    const out = resolveOutputSize(8064, 6048, { mode: "none" });
    expect(out.capped).toBe(true);
    expect(out.width * out.height).toBeLessThanOrEqual(16_777_216);
    expect(Math.abs(out.width / out.height - 8064 / 6048)).toBeLessThan(0.01);
});

test("keeping the format keeps JPEG / PNG / WebP and turns the rest into JPEG", () => {
    expect(resolveOutputType("image/png", "original")).toBe("image/png");
    expect(resolveOutputType("image/heic", "original")).toBe("image/jpeg");
    expect(resolveOutputType("image/gif", "original")).toBe("image/jpeg");
    expect(resolveOutputType("image/png", "webp")).toBe("image/webp");
});

test("output names follow the new type", () => {
    expect(renameForType("IMG_0001.HEIC", "image/jpeg")).toBe("IMG_0001.jpg");
    expect(renameForType("a.b.png", "image/webp")).toBe("a.b.webp");
    expect(renameForType("", "image/png")).toBe("image.png");
});

test("HEIC photos are recognised even when the browser gives no type", () => {
    expect(isHeicFile({ name: "IMG_1.heic", type: "" })).toBe(true);
    expect(isHeicFile({ name: "x.jpg", type: "image/heif" })).toBe(true);
    expect(isImageFile({ name: "IMG_1.HEIC", type: "" })).toBe(true);
    expect(isImageFile({ name: "notes.pdf", type: "application/pdf" })).toBe(false);
});

test("target-size search lowers the quality step by step", () => {
    expect(qualitySteps(0.85)).toEqual([0.85, 0.8, 0.7, 0.6, 0.5]);
    expect(qualitySteps(0.6)).toEqual([0.6, 0.5]);
});
