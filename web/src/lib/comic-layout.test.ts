import { describe, expect, test } from "bun:test";

import { cellPrompt, COMIC_STYLES, panelSegments, type ComicCharacter, type ComicPanel } from "./comic";
import { balloonPath, bubbleBox, COMIC_LAYOUTS, coverPlacement, layoutPage, layoutScene, placeCellBubbles, ratioFor } from "./comic-layout";

const measure = (text: string, size: number) => Array.from(text).length * size;

describe("layouts", () => {
    test("cells stay inside the page and never overlap, for 4 and 6 panels", () => {
        for (const layout of COMIC_LAYOUTS) {
            for (const count of [4, 6]) {
                const page = layoutPage(layout, count);
                expect(page.cells).toHaveLength(count);
                for (const [i, a] of page.cells.entries()) {
                    expect(a.x).toBeGreaterThanOrEqual(0);
                    expect(a.y).toBeGreaterThanOrEqual(0);
                    expect(a.x + a.w).toBeLessThanOrEqual(page.width);
                    expect(a.y + a.h).toBeLessThanOrEqual(page.height);
                    for (const b of page.cells.slice(i + 1)) {
                        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
                        expect(overlap).toBe(false);
                    }
                }
            }
        }
    });

    test("manga alternates one wide panel and two narrow ones; strip is one per row", () => {
        const manga = layoutPage("manga", 4);
        expect(manga.cells[0].w).toBeGreaterThan(manga.cells[1].w * 1.8);
        expect(manga.cells[1].y).toBe(manga.cells[2].y);
        const strip = layoutPage("strip", 4);
        expect(new Set(strip.cells.map((cell) => cell.x)).size).toBe(1);
    });

    test("panels are drawn in the ratio closest to their cell", () => {
        expect(ratioFor({ w: 1024, h: 440 })).toBe("21:9");
        expect(ratioFor({ w: 500, h: 520 })).toBe("1:1");
        expect(ratioFor({ w: 500, h: 640 })).toBe("3:4");
    });

    test("an image covers its cell, cropped around the focus", () => {
        const cell = { x: 10, y: 10, w: 200, h: 100 };
        const centred = coverPlacement(cell, 400, 400);
        expect(centred.w).toBe(200);
        expect(centred.y).toBe(10 - 50);
        expect(coverPlacement(cell, 400, 400, { x: 0.5, y: 0 }).y).toBe(10);
        expect(coverPlacement(cell, 400, 400, { x: 0.5, y: 1 }).y).toBe(10 - 100);
    });
});

describe("balloons", () => {
    const box = { x: 0, y: 0, w: 200, h: 100 };
    test("every kind but sound effects has a closed path; tails add a subpath", () => {
        for (const kind of ["speech", "thought", "shout", "narration"] as const) expect(balloonPath(kind, box)).toMatch(/^M.*Z$/);
        expect(balloonPath("sfx", box)).toBe("");
        expect(balloonPath("speech", box, "left").split("M").length).toBeGreaterThan(balloonPath("speech", box, "none").split("M").length);
        // A left tail points left of centre, a right tail right of it.
        const tip = (path: string) => Number(path.split("L")[1].split(" ")[0]);
        expect(tip(balloonPath("speech", box, "left"))).toBeLessThan(100);
        expect(tip(balloonPath("speech", box, "right"))).toBeGreaterThan(100);
    });
});

describe("cell lettering", () => {
    test("default balloons sit in the top of the cell, narration first, speakers left then right", () => {
        let n = 0;
        const bubbles = placeCellBubbles(
            [
                {
                    lines: [
                        { text: "旁白", kind: "narration" },
                        { text: "甲", kind: "speech" },
                        { text: "乙", kind: "shout" },
                    ],
                },
            ],
            () => `b${++n}`,
        );
        expect(bubbles.every((bubble) => bubble.cell && bubble.drawn)).toBe(true);
        expect(bubbles[0].y).toBeLessThan(bubbles[1].y);
        expect(bubbles[1].x).toBeLessThan(bubbles[2].x);
        expect(bubbles[2].tail).toBe("none");
    });

    test("cell-relative bubbles follow their cell when the layout changes", () => {
        const bubble = { x: 0.5, y: 0.5, w: 0.2, h: 0.2, panel: 1, cell: true };
        const a = layoutPage("strip", 4);
        const b = layoutPage("grid", 4);
        const inA = bubbleBox(bubble, { width: a.width, height: a.height, cells: a.cells.map((rect) => ({ rect })) });
        const inB = bubbleBox(bubble, { width: b.width, height: b.height, cells: b.cells.map((rect) => ({ rect })) });
        expect(inA.x).toBeCloseTo(a.cells[1].x + a.cells[1].w * 0.5);
        expect(inB.y).toBeCloseTo(b.cells[1].y + b.cells[1].h * 0.5);
    });

    test("scene layout gives drawn balloons a path and sound effects none", () => {
        const laid = layoutScene(
            {
                width: 1000,
                height: 1000,
                bubbles: [
                    { id: "a", panel: 0, line: 0, text: "你好呀", kind: "speech", x: 0.1, y: 0.1, w: 0.3, h: 0.1, drawn: true },
                    { id: "b", panel: 0, line: 1, text: "砰！", kind: "sfx", x: 0.5, y: 0.5, w: 0.3, h: 0.12, drawn: true, rotate: -12 },
                ],
            },
            measure,
        );
        expect(laid[0].path).not.toBe("");
        expect(laid[1].path).toBe("");
        expect(laid[1].fontSize).toBeGreaterThan(laid[0].fontSize);
    });
});

describe("cell prompts", () => {
    const cat: ComicCharacter = { id: "c", name: "阿橘", role: "主角", look: "橘猫", sheets: [{ url: "x", width: 1, height: 1 }], sheet: 0 };
    const panel: ComicPanel = { id: "p", beat: "起", shot: "远景", action: "握拳", place: "门口", characters: ["阿橘"], lines: [{ speaker: "阿橘", text: "冲！", kind: "shout" }], note: "" };
    test("a panel prompt asks for room for text but no balloons, and names the sheet", () => {
        const prompt = cellPrompt({ panels: [panel], characters: [cat], style: COMIC_STYLES[0] }, 0, [cat], "21:9");
        expect(prompt).toContain("横版");
        expect(prompt).toContain("阿橘是图片1里的角色");
        expect(prompt).toContain("不要画漫画分格边框、对话气泡");
        expect(panelSegments(panel, [cat], COMIC_STYLES[0], "cells").at(-1)?.text).toContain("留出一些干净的空白");
    });
});
