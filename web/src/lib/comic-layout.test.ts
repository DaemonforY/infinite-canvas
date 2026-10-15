import { describe, expect, test } from "bun:test";

import { cellPrompt, COMIC_STYLES, panelSegments, type ComicCharacter, type ComicPanel } from "./comic";
import { balloonPath, balloonSlots, bubbleBox, COMIC_LAYOUTS, coverPlacement, layoutPage, layoutScene, pageLabelBox, placeCellBubbles, placeSlideBubbles, ratioFor, SUB_LINE_BASE, titleCard, titlePaint } from "./comic-layout";

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

describe("小红书多图", () => {
    test("slides parse with cover titles, captions and cliffhangers", async () => {
        const { parseStory } = await import("./comic");
        const story = parseStory(
            '{"title":"上班","coverTitles":["入职第一天，我把周报交成了爪印","标题二"],"characters":[{"name":"阿橘","look":"橘猫"}],"slides":[{"beat":"封面","action":"阿橘大表情"},{"beat":"转折","action":"主管出现","caption":"下班前","hook":"周报是什么？","lines":[{"speaker":"柴主管","text":"周报呢？"}]}]}',
            18,
        );
        expect(story.coverTitles).toEqual(["入职第一天，我把周报交成了爪印", "标题二"]);
        expect(story.panels[1].caption).toBe("下班前");
        expect(story.panels[1].hook).toBe("周报是什么？");
        expect(story.panels[0].caption).toBeUndefined();
    });

    test("a slides request asks for a cover and a 互动页, or lets the model pick the count", async () => {
        const { storyRequest } = await import("./comic");
        expect(storyRequest({ idea: "猫上班", genre: "funny", panelCount: 0, format: "slides", cta: true })).toContain("5–9 张");
        const fixed = storyRequest({ idea: "猫上班", genre: "funny", panelCount: 7, format: "slides", cta: false });
        expect(fixed).toContain("一共 7 张");
        expect(fixed).toContain("最后一张是结局");
    });

    test("the cover and 互动页 prompts leave room for big text", async () => {
        const { slidePrompt } = await import("./comic");
        const panels: ComicPanel[] = [
            { id: "a", beat: "封面", shot: "特写", action: "大表情", place: "", characters: [], lines: [], note: "" },
            { id: "b", beat: "互动", shot: "中景", action: "挥手", place: "", characters: [], lines: [], note: "", caption: "你呢？" },
        ];
        expect(slidePrompt({ panels, characters: [], style: COMIC_STYLES[0] }, 0, [])).toContain("上方 35%");
        expect(slidePrompt({ panels, characters: [], style: COMIC_STYLES[0] }, 1, [])).toContain("上半部分");
    });

    test("default slide lettering: cover title, question, balloons and the caption bar", () => {
        let n = 0;
        const bubbles = placeSlideBubbles(
            [
                { beat: "封面", lines: [] },
                { beat: "转折", caption: "下班前", lines: [{ text: "周报呢？", kind: "speech" }] },
                { beat: "互动", caption: "你呢？", lines: [] },
            ],
            "入职第一天",
            () => `b${++n}`,
        );
        expect(bubbles.map((bubble) => [bubble.panel, bubble.kind, bubble.text])).toEqual([
            [0, "title", "入职第一天"],
            [1, "speech", "周报呢？"],
            [1, "caption", "下班前"],
            [2, "title", "你呢？"],
        ]);
        const caption = bubbles.find((bubble) => bubble.kind === "caption")!;
        expect(caption.y + caption.h).toBeCloseTo(1);
    });

    test("caption bars get a strip, titles none, and the page label sits top right", () => {
        const laid = layoutScene(
            {
                width: 1080,
                height: 1440,
                bubbles: [
                    { id: "a", panel: 0, line: 0, text: "下班前", kind: "caption", x: 0, y: 0.875, w: 1, h: 0.125, drawn: true },
                    { id: "b", panel: 0, line: 1, text: "入职第一天", kind: "title", x: 0.05, y: 0.05, w: 0.9, h: 0.2, drawn: true },
                ],
            },
            measure,
        );
        expect(laid[0].path).toMatch(/^M0 1260/);
        expect(laid[1].path).toBe("");
        expect(laid[1].lineWidths[0]).toBe(measure(laid[1].lines[0], laid[1].fontSize));
        const label = pageLabelBox({ width: 1080, height: 1440, pageLabel: "2/7" }, measure);
        expect(label.x + label.w).toBeLessThan(1080);
        expect(label.y).toBeLessThan(60);
    });

    test("B期: a two-panel slide is drawn as two equal panels with both scenes", async () => {
        const { slidePrompt } = await import("./comic");
        const panel: ComicPanel = {
            id: "a",
            beat: "转折",
            shot: "中景",
            action: "主管走来",
            place: "工位",
            characters: [],
            lines: [],
            note: "",
            caption: "下班前",
            sub: { shot: "特写", action: "阿橘假装睡着", place: "工位", characters: [], lines: [] },
        };
        const prompt = slidePrompt({ panels: [panel], characters: [], style: COMIC_STYLES[0] }, 0, []);
        expect(prompt).toContain("上下两格");
        expect(prompt).toContain("上格：");
        expect(prompt).toContain("阿橘假装睡着");
        expect(prompt).toContain("字幕条");
    });

    test("B期: splitting a two-panel slide keeps both scenes; the caption and hook go to the second", async () => {
        const { splitTwoPanelSlide, canHoldTwoPanels } = await import("./comic");
        let n = 0;
        const panel: ComicPanel = { id: "a", beat: "转折", shot: "中景", action: "上", place: "", characters: [], lines: [], note: "为什么", caption: "字幕", hook: "然后呢", sub: { shot: "特写", action: "下", place: "", characters: [], lines: [] } };
        const [first, second] = splitTwoPanelSlide(panel, () => `n${++n}`);
        expect([first.action, second.action]).toEqual(["上", "下"]);
        expect(first.sub).toBeUndefined();
        expect([first.caption, second.caption, first.hook, second.hook]).toEqual([undefined, "字幕", undefined, "然后呢"]);
        expect(new Set([first.id, second.id, panel.id]).size).toBe(3);
        expect(canHoldTwoPanels({ beat: "封面" })).toBe(false);
        expect(canHoldTwoPanels({ beat: "转折" })).toBe(true);
    });

    test("B期: a two-panel slide letters each half, with its own line numbers", () => {
        let n = 0;
        const bubbles = placeSlideBubbles([{ beat: "转折", caption: "下班前", lines: [{ text: "周报呢？", kind: "speech" }], sub: { lines: [{ text: "呼……", kind: "thought" }] } }], "", () => `b${++n}`);
        const top = bubbles.find((bubble) => bubble.text === "周报呢？")!;
        const bottom = bubbles.find((bubble) => bubble.text === "呼……")!;
        expect(top.y + top.h).toBeLessThan(0.5);
        expect(bottom.y).toBeGreaterThan(0.5);
        expect(bottom.y + bottom.h).toBeLessThan(0.875);
        expect(bottom.line).toBeGreaterThan(SUB_LINE_BASE);
        expect(bubbles.at(-1)?.kind).toBe("caption");
    });

    test("B期: title styles paint a highlighter, a white card or an outline", () => {
        expect(titlePaint().highlight).toBe(true);
        expect(titlePaint("box")).toMatchObject({ highlight: false, card: true, fill: "#111" });
        expect(titlePaint("outline")).toMatchObject({ highlight: false, card: false, fill: "#fff", stroke: "#111" });
        const card = titleCard({ fontSize: 100, lines: ["一", "二"], lineWidths: [300, 200] });
        expect(card.w).toBeGreaterThan(300);
        expect(card.h).toBeGreaterThan(250);
        expect(card.x).toBe(-card.w / 2);
        const scene = { width: 1080, height: 1440, bubbles: [{ id: "t", panel: 0, line: 0, text: "入职第一天我把周报交成了爪印", kind: "title" as const, x: 0.05, y: 0.04, w: 0.9, h: 0.24, drawn: true }] };
        const plain = layoutScene(scene, measure)[0];
        const boxed = layoutScene({ ...scene, titleStyle: "box" }, measure)[0];
        expect(boxed.titleStyle).toBe("box");
        expect(boxed.fontSize).toBeLessThanOrEqual(plain.fontSize);
    });

    test("balloons sit over their speaker (left to right as the prompt asks) and keep the reading order", async () => {
        const slots = balloonSlots([
            { text: "a", kind: "speech", speaker: "小林" },
            { text: "b", kind: "shout", speaker: "林爸" },
            { text: "c", kind: "speech", speaker: "小林" },
        ]);
        expect(slots.map((slot) => [slot!.side, slot!.row, slot!.tail])).toEqual([
            [0, 0, "left"],
            [1, 0, "none"],
            [0, 1, "left"],
        ]);
        // The right-hand speaker talks first: the left one is read after, so it goes one row down.
        const rightFirst = balloonSlots([
            { text: "a", kind: "speech", speaker: "林妈" },
            { text: "b", kind: "thought", speaker: "小林" },
            { text: "c", kind: "speech", speaker: "林妈" },
        ]);
        expect(rightFirst.map((slot) => [slot!.side, slot!.row])).toEqual([
            [0, 0],
            [1, 0],
            [0, 1],
        ]);
        // One speaker stands right of centre: balloons stack at the upper left with the tail toward them.
        expect(
            balloonSlots([
                { text: "a", kind: "speech", speaker: "主人" },
                { text: "b", kind: "thought", speaker: "主人" },
            ]).map((slot) => [slot!.side, slot!.row, slot!.tail]),
        ).toEqual([
            [0, 0, "right"],
            [0, 1, "right"],
        ]);
        const { slidePrompt, cellPrompt } = await import("./comic");
        const solo: ComicPanel = { id: "s", beat: "交代", shot: "中景", action: "x", place: "", characters: [], lines: [{ speaker: "主人", text: "豆包？", kind: "speech" }], note: "" };
        expect(slidePrompt({ panels: [solo], characters: [], style: COMIC_STYLES[0] }, 0, [])).toContain("说话的主人在画面中间偏右，左上方留出空白放对白");
        const panel: ComicPanel = {
            id: "p",
            beat: "转折",
            shot: "中景",
            action: "x",
            place: "",
            characters: [],
            lines: [
                { speaker: "小林", text: "爸", kind: "speech" },
                { speaker: "林爸", text: "喂", kind: "shout" },
            ],
            note: "",
        };
        expect(slidePrompt({ panels: [panel], characters: [], style: COMIC_STYLES[0] }, 0, [])).toContain("从左到右依次是小林、林爸");
        expect(cellPrompt({ panels: [panel], characters: [], style: COMIC_STYLES[0] }, 0, [], "1:1")).toContain("从左到右依次是小林、林爸");
        expect(slidePrompt({ panels: [panel], characters: [], style: COMIC_STYLES[0] }, 0, [])).toContain("四分之一");
    });

    test("a line never ends with one or two characters on its own", async () => {
        const { fitText } = await import("./comic");
        const fit = fitText("给你们换新手机啦！", 7 * 10, 100, (text, size) => Array.from(text).length * size, 10);
        expect(fit.lines).toHaveLength(2);
        expect(Array.from(fit.lines[1]).length).toBeGreaterThan(2);
        // A break at the comma is kept even though 「是谁？」 is short.
        expect(fitText("你家最会偷吃的，是谁？", 9 * 10, 100, (text, size) => Array.from(text).length * size, 10).lines).toEqual(["你家最会偷吃的，", "是谁？"]);
    });

    test("the note parses and strips # from tags", async () => {
        const { parseNote } = await import("./comic");
        expect(parseNote('好的 {"title":"入职第一天😹","body":"第一行\\n你呢？","tags":["#打工人日常","原创漫画"]}')).toEqual({ title: "入职第一天😹", body: "第一行\n你呢？", tags: ["打工人日常", "原创漫画"] });
        expect(() => parseNote("{}")).toThrow();
    });
});
