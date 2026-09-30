// Normalizes prompt-library entries coming from many community sources.
//
// Every source tags differently (English / Chinese / slug duplicates such as "UI", "ui", "UI与界面",
// "UI & Interfaces"), and mixes in author handles, repo names and model names. The library UI
// shows a small fixed set of scenes instead, plus the model, and hides entries that should not be
// offered to a campus audience (NSFW). Pure functions — unit-tested in tests/prompt-taxonomy.test.ts.

export const PROMPT_SCENES = ["poster", "ecommerce", "ui", "infographic", "portrait", "photo", "illustration", "3d", "brand", "social", "life", "history", "creative", "video", "other"] as const;

export type PromptScene = (typeof PROMPT_SCENES)[number];

export type PromptModel = "gpt-image-2" | "nano-banana" | "gpt-4o" | "unknown";

export type PromptTraits = {
    scenes: PromptScene[];
    model: PromptModel;
    nsfw: boolean;
    /** Real politicians / public figures, national symbols, political satire. Hidden like NSFW. */
    sensitive: boolean;
    needsReference: boolean;
    lang: "zh" | "en";
};

// Order matters only for the primary scene (first match); an entry can belong to several scenes.
const SCENE_RULES: [PromptScene, RegExp][] = [
    ["video", /视频模板|视频生成|seedance|short_video|dance_action|vfx_fantasy|^animation$|wuxia_history/i],
    ["ecommerce", /commerce|电商|product|产品|营销|主图|advertis|广告|包装|packaging/i],
    ["ui", /(^|[^a-z])ui([^a-z]|$)|(^|[^a-z])ux([^a-z]|$)|界面|interface|游戏截图|网页|\bapp\b/i],
    ["infographic", /infographic|信息图|chart|图表|ppt|document|文档|education|教育|学习|总结|article|publishing|手帐|笔记|流程图|blueprint|schematic/i],
    ["poster", /poster|海报|typograph|字体|排版|封面|thumbnail|缩略图|text_render|文字渲染|social_poster/i],
    ["brand", /logo|brand|品牌/i],
    ["portrait", /portrait|头像|肖像|个人资料|character|角色|人像|cosplay|穿搭|fashion|people/i],
    ["photo", /photo|摄影|realistic|写实|cinematic|电影/i],
    ["illustration", /illustration|插画|anime|动漫|漫画|comic|故事板|story|卡牌|\bcard\b|\bart\b/i],
    ["3d", /(^|[^a-z])3d|手办|潮玩|材质|微缩|微型|立体|雕塑|浮雕|sculpture|figure|diorama|isometric|等距|claymation|low poly|盲盒|键帽|keycap/i],
    ["social", /social|社交|表情包|meme|youtube/i],
    ["life", /travel|旅游|food|美食|生活|装修|architecture|建筑|空间|风景|家居/i],
    ["history", /history|historic|古风|classical|ancient|武侠|历史|国风|古书|中式/i],
    ["creative", /有趣|creative|想象|funny|吐槽|imagin|脑洞|game|游戏|胶囊|capsule|涂鸦|邮票|stamp|明信片|postcard|passport/i],
];

// Coarse labels one source stamps on almost everything; they only count when nothing more specific matched.
const WEAK_TAGS = new Set(["commerce", "tech"]);

const NSFW = /nsfw|18\+|r18|成人|色情|nude|naked/i;
// Real public figures and national symbols: unsuitable for a campus product, and the usual cause of
// upstream moderation rejections ("rejected by the safety system"). "奥特曼" is left out (= Ultraman).
const SENSITIVE =
    /特朗普|川普|\btrump\b|拜登|\bbiden\b|普京|\bputin\b|泽连斯基|zelensky|金正恩|马斯克|elon musk|sam altman|习近平|毛泽东|毛主席|斯大林|stalin|列宁|lenin|希特勒|hitler|领导人|国家主席|国旗|national flag|国徽|总统|\bpresident\b|首相|名人(?!名言)|celebrit|政治|politic|纳粹|\bnazi\b|propaganda/i;
const NEEDS_REFERENCE = /需要参考图|参考图|upload (a|an|your|the)|上传(一张|你的|照片|图片)|based on the (uploaded|attached)|attached (photo|image)/i;
const CJK = /[㐀-鿿]/;

export function detectModel(tags: string[], imageModel?: string): PromptModel {
    const value = `${imageModel || ""} ${tags.join(" ")}`.toLowerCase();
    if (/gpt-?image-?2|gpt_image_2/.test(value)) return "gpt-image-2";
    if (/nano-?banana|gemini/.test(value)) return "nano-banana";
    if (/gpt-?4o/.test(value)) return "gpt-4o";
    return "unknown";
}

export function promptTraits(item: { title?: string; prompt?: string; description?: string; tags?: string[]; imageModel?: string }): PromptTraits {
    const tags = (item.tags || []).filter(Boolean);
    // Match scenes on tags first; fall back to the title when the tags say nothing useful.
    const matchScenes = (texts: string[]) => SCENE_RULES.filter(([, pattern]) => texts.some((text) => pattern.test(text))).map(([scene]) => scene);
    const specific = tags.filter((tag) => !WEAK_TAGS.has(tag.toLowerCase()));
    let scenes = matchScenes(specific);
    if (!scenes.length && item.title) scenes = matchScenes([item.title]);
    if (!scenes.length) scenes = matchScenes(tags);
    const joined = `${tags.join(" ")} ${item.title || ""} ${item.description || ""}`;
    return {
        scenes: scenes.length ? scenes : ["other"],
        model: detectModel(tags, item.imageModel),
        nsfw: NSFW.test(joined),
        sensitive: SENSITIVE.test(`${joined} ${item.prompt || ""}`),
        needsReference: NEEDS_REFERENCE.test(`${tags.join(" ")} ${item.description || ""} ${(item.prompt || "").slice(0, 400)}`),
        lang: CJK.test(item.prompt || "") ? "zh" : "en",
    };
}

const GENERIC_TITLE = /^(图像模板|视频模板)\s*-|^(其他|other|unknown|untitled|无标题)$/i;

/**
 * Some sources use the category as the title ("UI与界面" ×154). Such titles say nothing on a card,
 * so derive one from the prompt: a quoted name first (「足球主题电影海报」), else the first clause.
 */
export function displayTitle(item: { title?: string; prompt?: string; tags?: string[] }): string {
    const title = (item.title || "").trim();
    const generic = !title || GENERIC_TITLE.test(title) || (item.tags || []).includes(title);
    if (!generic) return title;
    // Bilingual sources write "[中文] … [English] …"; drop the language markers.
    const prompt = (item.prompt || "")
        .replace(/[[【](中文|english|en|zh|cn)[\]】]\s*/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    const quoted = /[「『“"]([^」』”"]{2,60})[」』”"]/
        .exec(prompt)?.[1]
        ?.split(/\s*\/\s*/)[0]
        ?.trim();
    if (quoted && quoted.length <= 24 && !/^[xX]+$|^【?XXX/.test(quoted)) return quoted;
    const clause = prompt
        .replace(/^(?:请|帮我|麻烦)?(?:生成|创建|设计|制作|画|绘制)?(?:一张|一幅|一个|一组)?/, "")
        .split(/[，。,.:：；;!！?？（(\n]/)
        .map((part) => part.trim())
        .find((part) => part.length >= 2);
    if (!clause) return title || prompt.slice(0, 20);
    return clause.length > 20 ? `${clause.slice(0, 20)}…` : clause;
}

/** Descriptions that are just a model name or a keyword dump add nothing to a card. */
export function meaningfulDescription(description: string | undefined): string {
    const text = (description || "").trim();
    if (!text) return "";
    if (!CJK.test(text) && text.length < 40) return "";
    if ((text.match(/,/g) || []).length >= 3 && !/[。.!！?？]/.test(text)) return "";
    return text;
}

/** Key used to drop the same prompt published by several sources. */
export function promptDedupeKey(prompt: string): string {
    return (prompt || "").replace(/\s+/g, "").toLowerCase().slice(0, 300);
}

/** Ranking for the default "recommended" order: usable here, has a picture, Chinese first. */
export function recommendScore(item: { coverUrl?: string; traits: PromptTraits; title?: string }): number {
    let score = 0;
    if (item.coverUrl) score += 4;
    if (item.traits.model === "gpt-image-2") score += 3;
    else if (item.traits.model === "unknown") score += 1;
    if (item.traits.lang === "zh") score += 2;
    if (CJK.test(item.title || "")) score += 1;
    if (item.traits.scenes[0] === "other") score -= 1;
    if (item.traits.scenes[0] === "video") score -= 2;
    return score;
}

/**
 * Merges duplicates (same prompt text) and keeps the richest copy: one with a cover, then the
 * one whose model is usable here.
 */
export function dedupePrompts<T extends { prompt: string; coverUrl?: string; traits: PromptTraits }>(items: T[]): T[] {
    const byKey = new Map<string, T>();
    for (const item of items) {
        const key = promptDedupeKey(item.prompt);
        if (!key) continue;
        const current = byKey.get(key);
        if (!current || dedupeRank(item) > dedupeRank(current)) byKey.set(key, item);
    }
    const kept = new Set(byKey.values());
    return items.filter((item) => kept.has(item));
}

function dedupeRank(item: { coverUrl?: string; traits: PromptTraits }) {
    return (item.coverUrl ? 2 : 0) + (item.traits.model === "gpt-image-2" ? 1 : 0);
}
