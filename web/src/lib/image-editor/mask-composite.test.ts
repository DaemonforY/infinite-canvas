import { describe, expect, test } from "bun:test";

import { blendByMask, featherAlpha, resultPlacement } from "./mask-composite";

describe("featherAlpha", () => {
    test("keeps the inside opaque, softens the edge and leaves far pixels untouched", () => {
        const w = 21;
        const alpha = new Uint8ClampedArray(w);
        for (let x = 8; x <= 12; x++) alpha[x] = 255; // a 5 px painted stripe in one row
        const out = featherAlpha(alpha, w, 1, 2);
        expect(out[10]).toBe(255);
        expect(out[8]).toBe(255);
        expect(out[6]).toBeGreaterThan(0);
        expect(out[6]).toBeLessThan(255);
        expect(out[0]).toBe(0);
        expect(out[20]).toBe(0);
    });

    test("radius 0 only applies the gain", () => {
        expect(Array.from(featherAlpha(new Uint8ClampedArray([0, 100, 200]), 3, 1, 0))).toEqual([0, 200, 255]);
    });
});

describe("blendByMask", () => {
    test("original where the mask is 0, result where it is 255, a mix in between", () => {
        const original = new Uint8ClampedArray([10, 10, 10, 255, 10, 10, 10, 255, 10, 10, 10, 255]);
        const result = new Uint8ClampedArray([200, 200, 200, 255, 200, 200, 200, 255, 200, 200, 200, 255]);
        const out = blendByMask(original, result, new Uint8ClampedArray([0, 255, 128]));
        expect(Array.from(out.slice(0, 4))).toEqual([10, 10, 10, 255]);
        expect(Array.from(out.slice(4, 8))).toEqual([200, 200, 200, 255]);
        expect(out[8]).toBeGreaterThan(100);
        expect(out[8]).toBeLessThan(110);
    });
});

describe("resultPlacement", () => {
    test("stretches a result whose aspect ratio is within 3 %", () => {
        expect(resultPlacement(1024, 1536, 1000, 1500)).toEqual({ x: 0, y: 0, width: 1000, height: 1500 });
        expect(resultPlacement(1024, 1536, 1000, 1480)).toEqual({ x: 0, y: 0, width: 1000, height: 1480 });
    });

    test("covers and centres a result with a different shape", () => {
        // A square result over a 2:1 original is scaled to the width and cropped top and bottom.
        expect(resultPlacement(1000, 1000, 2000, 1000)).toEqual({ x: 0, y: -500, width: 2000, height: 2000 });
    });
});
