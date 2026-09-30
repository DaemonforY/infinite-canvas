import { expect, test } from "bun:test";

import { dedupePrompts, detectModel, displayTitle, meaningfulDescription, promptTraits, recommendScore } from "../src/lib/prompt-taxonomy";

test("merges bilingual and slug duplicates into one scene", () => {
    for (const tags of [["UI"], ["ui"], ["UI与界面"], ["UI & Interfaces"], ["UI / UX 与社交媒体"]]) {
        expect(promptTraits({ title: "x", tags }).scenes).toContain("ui");
    }
    for (const tags of [["Poster"], ["海报设计"], ["Posters & Typography"], ["字体排版与海报设计"], ["YouTube 缩略图"]]) {
        expect(promptTraits({ title: "x", tags }).scenes).toContain("poster");
    }
    expect(promptTraits({ title: "x", tags: ["infographic"] }).scenes).toContain("infographic");
    expect(promptTraits({ title: "x", tags: ["信息图 / 教育视觉图"] }).scenes).toContain("infographic");
});

test("author handles, repo names and model names do not become scenes", () => {
    expect(promptTraits({ title: "", tags: ["@dotey", "freestylefly/awesome-gpt-image-2", "gpt-image-2"] }).scenes).toEqual(["other"]);
});

test("coarse Commerce/Tech tags only count when nothing specific matched", () => {
    expect(promptTraits({ title: "x", tags: ["Tech", "Commerce", "UI"] }).scenes).toEqual(["ui"]);
    expect(promptTraits({ title: "x", tags: ["Tech", "Commerce"] }).scenes).toEqual(["ecommerce"]);
});

test("falls back to the title when tags say nothing", () => {
    expect(promptTraits({ title: "微型立体场景呈现", tags: ["gpt4o", "宝玉"] }).scenes).toContain("3d");
    expect(promptTraits({ title: "等距视角微缩场景", tags: [] }).scenes).toContain("3d");
});

test("loose words do not leak into unrelated scenes", () => {
    expect(promptTraits({ title: "x", tags: ["Article"] }).scenes).not.toContain("illustration");
    expect(promptTraits({ title: "x", tags: ["text_render"] }).scenes).not.toContain("3d");
    expect(promptTraits({ title: "x", tags: ["AI Guide-Note"] }).scenes).not.toContain("ui");
});

test("video templates are their own scene", () => {
    expect(promptTraits({ title: "x", tags: ["视频模板 - 电影叙事", "cinematic"] }).scenes[0]).toBe("video");
});

test("flags NSFW, reference-image prompts and language", () => {
    expect(promptTraits({ title: "x", tags: ["NSFW"] }).nsfw).toBe(true);
    expect(promptTraits({ title: "x", tags: ["生活"] }).nsfw).toBe(false);
    expect(promptTraits({ title: "x", tags: ["需要参考图"] }).needsReference).toBe(true);
    expect(promptTraits({ title: "x", description: "Upload a half-body photo.", tags: [] }).needsReference).toBe(true);
    expect(promptTraits({ title: "x", prompt: "充分参考图片的设计风格", tags: [] }).needsReference).toBe(true);
    expect(promptTraits({ title: "x", prompt: "a cat on the moon", tags: [] }).needsReference).toBe(false);
    expect(promptTraits({ title: "x", prompt: "一只猫", tags: [] }).lang).toBe("zh");
    expect(promptTraits({ title: "x", prompt: "a cat", tags: [] }).lang).toBe("en");
});

test("detects the target model", () => {
    expect(detectModel([], "gpt-image-2")).toBe("gpt-image-2");
    expect(detectModel(["nano-banana-pro"])).toBe("nano-banana");
    expect(detectModel(["gpt4o"])).toBe("gpt-4o");
    expect(detectModel(["海报"])).toBe("unknown");
});

test("drops descriptions that are only a model name or a keyword dump", () => {
    expect(meaningfulDescription("Nano Banana 2")).toBe("");
    expect(meaningfulDescription("portrait, cinematic, fantasy, 图像生成, gpt-image-2")).toBe("");
    expect(meaningfulDescription("适合做公众号头图的扁平插画风格。")).toBe("适合做公众号头图的扁平插画风格。");
});

test("dedupes the same prompt from several sources, keeping the richest copy", () => {
    const traits = (model: "gpt-image-2" | "unknown") => ({ scenes: ["poster" as const], model, nsfw: false, sensitive: false, needsReference: false, lang: "zh" as const });
    const items = [
        { id: "a", prompt: "一张  海报", coverUrl: "", traits: traits("unknown") },
        { id: "b", prompt: "一张海报", coverUrl: "https://x/cover.png", traits: traits("gpt-image-2") },
        { id: "c", prompt: "别的", coverUrl: "", traits: traits("unknown") },
    ];
    expect(dedupePrompts(items).map((item) => item.id)).toEqual(["b", "c"]);
});

test("recommended order favours usable, illustrated, Chinese prompts", () => {
    const base = { scenes: ["poster" as const], nsfw: false, sensitive: false, needsReference: false };
    const good = recommendScore({ coverUrl: "x", title: "海报", traits: { ...base, model: "gpt-image-2", lang: "zh" } });
    const other = recommendScore({ coverUrl: "", title: "poster", traits: { ...base, model: "nano-banana", lang: "en" } });
    expect(good).toBeGreaterThan(other);
});

test("replaces category-as-title with a name taken from the prompt", () => {
    expect(displayTitle({ title: "海报设计", tags: ["海报设计"], prompt: "生成一张「足球主题电影海报」风格的高清写真海报" })).toBe("足球主题电影海报");
    expect(displayTitle({ title: "UI与界面", tags: ["UI与界面"], prompt: 'Vertical 9:16 isometric cutaway infographic "城市生命系统图谱 / Urban Metabolism Atlas"' })).toBe("城市生命系统图谱");
    expect(displayTitle({ title: "图像模板 - 头像肖像", tags: [], prompt: "一位穿汉服的少女站在樱花树下，柔光" })).toBe("一位穿汉服的少女站在樱花树下");
    expect(displayTitle({ title: "其他", tags: [], prompt: "请生成一张极简风格的咖啡店菜单，暖色调" })).toBe("极简风格的咖啡店菜单");
    // Placeholder names are not used as titles.
    expect(displayTitle({ title: "海报设计", tags: ["海报设计"], prompt: "根据【XXX主题】自动生成一张海报：巨大优雅的人物侧脸剪影" })).toBe("根据【XXX主题】自动生成一张海报");
    expect(displayTitle({ title: "图像模板 - 头像肖像", tags: [], prompt: "[中文] 生成视频号内容截图，暗色 [English] Generate a screenshot" })).toBe("视频号内容截图");
    expect(displayTitle({ title: "其他", tags: [], prompt: "创建一个宝玉（查阅 https://x）的名片" })).toBe("宝玉");
    // Real titles are kept.
    expect(displayTitle({ title: "便利店夜景", tags: ["摄影"], prompt: "..." })).toBe("便利店夜景");
});

test("flags real public figures and national symbols, not look-alike words", () => {
    expect(promptTraits({ title: "特朗普壁画", tags: [], prompt: "Trump mural" }).sensitive).toBe(true);
    expect(promptTraits({ title: "x", tags: [], prompt: "a poster with Elon Musk and Sam Altman" }).sensitive).toBe(true);
    expect(promptTraits({ title: "足球海报", tags: [], prompt: "球员披着国旗庆祝" }).sensitive).toBe(true);
    expect(promptTraits({ title: "讽刺漫画", tags: [], prompt: "political satire cartoon" }).sensitive).toBe(true);
    expect(promptTraits({ title: "名人名言金句卡", tags: [], prompt: "把一句名人名言做成卡片" }).sensitive).toBe(false);
    expect(promptTraits({ title: "奥特曼手办", tags: [], prompt: "奥特曼 3D 手办" }).sensitive).toBe(false);
    expect(promptTraits({ title: "便利店夜景", tags: [], prompt: "深夜的便利店" }).sensitive).toBe(false);
});
