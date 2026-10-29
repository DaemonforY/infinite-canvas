import { describe, expect, test } from "bun:test";

import { layoutLayer } from "./image-editor/text-layers";
import { authorLine, blankHint, buildPoemPrompt, posterLayers, titleArea, calmBox, defaultLines, displayTitle, parseKeywords, parsePicks, poemColumns, poemLayers, sceneRequest, type PoemCandidate } from "./poem";

const cunju = { id: 627041, title: "村居", author: "高鼎", dynasty: "清", content: "草长莺飞二月天，拂堤杨柳醉春烟。\n儿童散学归来早，忙趁东风放纸鸢。" };

describe("prompts", () => {
    test("the default template: 画幅, 画风, the text rules, then 主题 = title + space + lines", () => {
        const bagui = { title: "八归·芳莲坠粉", author: "史达祖", dynasty: "宋", content: "芳莲坠粉，蔬桐吹绿，庭院暗雨乍歇。\n无端抱影销魂处，还见筱墙萤暗，藓阶蛩切。" };
        const p = buildPoemPrompt({ style: "xinzhongshi", ratio: "2:3", poem: bagui });
        const lines = p.split("\n");
        expect(lines[0]).toBe("【画幅】竖版构图，画幅宽:高 = 2:3。");
        expect(lines[1].startsWith("画风：新中式细线设色装饰插画海报")).toBe(true);
        expect(lines[1]).not.toContain("画风：画风");
        expect(lines[2]).toContain("【文字与版式】画面中不要出现任何文字");
        expect(lines[2]).toContain("右上方保留");
        expect(lines[3]).toBe("主题：八归·芳莲坠粉 芳莲坠粉，蔬桐吹绿，庭院暗雨乍歇。");
        expect(lines[4]).toBe("无端抱影销魂处，还见筱墙萤暗，藓阶蛩切。");
        expect(lines[lines.length - 1]).toBe("出图");
        expect(p).not.toContain("画面参考");
        expect(buildPoemPrompt({ style: "shuimo", ratio: "3:2", poem: bagui })).toContain("横版构图");
    });

    test("the AI scene is lowest priority: appended before 出图, or where the template puts it", () => {
        const withScene = buildPoemPrompt({ style: "xinzhongshi", ratio: "2:3", poem: cunju, scene: "早春河堤，孩子放风筝" });
        const lines = withScene.split("\n");
        expect(lines[lines.length - 2]).toBe("画面参考（次要）：早春河堤，孩子放风筝");
        expect(lines[lines.length - 1]).toBe("出图");

        const own = "{画幅}\n画面：{画面描述}\n诗：{篇名}（{朝代}·{作者}）{诗句}";
        expect(buildPoemPrompt({ template: own, style: "xinzhongshi", ratio: "1:1", poem: cunju, scene: "春天" })).toBe(`方形构图，画幅宽:高 = 1:1\n画面：春天\n诗：村居（清·高鼎）${cunju.content}`);
        expect(buildPoemPrompt({ template: own, style: "xinzhongshi", ratio: "1:1", poem: cunju })).toBe(`方形构图，画幅宽:高 = 1:1\n诗：村居（清·高鼎）${cunju.content}`);
        expect(buildPoemPrompt({ template: "  ", style: "xinzhongshi", ratio: "2:3", poem: cunju })).toContain("主题：村居 草长莺飞");
    });

    test("only the picked lines are used", () => {
        const p = buildPoemPrompt({ style: "xinzhongshi", ratio: "2:3", poem: cunju, lines: "儿童散学归来早，忙趁东风放纸鸢。" });
        expect(p).toContain("主题：村居 儿童散学归来早");
        expect(p).not.toContain("草长莺飞");
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

    test("大标题: a large title in the title area, the author beside it, ruled lines in the body area", () => {
        const aspect = 2 / 3;
        const W = 1000;
        const H = W / aspect;
        const measure = () => 10;
        const titleBox = titleArea("2:3");
        const bodyBox = { x0: 0.55, y0: 0.04, x1: 0.96, y1: 0.46 };
        const lines = "空山新雨后，天气晚来秋。\n明月松间照，清泉石上流。\n竹喧归浣女，莲动下渔舟。\n随意春芳歇，王孙自可留。";
        const layers = posterLayers({ title: "山居秋暝", author: "王维", lines, titleBox, bodyBox, aspect, font: "lxgw-wenkai", titleFont: "ma-shan-zheng", titleInk: "light", bodyInk: "ink", seal: "诗画" });
        expect(layers.map((l) => l.kind)).toEqual(["text", "text", "seal", "text"]);
        const [title, author, , body] = layers;
        expect(title.size).toBeGreaterThan(body.size * 3);
        expect(title.color).toBe("#f6eedc");
        expect(body.rules).toBe(true);
        expect(body.color).toBe("#2b2622");
        const tb = layoutLayer(title, W, H, measure).box;
        expect(tb.x + tb.w).toBeLessThanOrEqual(titleBox.x1 * W + 1);
        expect(tb.y + tb.h).toBeLessThanOrEqual(titleBox.y1 * H + 1);
        const ab = layoutLayer(author, W, H, measure).box;
        expect(ab.x).toBeGreaterThan(tb.x + tb.w - 1);
        const bb = layoutLayer(body, W, H, measure);
        expect(bb.box.x).toBeGreaterThanOrEqual(bodyBox.x0 * W - 1);
        expect(bb.box.x + bb.box.w).toBeLessThanOrEqual(bodyBox.x1 * W + 1);
        expect(bb.box.y + bb.box.h).toBeLessThanOrEqual(bodyBox.y1 * H + 1);
        expect(bb.rules?.length).toBe(body.text.split("\n").length + 1);

        // A long title takes two columns; 「·」 is dropped.
        const long = posterLayers({ title: "八归·芳莲坠粉", author: "史达祖", lines, titleBox, bodyBox, aspect, font: "lxgw-wenkai", titleFont: "ma-shan-zheng", titleInk: "light", bodyInk: "ink", seal: "" });
        expect(long[0].text).toBe("八归芳莲坠粉");
        expect(long.map((l) => l.kind)).toEqual(["text", "text", "text"]);
        const seven = posterLayers({ title: "春夜喜雨好雨知时", author: "杜甫", lines, titleBox, bodyBox, aspect, font: "lxgw-wenkai", titleFont: "ma-shan-zheng", titleInk: "light", bodyInk: "ink", seal: "" });
        expect(seven[0].wrapAt).toBe(4);
    });

    test("the 大标题 prompt asks for a dark title area and a light area for the lines", () => {
        const p = buildPoemPrompt({ style: "xinzhongshi", ratio: "2:3", layout: "poster", poem: cunju });
        expect(p).toContain("左上方约占画面宽 30%、高 55% 放深色");
        expect(p).toContain("右上方保留一块约占画面宽 38%、高 40% 的连续浅色留白");
        expect(buildPoemPrompt({ style: "xinzhongshi", ratio: "2:3", layout: "compact", poem: cunju })).not.toContain("大字标题");
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
