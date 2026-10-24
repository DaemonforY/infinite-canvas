import { describe, expect, test } from "bun:test";

import { csvToDrafts, parseCsv, pieceToDraft, splitPromptText } from "./prompt-import";
import { promptsToCsv, promptsToMarkdown } from "./prompt-export";
import { fillPromptVariables, promptVariables } from "./prompt-variables";

describe("splitPromptText", () => {
    test("blank lines separate prompts; a short first line is the title", () => {
        const drafts = splitPromptText("咖啡海报\n咖啡店开业海报，暖色调，顶部留标题位置\n\n一只橘猫坐在窗台上，午后阳光，胶片质感");
        expect(drafts).toEqual([
            { title: "咖啡海报", prompt: "咖啡店开业海报，暖色调，顶部留标题位置", tags: [] },
            { title: "", prompt: "一只橘猫坐在窗台上，午后阳光，胶片质感", tags: [] },
        ]);
    });

    test("numbered notes keep multi-line prompts together", () => {
        const drafts = splitPromptText("1. 国风插画，水墨山水\n远处有飞鸟\n2、赛博朋克城市夜景，霓虹灯\n3) 极简产品图，白底，柔光");
        expect(drafts.map((d) => d.prompt)).toEqual(["国风插画，水墨山水\n远处有飞鸟", "赛博朋克城市夜景，霓虹灯", "极简产品图，白底，柔光"]);
    });

    test("--- separators, labels and tags", () => {
        const drafts = splitPromptText("标题：小红书封面\n提示词：竖版 3:4 封面，大字标题\n标签：小红书, 封面\n---\nPrompt: a cinematic photo of a lighthouse at dusk");
        expect(drafts[0]).toEqual({ title: "小红书封面", prompt: "竖版 3:4 封面，大字标题", tags: ["小红书", "封面"] });
        expect(drafts[1].prompt).toBe("a cinematic photo of a lighthouse at dusk");
    });

    test("markdown headings and code blocks", () => {
        expect(splitPromptText("# 头像\n二次元头像，蓝发少女\n\n# 海报\n音乐节海报，荧光色").map((d) => d.title)).toEqual(["头像", "海报"]);
        const fenced = splitPromptText("产品图\n```\n白底产品图，柔和阴影\n```\n人像\n```\n胶片人像，侧逆光\n```");
        expect(fenced).toEqual([
            { title: "产品图", prompt: "白底产品图，柔和阴影", tags: [] },
            { title: "人像", prompt: "胶片人像，侧逆光", tags: [] },
        ]);
    });

    test("JSON exports and duplicates", () => {
        const drafts = splitPromptText(JSON.stringify([{ title: "A", prompt: "一只橘猫坐在窗台上" }, "一只橘猫坐在窗台上", { 标题: "B", 提示词: "雪山日出，广角", 标签: "风景" }]));
        expect(drafts).toEqual([
            { title: "A", prompt: "一只橘猫坐在窗台上", tags: [] },
            { title: "B", prompt: "雪山日出，广角", tags: ["风景"] },
        ]);
    });

    test("a sentence is not taken as a title", () => {
        expect(pieceToDraft("画一只猫。\n要可爱一点，粉色背景")?.title).toBe("");
        expect(pieceToDraft("短")).toBeNull();
    });
});

describe("csv", () => {
    test("quoted fields with commas and newlines", () => {
        expect(parseCsv('a,"b, c","d\n""e"""\n1,2,3')).toEqual([
            ["a", "b, c", 'd\n"e"'],
            ["1", "2", "3"],
        ]);
    });

    test("header columns, or title + longest column without one", () => {
        expect(csvToDrafts("标题,提示词,标签\n猫,一只橘猫坐在窗台上,宠物 可爱")).toEqual([{ title: "猫", prompt: "一只橘猫坐在窗台上", tags: ["宠物", "可爱"] }]);
        expect(csvToDrafts("猫,一只橘猫坐在窗台上，午后\n山,雪山日出，广角镜头")).toEqual([
            { title: "猫", prompt: "一只橘猫坐在窗台上，午后", tags: [] },
            { title: "山", prompt: "雪山日出，广角镜头", tags: [] },
        ]);
    });

    test("export round-trips through import", () => {
        const items = [{ title: "猫", prompt: '一只橘猫, 说"喵"', tags: ["宠物"], folder: "动物" }];
        expect(csvToDrafts(promptsToCsv(items))).toEqual([{ title: "猫", prompt: '一只橘猫, 说"喵"', tags: ["宠物"] }]);
        expect(splitPromptText(promptsToMarkdown(items))).toEqual([{ title: "猫", prompt: '一只橘猫, 说"喵"', tags: ["宠物"] }]);
    });
});

describe("variables", () => {
    test("{name}, {name=default} and the argument style", () => {
        const prompt = '{主体=橘猫}坐在{地点}，{主体}看着窗外，风格 {argument name="风格" default="胶片"}';
        expect(promptVariables(prompt)).toEqual([
            { name: "主体", defaultValue: "橘猫" },
            { name: "地点", defaultValue: "" },
            { name: "风格", defaultValue: "胶片" },
        ]);
        expect(fillPromptVariables(prompt, { 地点: "窗台" })).toBe("橘猫坐在窗台，橘猫看着窗外，风格 胶片");
    });

    test("JSON and numbers in braces are left alone", () => {
        const prompt = '{"style": "anime"} and {1,2} and {3}';
        expect(promptVariables(prompt)).toEqual([]);
        expect(fillPromptVariables(prompt, {})).toBe(prompt);
    });
});
