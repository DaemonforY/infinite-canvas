import { describe, expect, test } from "bun:test";

import { createSealLayer, createTextLayer, layoutLayer, poemTemplate, splitLines, verticalForm } from "./text-layers";

const measure = (_ch: string, fontPx: number) => fontPx; // every glyph one em wide

describe("splitLines", () => {
    test("line breaks first, then every wrapAt characters", () => {
        expect(splitLines("东南形胜三吴都会\n钱塘", 4).map((l) => l.join(""))).toEqual(["东南形胜", "三吴都会", "钱塘"]);
        expect(splitLines("一二三", 0).map((l) => l.join(""))).toEqual(["一二三"]);
    });

    test("trailing blank lines don't add empty columns", () => {
        expect(splitLines("望海潮\n\n", 0).map((l) => l.join(""))).toEqual(["望海潮"]);
    });
});

describe("verticalForm", () => {
    test("maps punctuation to vertical forms and keeps characters", () => {
        expect(["，", "。", "「", "」", "《", "…", "望"].map(verticalForm).join("")).toBe("︐︒﹁﹂︽︙望");
    });
});

describe("layoutLayer (vertical)", () => {
    test("columns run right to left, characters top to bottom", () => {
        const layer = createTextLayer({ text: "东南\n钱塘", vertical: true, size: 0.1, x: 0, y: 0, letterSpacing: 0, lineSpacing: 0.5 });
        const { glyphs, box } = layoutLayer(layer, 1000, 1000, measure);
        // 100px font, 150px column step: block is 250 wide, first column on the right.
        expect(box).toEqual({ x: 0, y: 0, w: 250, h: 200 });
        expect(glyphs.map((g) => [g.ch, g.x, g.y])).toEqual([
            ["东", 200, 50],
            ["南", 200, 150],
            ["钱", 50, 50],
            ["塘", 50, 150],
        ]);
    });

    test("punctuation uses vertical forms", () => {
        const layer = createTextLayer({ text: "形胜，", vertical: true });
        expect(
            layoutLayer(layer, 1000, 1000, measure)
                .glyphs.map((g) => g.ch)
                .join(""),
        ).toBe("形胜︐");
    });

    test("center alignment centres short columns against the longest", () => {
        const layer = createTextLayer({ text: "一二三四\n五六", vertical: true, size: 0.1, x: 0, y: 0, letterSpacing: 0, align: "center" });
        const glyphs = layoutLayer(layer, 1000, 1000, measure).glyphs;
        expect(glyphs.find((g) => g.ch === "五")?.y).toBe(150);
    });
});

describe("layoutLayer (horizontal)", () => {
    test("lines stack downwards and letter spacing widens the block", () => {
        const layer = createTextLayer({ text: "AB\nC", size: 0.1, x: 0.1, y: 0.2, letterSpacing: 0.2, lineSpacing: 0.5 });
        const { glyphs, box } = layoutLayer(layer, 1000, 1000, measure);
        expect(box).toEqual({ x: 100, y: 200, w: 220, h: 250 });
        expect(glyphs.map((g) => [g.ch, g.x, g.y])).toEqual([
            ["A", 150, 250],
            ["B", 270, 250],
            ["C", 150, 400],
        ]);
    });
});

describe("seal layout", () => {
    test("two characters make one column, three or four make two columns read right to left", () => {
        const two = layoutLayer(createSealLayer({ text: "柳永", x: 0, y: 0, size: 0.1 }), 1000, 1000, measure);
        expect(new Set(two.glyphs.map((g) => g.x)).size).toBe(1);
        expect(two.seal?.h).toBeGreaterThan(two.seal?.w ?? 0);

        const four = layoutLayer(createSealLayer({ text: "钱塘柳永", x: 0, y: 0, size: 0.1 }), 1000, 1000, measure);
        const [a, b, c, d] = four.glyphs;
        expect(a.x).toBe(b.x);
        expect(c.x).toBe(d.x);
        expect(a.x).toBeGreaterThan(c.x);
        expect(a.y).toBeLessThan(b.y);
    });

    test("only the first four non-space characters are used", () => {
        expect(
            layoutLayer(createSealLayer({ text: "一 二三四五" }), 1000, 1000, measure)
                .glyphs.map((g) => g.ch)
                .join(""),
        ).toBe("一二三四");
    });
});

describe("poemTemplate", () => {
    test("title, body and seal", () => {
        const layers = poemTemplate("望海潮", "东南形胜", "柳永");
        expect(layers.map((l) => [l.kind, l.text, l.vertical])).toEqual([
            ["text", "望海潮", true],
            ["text", "东南形胜", true],
            ["seal", "柳永", false],
        ]);
        expect(new Set(layers.map((l) => l.id)).size).toBe(3);
    });
});
