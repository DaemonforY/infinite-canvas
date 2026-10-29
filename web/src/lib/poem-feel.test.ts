import { describe, expect, test } from "bun:test";

import { createSealLayer, createTextLayer, glyphJitters, layoutLayer, seededRandom, textureMarks } from "./image-editor/text-layers";
import { feelLayers, posterLayers, titleArea, blankHint } from "./poem";

describe("质感", () => {
    const title = createTextLayer({ id: "poem-title", text: "村居", color: "#f6eedc", effect: "shadow" });
    const body = createTextLayer({ id: "poem-body", text: "草长莺飞", color: "#2b2622", effect: "shadow", rules: true });
    const seal = createSealLayer({ id: "poem-seal", text: "诗画" });

    test("干净 leaves the layers alone", () => {
        const layers = [title, body, seal];
        expect(feelLayers(layers, "clean")).toBe(layers);
        expect(feelLayers(layers, undefined)).toBe(layers);
    });

    test("印在纸上: ink multiplied without a shadow, light text kept, seal specked but not multiplied", () => {
        const [t, b, s] = feelLayers([title, body, seal], "print");
        expect(t.blend).toBeUndefined();
        expect(t.effect).toBe("shadow");
        expect(t.texture ?? 0).toBe(0);
        expect(b.blend).toBe("multiply");
        expect(b.effect).toBe("none");
        expect(b.opacity).toBeLessThan(1);
        expect(s.blend).toBeUndefined();
        expect(s.texture).toBeGreaterThan(0);
    });

    test("笔墨: 飞白 and variation, half on the lines; the seed is passed on", () => {
        const [t, b] = feelLayers([title, body], "brush", { texture: 0.6, jitter: 0.8, seed: 7 });
        expect(t.texture).toBeCloseTo(0.6);
        expect(t.jitter).toBeCloseTo(0.8);
        expect(b.texture).toBeCloseTo(0.3);
        expect(b.jitter).toBeCloseTo(0.4);
        expect(t.seed).toBe(7);
    });
});

describe("texture and variation", () => {
    test("seeded: the same seed gives the same marks and variation, another seed differs", () => {
        const box = { x: 0, y: 0, w: 100, h: 200 };
        expect(textureMarks(5, box, 50, 0.5)).toEqual(textureMarks(5, box, 50, 0.5));
        expect(textureMarks(6, box, 50, 0.5)).not.toEqual(textureMarks(5, box, 50, 0.5));
        expect(textureMarks(5, box, 50, 0)).toEqual([]);
        expect(textureMarks(5, box, 50, 1).length).toBeGreaterThan(textureMarks(5, box, 50, 0.3).length);
        expect(glyphJitters(3, 4, 1)).toEqual(glyphJitters(3, 4, 1));
        const r = seededRandom(1);
        const values = Array.from({ length: 100 }, r);
        expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
        expect(Math.max(...values)).toBeLessThan(1);
    });

    test("variation stays small: ±4 % size, ±2°, ±3 % offset", () => {
        for (const j of glyphJitters(9, 50, 1)) {
            expect(Math.abs(j.scale - 1)).toBeLessThanOrEqual(0.04);
            expect(Math.abs(j.angle)).toBeLessThanOrEqual(2);
            expect(Math.abs(j.dx)).toBeLessThanOrEqual(0.03);
        }
        expect(glyphJitters(9, 3, 0).every((j) => j.scale === 1 && j.angle === 0)).toBe(true);
    });
});

describe("落款", () => {
    const aspect = 2 / 3;
    const W = 1000;
    const H = W / aspect;
    const measure = (_: string, px: number) => px;
    const make = (signature: "side" | "below" | "stamp") =>
        posterLayers({ title: "村居", author: "高鼎", lines: "草长莺飞二月天\n拂堤杨柳醉春烟", titleBox: titleArea("2:3"), bodyBox: blankHint("2:3", "poster"), aspect, font: "lxgw-wenkai", titleFont: "ma-shan-zheng", titleInk: "light", bodyInk: "ink", seal: "诗画", signature });

    test("题下: the author under the title, the seal under the author", () => {
        const [title, author, seal] = make("below");
        const tb = layoutLayer(title, W, H, measure).box;
        const ab = layoutLayer(author, W, H, measure).box;
        const sb = layoutLayer(seal, W, H, measure).box;
        expect(ab.y).toBeGreaterThanOrEqual(tb.y + tb.h);
        expect(ab.y - (tb.y + tb.h)).toBeLessThan(tb.w * 0.2);
        expect(Math.abs(ab.x + ab.w / 2 - (tb.x + tb.w / 2))).toBeLessThan(2);
        expect(sb.y).toBeGreaterThan(ab.y + ab.h);
    });

    test("印压字: the seal overlaps the name's last character", () => {
        const [, author, seal] = make("stamp");
        const ab = layoutLayer(author, W, H, measure).box;
        const sb = layoutLayer(seal, W, H, measure).box;
        expect(sb.y).toBeLessThan(ab.y + ab.h);
        expect(sb.y).toBeGreaterThan(ab.y + ab.h / 2);
        expect(sb.x).toBeLessThan(ab.x + ab.w);
        // 题旁 keeps the seal clear of the name.
        const [, a2, s2] = make("side");
        expect(layoutLayer(s2, W, H, measure).box.y).toBeGreaterThan(layoutLayer(a2, W, H, measure).box.y + layoutLayer(a2, W, H, measure).box.h);
    });
});
