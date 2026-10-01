import { expect, test } from "bun:test";

import { planCollage, DEFAULT_COLLAGE_OPTIONS } from "../src/lib/image-collage";
import { hasWatermark, isLightColor, watermarkFontSize, watermarkOrigin } from "../src/lib/image-tools";
import { nearestRatio, planOutpaint } from "../src/lib/outpaint";

test("watermark text size follows the short edge and the corners keep a margin", () => {
    expect(watermarkFontSize(4000, 3000, 4)).toBe(120);
    expect(watermarkFontSize(100, 100, 1)).toBe(10);
    expect(watermarkOrigin(1000, 800, 200, 40, 20, "br")).toEqual({ x: 780, y: 740 });
    expect(watermarkOrigin(1000, 800, 200, 40, 20, "tl")).toEqual({ x: 20, y: 20 });
    expect(watermarkOrigin(1000, 800, 200, 40, 20, "c")).toEqual({ x: 400, y: 380 });
    expect(watermarkOrigin(1000, 800, 200, 40, 20, "ml")).toEqual({ x: 20, y: 380 });
    expect(watermarkOrigin(1000, 800, 200, 40, 20, "tc")).toEqual({ x: 400, y: 20 });
    expect(hasWatermark({ text: "  ", color: "#fff", opacity: 1, size: 4, position: "br" })).toBe(false);
    expect(isLightColor("#ffffff")).toBe(true);
    expect(isLightColor("#000")).toBe(false);
});

test("a vertical collage stacks the images at one width", () => {
    const plan = planCollage(
        [
            { width: 1000, height: 500 },
            { width: 500, height: 1000 },
        ],
        { ...DEFAULT_COLLAGE_OPTIONS, layout: "vertical", edge: 1000, gap: 10 },
    );
    expect(plan.width).toBe(1000);
    expect(plan.cells[0]).toMatchObject({ x: 10, y: 10, width: 980, height: 490 });
    expect(plan.cells[1]).toMatchObject({ x: 10, y: 510, width: 980, height: 1960 });
    expect(plan.height).toBe(510 + 1960 + 10);
});

test("a horizontal collage lines the images up at one height", () => {
    const plan = planCollage(
        [
            { width: 400, height: 200 },
            { width: 300, height: 600 },
        ],
        { ...DEFAULT_COLLAGE_OPTIONS, layout: "horizontal", edge: 600, gap: 0 },
    );
    expect(plan.height).toBe(600);
    expect(plan.cells.map((cell) => cell.width)).toEqual([1200, 300]);
    expect(plan.width).toBe(1500);
});

test("a grid crops to square cells and centres a short last row", () => {
    const sizes = [
        { width: 800, height: 600 },
        { width: 600, height: 800 },
        { width: 500, height: 500 },
        { width: 500, height: 500 },
        { width: 500, height: 500 },
    ];
    const plan = planCollage(sizes, { ...DEFAULT_COLLAGE_OPTIONS, layout: "grid", columns: 3, edge: 940, gap: 10 });
    expect(plan.width).toBe(940);
    expect(plan.height).toBe(10 + 2 * 310);
    expect(plan.cells[0]).toMatchObject({ x: 10, y: 10, width: 300, height: 300, crop: { sx: 100, sy: 0, sw: 600, sh: 600 } });
    expect(plan.cells[1].crop).toEqual({ sx: 0, sy: 100, sw: 600, sh: 600 });
    // Two images in the last row of three: shifted by half a cell.
    expect(plan.cells[3]).toMatchObject({ x: 165, y: 320 });
    expect(plan.cells[4]).toMatchObject({ x: 475, y: 320 });
});

test("very long collages are scaled down to the canvas limits", () => {
    const sizes = Array.from({ length: 30 }, () => ({ width: 1000, height: 1500 }));
    const plan = planCollage(sizes, { ...DEFAULT_COLLAGE_OPTIONS, layout: "vertical", edge: 2048, gap: 0 });
    expect(plan.scaled).toBe(true);
    expect(plan.height).toBeLessThanOrEqual(16_384);
    expect(plan.width * plan.height).toBeLessThanOrEqual(16_777_216);
});

test("outpainting widens or heightens to the ratio and places the original", () => {
    expect(planOutpaint(1000, 1000, "16:9", 1, "center")).toEqual({ width: 1778, height: 1000, x: 389, y: 0, size: "16:9" });
    expect(planOutpaint(1000, 1000, "9:16", 1, "start")).toEqual({ width: 1000, height: 1778, x: 0, y: 0, size: "9:16" });
    expect(planOutpaint(1000, 1000, "3:4", 1, "end")).toMatchObject({ y: 333 });
    // Same ratio with no zoom adds nothing.
    expect(planOutpaint(1000, 1000, "1:1", 1, "center")).toBeNull();
    // Zoom out keeps the closest standard ratio and centres.
    expect(planOutpaint(1200, 900, "keep", 1.5, "center")).toEqual({ width: 1800, height: 1350, x: 300, y: 225, size: "4:3" });
    expect(nearestRatio(1920, 1080)).toBe("16:9");
    expect(nearestRatio(1000, 1010)).toBe("1:1");
});
