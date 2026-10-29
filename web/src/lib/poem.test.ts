import { describe, expect, test } from "bun:test";

import { layoutLayer } from "./image-editor/text-layers";
import { authorLine, blankHint, calmBox, defaultLines, displayTitle, parseKeywords, parsePicks, poemColumns, poemImagePrompt, poemLayers, sceneRequest, type PoemCandidate } from "./poem";

const cunju = { id: 627041, title: "村居", author: "高鼎", dynasty: "清", content: "草长莺飞二月天，拂堤杨柳醉春烟。\n儿童散学归来早，忙趁东风放纸鸢。" };

describe("prompts", () => {
    test("the image prompt asks for no text and a blank area, with the scene", () => {
        const p = poemImagePrompt("xinzhongshi", "早春河堤，孩子放风筝", "2:3");
        expect(p).toContain("新中式细线设色");
        expect(p.startsWith("【画幅】竖版构图")).toBe(true);
        expect(poemImagePrompt("shuimo", "x", "3:2")).toContain("横版构图");
        expect(p).toContain("不要出现任何文字");
        expect(p).toContain("右上方保留");
        expect(p).toContain("主题：早春河堤，孩子放风筝");
        expect(poemImagePrompt("shuimo", "x", "3:2")).toContain("左侧保留");
    });

    test("the scene request has the poem, and the picked lines when they differ", () => {
        expect(sceneRequest(cunju, "2:3")).toContain("原文：\n草长莺飞");
        const part = sceneRequest(cunju, "9:16", "儿童散学归来早，忙趁东风放纸鸢。");
        expect(part).toContain("画这几句");
        expect(part).toContain("全文供理解");
    });

    test("keywords: Chinese only, short, unique", () => {
        expect(parseKeywords('好的：{"keywords":["纸鸢","东风","a kite","纸鸢","春风又绿江南岸"]}')).toEqual(["纸鸢", "东风"]);
        expect(parseKeywords("no json")).toEqual([]);
    });

    test("picks come only from the candidates", () => {
        const candidates: PoemCandidate[] = [{ ...cunju }, { id: 2, title: "春晓", author: "孟浩然", dynasty: "唐", content: "春眠不觉晓" }];
        const picks = parsePicks('{"picks":[{"id":999,"reason":"编的"},{"id":627041,"reason":"放纸鸢"},{"id":627041,"reason":"重复"}]}', candidates, 5);
        expect(picks.map((p) => p.poem.id)).toEqual([627041]);
        expect(picks[0].reason).toBe("放纸鸢");
    });
});

describe("配诗", () => {
    test("columns keep one line each when they fit, and wrap long ones at punctuation", () => {
        expect(poemColumns(cunju.content, 20)).toEqual(["草长莺飞二月天，拂堤杨柳醉春烟。", "儿童散学归来早，忙趁东风放纸鸢。"]);
        const cols = poemColumns(cunju.content, 9);
        expect(cols).toEqual(["草长莺飞二月天，", "拂堤杨柳醉春烟。", "儿童散学归来早，", "忙趁东风放纸鸢。"]);
        expect(cols.join("")).toBe(cunju.content.replace("\n", ""));
    });

    test("titles drop the note that tells same-named poems apart", () => {
        expect(displayTitle("绝句（两个黄鹂鸣翠柳）")).toBe("绝句");
        expect(authorLine(cunju)).toBe("〔清〕高鼎");
    });

    test("long texts start with their first lines", () => {
        const long = Array.from({ length: 20 }, (_, i) => `第${i}句写得很长很长很长很长很长很长。`).join("\n");
        expect(defaultLines(long).split("\n").length).toBeLessThan(6);
        expect(defaultLines(cunju.content)).toBe(cunju.content);
    });

    test("the layers fit inside the box, title rightmost, seal under the text", () => {
        const box = { x0: 0.55, y0: 0.04, x1: 0.95, y1: 0.45 };
        const aspect = 2 / 3;
        const layers = poemLayers({ title: "村居", author: "〔清〕高鼎", lines: cunju.content, box, aspect, font: "ma-shan-zheng", titleFont: "zhi-mang-xing", ink: "ink", seal: "诗画" });
        expect(layers.map((l) => l.kind)).toEqual(["text", "text", "text", "seal"]);
        const W = 1000;
        const H = W / aspect;
        const measure = () => 10;
        const boxes = layers.map((l) => layoutLayer(l, W, H, measure).box);
        for (const b of boxes.slice(0, 3)) {
            expect(b.x).toBeGreaterThanOrEqual(box.x0 * W - 1);
            expect(b.x + b.w).toBeLessThanOrEqual(box.x1 * W + 1);
            expect(b.y + b.h).toBeLessThanOrEqual(box.y1 * H + 1);
        }
        expect(boxes[0].x).toBeGreaterThan(boxes[2].x);
        expect(layers[0].size).toBeGreaterThan(layers[2].size);
        expect(boxes[3].y).toBeGreaterThan(boxes[2].y + boxes[2].h - 1);
        // Larger characters in four half-line columns beat two long columns here; nothing is lost or reordered.
        expect(layers[2].text.replace(/\n/g, "")).toBe(cunju.content.replace("\n", ""));
    });

    test("finds the blank area the prompt left", () => {
        const w = 64;
        const h = 96;
        const gray = new Float32Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = ((x * 7 + y * 13) % 5) * 50;
        for (let y = 4; y < 40; y++) for (let x = 40; x < 62; x++) gray[y * w + x] = 200;
        const found = calmBox(gray, w, h, blankHint("2:3"));
        expect(found).not.toBeNull();
        expect(found!.x0).toBeGreaterThan(0.6);
        expect(found!.y1).toBeLessThan(0.45);
    });
});
