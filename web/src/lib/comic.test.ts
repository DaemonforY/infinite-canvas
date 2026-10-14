import { describe, expect, test } from "bun:test";

import { beatsFor, COMIC_STYLES, episodeSummary, keysToDelete, mergeComicData, storyRequest, type ComicProject, findBubbles, fitText, pagePrompt, panelRects, panelSegments, parseStory, placeBubbles, type ComicCharacter, type ComicPanel } from "./comic";

const cat: ComicCharacter = { id: "c1", name: "阿橘", role: "主角", look: "胖乎乎的橘猫，穿藏青西装、红领带", sheets: [{ url: "blob:1", width: 1536, height: 1024 }], sheet: 0 };
const boss: ComicCharacter = { id: "c2", name: "柴主管", role: "配角", look: "直立的柴犬，戴小方框眼镜，灰马甲", sheets: [], sheet: -1 };
const panel = (lines: ComicPanel["lines"], characters = ["阿橘"]): ComicPanel => ({ id: "p", beat: "起", shot: "远景", action: "站在写字楼门口握拳", place: "早晨的写字楼", characters, lines, note: "" });

describe("story", () => {
    test("parses JSON wrapped in prose and fences, dropping unknown characters and empty lines", () => {
        const text =
            '好的：\n```json\n{"title":"阿橘上班记","characters":[{"name":"阿橘","role":"主角","look":"橘猫"}],"panels":[{"beat":"起","shot":"大远景","action":"阿橘到公司","place":"门口","characters":["阿橘","路人"],"lines":[{"speaker":"阿橘","text":"上班啦！","kind":"shout"},{"speaker":"旁白","text":"第一天","kind":"?"},{"speaker":"阿橘","text":""}],"note":"远景交代地点"},{"beat":"承","action":""}]}\n```';
        const story = parseStory(text, 4);
        expect(story.title).toBe("阿橘上班记");
        expect(story.panels).toHaveLength(1);
        expect(story.panels[0].shot).toBe("远景");
        expect(story.panels[0].characters).toEqual(["阿橘"]);
        expect(story.panels[0].lines).toEqual([
            { speaker: "阿橘", text: "上班啦！", kind: "shout" },
            { speaker: "旁白", text: "第一天", kind: "narration" },
        ]);
    });

    test("rejects answers without panels", () => {
        expect(() => parseStory("对不起，我不能", 4)).toThrow();
        expect(() => parseStory('{"panels":[]}', 4)).toThrow();
    });

    test("six panels stretch the middle beats", () => {
        expect(beatsFor("funny", 4)).toEqual(["起", "承", "转", "合"]);
        expect(beatsFor("funny", 6)).toEqual(["起", "承", "承", "转", "转", "合"]);
        expect(beatsFor("brand", 6)[0]).toBe("痛点");
        expect(beatsFor("brand", 6)[5]).toBe("结果");
    });
});

describe("prompts", () => {
    test("panel segments carry the character look and ask for empty balloons", () => {
        const segments = panelSegments(panel([{ speaker: "阿橘", text: "上班啦", kind: "speech" }]), [cat, boss], COMIC_STYLES[0]);
        expect(segments.map((segment) => segment.kind)).toEqual(["shot", "who", "action", "place", "style", "space"]);
        expect(segments[1].text).toContain("红领带");
        expect(segments[5].text).toContain("1 个空白");
        expect(
            panelSegments(
                panel([
                    { speaker: "阿橘", text: "一", kind: "speech" },
                    { speaker: "柴主管", text: "二", kind: "speech" },
                ]),
                [cat, boss],
                COMIC_STYLES[0],
            ).at(-1)?.text,
        ).toContain("从左到右依次是阿橘、柴主管");
        expect(panelSegments(panel([]), [cat], COMIC_STYLES[0]).at(-1)?.text).toContain("不要画对话气泡");
    });

    test("the page prompt numbers the sheets and forbids text", () => {
        const prompt = pagePrompt({ panels: [panel([]), panel([], ["阿橘", "柴主管"])], characters: [cat, boss], style: COMIC_STYLES[0] }, [cat]);
        expect(prompt).toContain("阿橘是图片1里的角色");
        expect(prompt).not.toContain("图片2");
        expect(prompt).toContain("第 2 格");
        expect(prompt).toContain("不要出现任何文字");
    });

    test("pages lay out as stacked strips up to four panels, two columns beyond", () => {
        expect(panelRects(4)[3]).toEqual({ x: 0, y: 0.75, w: 1, h: 0.25 });
        expect(panelRects(6)[5]).toEqual({ x: 0.5, y: 2 / 3, w: 0.5, h: 1 / 3 });
    });
});

describe("bubbles", () => {
    // A 200×300 grey page with white gutters, two strips, and a white ellipse in the second strip.
    function page() {
        const width = 200;
        const height = 300;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const gutter = x < 4 || x >= width - 4 || y < 4 || y >= height - 4 || (y >= 146 && y < 154);
                const dx = (x - 60) / 40;
                const dy = (y - 200) / 22;
                const balloon = dx * dx + dy * dy <= 1;
                const value = gutter || balloon ? 255 : 120;
                data.set([value, value, value, 255], (y * width + x) * 4);
            }
        }
        return { data, width, height };
    }

    test("finds the balloon and ignores the gutters", () => {
        const { data, width, height } = page();
        const found = findBubbles(data, width, height, panelRects(2));
        expect(found[0]).toEqual([]);
        expect(found[1]).toHaveLength(1);
        expect(found[1][0].x).toBeCloseTo(20 / 200, 1);
        expect(found[1][0].y).toBeCloseTo(178 / 300, 1);
    });

    test("balloons side by side are read left to right", () => {
        const lines = [
            { speaker: "a", text: "左", kind: "speech" as const },
            { speaker: "b", text: "右", kind: "speech" as const },
        ];
        let n = 0;
        const bubbles = placeBubbles(
            [{ lines }],
            [
                [
                    { x: 0.6, y: 0.02, w: 0.3, h: 0.1 },
                    { x: 0.05, y: 0.05, w: 0.3, h: 0.1 },
                ],
            ],
            panelRects(1),
            () => `b${++n}`,
        );
        expect(bubbles.map((bubble) => [bubble.text, bubble.x < 0.5])).toEqual([
            ["左", true],
            ["右", false],
        ]);
    });

    test("lines go into found balloons, the rest get drawn balloons", () => {
        let n = 0;
        const panels = [
            { lines: [{ speaker: "a", text: "一", kind: "speech" as const }] },
            {
                lines: [
                    { speaker: "a", text: "二", kind: "speech" as const },
                    { speaker: "b", text: "三", kind: "shout" as const },
                ],
            },
        ];
        const bubbles = placeBubbles(panels, [[], [{ x: 0.1, y: 0.6, w: 0.4, h: 0.15 }]], panelRects(2), () => `b${++n}`);
        expect(bubbles.map((bubble) => [bubble.panel, bubble.text, bubble.drawn])).toEqual([
            [0, "一", true],
            [1, "二", false],
            [1, "三", true],
        ]);
        expect(bubbles[1].x).toBeGreaterThan(0.1);
        expect(bubbles[1].x + bubbles[1].w).toBeLessThan(0.5);
    });

    test("text shrinks until it fits and keeps punctuation on the line", () => {
        const measure = (text: string, size: number) => Array.from(text).length * size;
        const fit = fitText("今天起，我就是打工猫了！", 100, 60, measure, 30);
        expect(fit.lines.join("")).toBe("今天起，我就是打工猫了！");
        expect(fit.lines.length * fit.fontSize * 1.25).toBeLessThanOrEqual(60);
        expect(fit.lines.every((line) => !line.startsWith("，") && !line.startsWith("！"))).toBe(true);
    });

    test("lines break at punctuation when the phrase fits", () => {
        const measure = (text: string, size: number) => Array.from(text).length * size;
        expect(fitText("阿橘，周报呢？", 80, 60, measure, 20).lines).toEqual(["阿橘，", "周报呢？"]);
    });
});

describe("series and library", () => {
    test("a next-episode request carries the 前情提要 and the fixed cast", () => {
        const request = storyRequest({ idea: "", genre: "funny", panelCount: 4, episode: 3, previously: ["第 1 话《上班》：阿橘到公司", "第 2 话《周报》：阿橘交了爪印"], cast: [{ name: "阿橘", role: "主角", look: "橘猫" }] });
        expect(request).toContain("第 3 话");
        expect(request).toContain("- 第 2 话《周报》");
        expect(request).toContain("顺着前面的故事");
        expect(request).toContain("阿橘（主角）：橘猫");
        expect(storyRequest({ idea: "猫", genre: "funny", panelCount: 4 })).not.toContain("前情提要");
    });

    test("an episode summary has its number, title, actions and lines", () => {
        const summary = episodeSummary({ title: "上班", series: { id: "s", title: "阿橘", episode: 2 }, panels: [panel([{ speaker: "阿橘", text: "冲！", kind: "shout" }])] });
        expect(summary).toBe("第 2 话《上班》：站在写字楼门口握拳（阿橘：「冲！」）");
    });

    test("deleting an episode keeps images other episodes or 我的角色 still use", () => {
        const image = (key: string) => ({ url: "", storageKey: key, width: 1, height: 1 });
        const project = (id: string, sheet: string, page: string) => ({ id, characters: [{ ...cat, sheets: [image(sheet)] }], pages: [{ id: "p", image: image(page), bubbles: [], createdAt: 0, prompt: "" }] }) as unknown as ComicProject;
        const one = project("1", "sheet-a", "page-1");
        const two = project("2", "sheet-a", "page-2");
        expect(keysToDelete(one, [two], [])).toEqual(["page-1"]);
        expect(keysToDelete(one, [], [image("sheet-a")])).toEqual(["page-1"]);
        expect(keysToDelete(one, [], []).sort()).toEqual(["page-1", "sheet-a"]);
    });
});

describe("cloud sync merge", () => {
    const comic = (id: string, updatedAt: number, title = id) => ({ id, updatedAt, title }) as unknown as ComicProject;
    const empty = { projects: [], deleted: [], library: [], libraryDeleted: [] };

    test("the newest edit of a comic wins and comics from both devices are kept", () => {
        const merged = mergeComicData({ ...empty, projects: [comic("a", 5, "here"), comic("b", 1)] }, { ...empty, projects: [comic("a", 9, "there"), comic("c", 3)] });
        expect(merged.projects.map((item) => [item.id, item.title])).toEqual([
            ["a", "there"],
            ["c", "c"],
            ["b", "b"],
        ]);
    });

    test("a deletion wins over older edits, a later edit wins over the deletion", () => {
        const deletedHere = mergeComicData({ ...empty, deleted: [{ id: "a", deletedAt: 10 }] }, { ...empty, projects: [comic("a", 5)] });
        expect(deletedHere.projects).toEqual([]);
        expect(deletedHere.deleted).toEqual([{ id: "a", deletedAt: 10 }]);
        const editedThere = mergeComicData({ ...empty, deleted: [{ id: "a", deletedAt: 10 }] }, { ...empty, projects: [comic("a", 12)] });
        expect(editedThere.projects.map((item) => item.id)).toEqual(["a"]);
        expect(editedThere.deleted).toEqual([]);
    });

    test("我的角色 merges the same way", () => {
        const merged = mergeComicData(
            { ...empty, library: [{ id: "x", updatedAt: 2 }], libraryDeleted: [{ id: "y", deletedAt: 5 }] },
            {
                ...empty,
                library: [
                    { id: "y", updatedAt: 3 },
                    { id: "z", updatedAt: 1 },
                ],
            },
        );
        expect(merged.library.map((item) => item.id)).toEqual(["x", "z"]);
        expect(merged.libraryDeleted).toEqual([{ id: "y", deletedAt: 5 }]);
    });
});
