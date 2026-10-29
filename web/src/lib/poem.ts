/**
 * 诗画: turn a classical poem into a picture with the poem set on it in calligraphy.
 *
 * 选诗 (the main site's public-domain corpus) → 画面 (the text model writes the scene from the poem) →
 * 生成 (the image model draws it in a chosen style, leaving a blank area and no text) → 配诗 (the poem is
 * set in that blank area as text layers: title, author, the lines, a seal). Image models miswrite long
 * Chinese text, so the poem is never left to the model.
 *
 * Pure functions only (prompts, parsing, the blank-area finder, the text layout); the page does the I/O.
 */

import { createSealLayer, createTextLayer, type TextFontId, type TextLayer } from "@/lib/image-editor/text-layers";

export type PoemSource = { id?: number; title: string; author: string; dynasty: string; content: string; collection?: string };

export type PoemRatio = "2:3" | "3:4" | "9:16" | "1:1" | "3:2";
export const POEM_RATIOS: PoemRatio[] = ["2:3", "3:4", "9:16", "1:1", "3:2"];

export type PoemStyleId = "xinzhongshi" | "shuimo" | "gongbi" | "qinglv" | "shuicai" | "guofeng";

export type PoemStyle = { id: PoemStyleId; name: string; desc: string; swatch: string[]; prompt: string };

// The first style is the 课本诗画 series' look (新中式细线设色) without its text rules.
export const POEM_STYLES: PoemStyle[] = [
    {
        id: "xinzhongshi",
        name: "新中式细线设色",
        desc: "工笔线描加饱满哑光设色，干净雅致，课本诗画同款",
        swatch: ["#2f6f73", "#7aa874", "#c4472f", "#efe6d2"],
        prompt:
            "画风：新中式细线设色装饰插画海报，融合东方散点透视与现代平面构成，兼具工笔线描的严谨结构与现代版式的呼吸感，整体干净、饱满、雅致。线条纤细、连续、准确；大形与大色面承担主要视觉重量，核心主体结构清晰、细节丰富，远景适度概括。饱满、干净、哑光的东方传统设色（石青、石绿、朱砂、赭石、藤黄，主次分明，点睛色克制），色块内有细微层次与自然叠色，少量克制的墨黑阴影，温润纸本感。地面、水面或云气用连贯的暖米白留白组织空间。拒绝摄影写实、3D 渲染、厚重水墨、油画笔触、日系动漫风、全图毛边和伪汉字。",
    },
    {
        id: "shuimo",
        name: "水墨写意",
        desc: "浓淡干湿的墨色，大片留白，意境空灵",
        swatch: ["#1d1d1b", "#5b5b57", "#a7a39a", "#f3efe6"],
        prompt:
            "画风：传统中国水墨写意画，宣纸质感，以墨为主，浓淡干湿层次分明，笔触灵动、一气呵成，可点染少量淡赭、花青；大片留白营造空灵意境，构图疏密有致，近实远虚。拒绝摄影写实、3D 渲染、厚涂油画、日系动漫和伪汉字。",
    },
    {
        id: "gongbi",
        name: "工笔重彩",
        desc: "细腻勾线，浓丽设色，宋画般精致",
        swatch: ["#8c2f1f", "#c9a24a", "#2e5e4e", "#efe2c4"],
        prompt:
            "画风：中国工笔重彩画，绢本质感，铁线描勾勒精细准确，三矾九染，设色浓丽而沉稳（朱砂、石青、石绿、金色点缀），物象刻画细腻入微，如宋代院体画般精致典雅，背景素净。拒绝摄影写实、3D 渲染、油画笔触、日系动漫和伪汉字。",
    },
    {
        id: "qinglv",
        name: "青绿山水",
        desc: "石青石绿的山水长卷，金碧辉煌",
        swatch: ["#1f6e7a", "#3d9a6b", "#d7b56d", "#efe6cf"],
        prompt:
            "画风：中国青绿山水画，以石青、石绿为主色，山石勾勒后层层敷色，山脚与云脚施以赭石、泥金，层峦叠嶂、云水相映，构图开阔有纵深，如《千里江山图》般明丽辉煌，纸本古雅质感。拒绝摄影写实、3D 渲染、油画笔触、日系动漫和伪汉字。",
    },
    {
        id: "shuicai",
        name: "水彩淡彩",
        desc: "清透的水彩晕染，温柔明亮，适合童趣题材",
        swatch: ["#7fb3d5", "#a8d5a2", "#f5c28b", "#fbf7ee"],
        prompt:
            "画风：清新水彩插画，水色清透，湿画法自然晕染，留出纸白高光，色彩明亮柔和，笔触轻松，带一点手绘线稿，温暖治愈，适合儿童绘本与课本插图。拒绝摄影写实、3D 渲染、厚涂油画和伪汉字。",
    },
    {
        id: "guofeng",
        name: "国风插画",
        desc: "现代国风人物插画，色彩通透，有故事感",
        swatch: ["#5d4a8a", "#d06b6b", "#e7c27a", "#f4ede1"],
        prompt:
            "画风：现代国风插画，人物造型优美、服饰符合朝代，线条流畅，色彩通透雅致，光影柔和有氛围感，画面有故事感和电影感构图，细节精致。拒绝照片写实、3D 渲染、低幼卡通和伪汉字。",
    },
];

export function poemStyle(id: PoemStyleId | string | undefined): PoemStyle {
    return POEM_STYLES.find((style) => style.id === id) || POEM_STYLES[0];
}

/** Portrait and square pictures keep the top right blank; landscape ones a band on the left. */
/**
 * 版式: 大标题 (poster) puts a large title on a dark area at the left and the lines on a light blank area at
 * the top right; 竖排题诗 (compact) sets title, author and lines together in one blank area.
 */
export type PoemLayoutKind = "poster" | "compact";

function blankArea(ratio: PoemRatio, layout: PoemLayoutKind = "poster") {
    if (layout === "poster") {
        return ratio === "3:2"
            ? "画面最左侧约占画面宽 14% 放一条深色或高对比的连续色面（山体、树荫、夜空或深色云层），用来写大字标题；其右侧约占画面宽 30% 保留一条连续的浅色留白（淡天空、云气或水面），留白内不要任何景物"
            : "画面左上方约占画面宽 30%、高 55% 放深色或高对比的连续色面（山体、树荫、夜空或深色云层），用来写大字标题；画面右上方保留一块约占画面宽 38%、高 40% 的连续浅色留白（淡天空、云气或水面），留白内不要任何景物";
    }
    return ratio === "3:2"
        ? "画面左侧保留一条约占画面宽 35% 的竖向连续留白（淡天空、云气、水面或素净地面），留白内不要任何景物"
        : "画面右上方保留一块约占画面宽 40%、高 45% 的连续留白（淡天空、云气或水面），留白内不要任何景物";
}

/** Asks the text model for the scene of a poem: what to draw, in Chinese, ready for the image prompt. */
export const SCENE_INSTRUCTION = [
    "你是中国古典文学与中国画的美术指导。根据给出的古诗词，写一段画面描述，用来交给 AI 画成一幅插画。",
    "要求：",
    "1. 忠实再现原诗的意境和关键意象，每个关键意象都要能在画面里找到；不添加原诗没有的情节。",
    "2. 写清季节、时辰、天气，主体人物（数量、动作、朝向、服饰，符合作品朝代），主要场景和近中远景层次，以及主色调。",
    "3. 不得出现现代物品、文字、招牌、印章。",
    "4. 只输出画面描述正文，120–220 字，不写画风，不写需要画出的文字，不要解释、标题或引号。",
].join("\n");

export function sceneRequest(poem: PoemSource, ratio: PoemRatio, lines?: string, layout: PoemLayoutKind = "poster") {
    const parts = [`篇名：${poem.title}`, `作者：${poem.dynasty ? `${poem.dynasty} ` : ""}${poem.author}`];
    parts.push(lines && lines.trim() !== poem.content.trim() ? `画这几句：\n${lines.trim()}\n\n全文供理解：\n${poem.content}` : `原文：\n${poem.content}`);
    parts.push(`构图：${ratio === "3:2" ? "横版" : ratio === "1:1" ? "方形" : "竖版"}，${blankArea(ratio, layout)}，用来之后写诗；主体放在其余位置。`);
    return parts.join("\n");
}

/** Cleans the scene answer (models sometimes add a label or quotes). */
export function cleanScene(text: string) {
    return text
        .replace(/^\s*```[a-z]*\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .replace(/^\s*(画面描述|画面)\s*[:：]\s*/, "")
        .replace(/^["“「]([\s\S]*)["”」]$/, "$1")
        .trim();
}

const ORIENTATION: Record<PoemRatio, string> = {
    "2:3": "竖版构图，画幅宽:高 = 2:3",
    "3:4": "竖版构图，画幅宽:高 = 3:4",
    "9:16": "竖版构图，画幅宽:高 = 9:16",
    "1:1": "方形构图，画幅宽:高 = 1:1",
    "3:2": "横版构图，画幅宽:高 = 3:2",
};

// ---------------------------------------------------------------------------------------------
// The image prompt comes from a template. The default follows the operator's own structure: 画幅, 画风,
// the text rules (no text, a blank area for the poem), then 主题 = the title, a space and the lines. The
// orientation is spelled out because the upstream treats the requested size as a hint. Users can keep
// their own templates. The AI scene is optional and lowest priority: appended at the end as 画面参考
// unless a template places {画面描述} itself.

/** Template variables (shown to users as chips). */
export const POEM_TEMPLATE_VARS = [
    { key: "画幅", desc: "竖版构图，画幅宽:高 = 2:3（随比例变）" },
    { key: "画风", desc: "所选画风的描述" },
    { key: "留白", desc: "给标题和诗句留的位置（随比例和版式变）" },
    { key: "篇名", desc: "诗的标题" },
    { key: "作者", desc: "作者" },
    { key: "朝代", desc: "朝代" },
    { key: "诗句", desc: "要画的诗句（一行一句）" },
    { key: "画面描述", desc: "AI 写的画面描述（可选，留空就去掉）" },
] as const;

export const DEFAULT_POEM_TEMPLATE = [
    "【画幅】{画幅}。",
    "画风：{画风}",
    "【文字与版式】画面中不要出现任何文字、书法、印章、落款、题跋或伪文字。{留白}，后期会用书法写上诗句。",
    "主题：{篇名} {诗句}",
    "出图",
].join("\n");

export type PoemTemplate = { id: string; name: string; text: string };
export const DEFAULT_TEMPLATE_ID = "default";
export const DEFAULT_TEMPLATE: PoemTemplate = { id: DEFAULT_TEMPLATE_ID, name: "默认模板", text: DEFAULT_POEM_TEMPLATE };

export type PoemPromptInput = { template?: string; style: PoemStyleId; ratio: PoemRatio; poem: PoemSource; lines?: string; scene?: string; layout?: PoemLayoutKind };

/** The image prompt: the template with its variables filled; the AI scene goes last when the template doesn't place it. */
export function buildPoemPrompt(input: PoemPromptInput) {
    let template = (input.template ?? "").trim() || DEFAULT_POEM_TEMPLATE;
    const scene = (input.scene || "").trim();
    // Without a scene, a line that only holds {画面描述} (e.g. 「画面：{画面描述}」) is dropped.
    if (!scene) template = template.replace(/^[^\n{}]{0,12}\{画面描述\}[ \t]*\n?/gm, "");
    const values: Record<string, string> = {
        画幅: ORIENTATION[input.ratio],
        画风: poemStyle(input.style).prompt.replace(/^画风[:：]\s*/, ""),
        留白: blankArea(input.ratio, input.layout),
        篇名: input.poem.title,
        作者: input.poem.author,
        朝代: input.poem.dynasty,
        诗句: (input.lines || input.poem.content).trim(),
        画面描述: scene,
    };
    let prompt = template.replace(/\{(画幅|画风|留白|篇名|作者|朝代|诗句|画面描述)\}/g, (_, key: string) => values[key] ?? "");
    if (scene && !template.includes("{画面描述}")) {
        const lines = prompt.split("\n");
        const last = lines.length - 1;
        // Before a closing 「出图 / 生图」, else at the very end.
        const at = /^\s*(出图|生图)[。.]?\s*$/.test(lines[last]) ? last : lines.length;
        lines.splice(at, 0, `画面参考（次要）：${scene}`);
        prompt = lines.join("\n");
    }
    return prompt.trim();
}

// ---------------------------------------------------------------------------------------------
// 按画面找: the text model turns a scene into words, the main site scores the corpus, the model picks.

export const KEYWORDS_INSTRUCTION = [
    "你是中国古典诗词检索助手。用户描述一个想画的画面或想表达的情绪。请给出 8–16 个检索词，用来在古诗词原文里做字面检索：",
    "- 每个词 1–3 个字，必须是古诗词原文里会直接出现的字词（如「纸鸢」「东风」「柳」「儿童」「归来」），不要现代词，不要解释性的词。",
    "- 先写最能代表画面的核心意象，再写季节、时辰、动作、情绪相关的字词。",
    '只输出一个 JSON 对象：{"keywords":["…"]}',
].join("\n");

export const PICK_INSTRUCTION = [
    "你是中国古典诗词与插画的美术指导。给你一个想画的画面描述和一批候选诗词（都来自真实语料库）。请从中选出最适合画成这幅画的几首：意象和场景贴合、画面感强、名篇优先。",
    "每首写一句理由（不超过 40 字，说明哪几句或哪些意象契合）。只能从候选里选，用候选的 id。",
    '只输出一个 JSON 对象：{"picks":[{"id":123,"reason":"…"}]}',
].join("\n");

function jsonObject<T>(text: string): T | null {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
        return JSON.parse(text.slice(start, end + 1)) as T;
    } catch {
        return null;
    }
}

/** Search words from the keywords answer: Chinese characters only, 1–4 each, at most 16, no repeats. */
export function parseKeywords(text: string): string[] {
    const words = jsonObject<{ keywords?: unknown[] }>(text)?.keywords || [];
    const out: string[] = [];
    for (const word of words) {
        const han = Array.from(String(word)).filter((ch) => /\p{Script=Han}/u.test(ch)).join("");
        const n = Array.from(han).length;
        if (n >= 1 && n <= 4 && !out.includes(han)) out.push(han);
        if (out.length === 16) break;
    }
    return out;
}

export type PoemCandidate = PoemSource & { id: number; famous?: boolean; score?: number };

export function pickRequest(scene: string, candidates: PoemCandidate[], count: number) {
    const lines = candidates.slice(0, 30).map((poem) => {
        const text = poem.content.split("\n");
        const shown = text.length > 8 ? [...text.slice(0, 8), "……"] : text;
        return `id=${poem.id} 《${poem.title}》${poem.dynasty} ${poem.author}${poem.famous ? "（名篇）" : ""}\n${shown.join(" ")}`;
    });
    return `画面：${scene}\n要选：${count} 首\n\n候选：\n${lines.join("\n\n")}`;
}

/** The picks that are real candidates, in the model's order, each once. */
export function parsePicks(text: string, candidates: PoemCandidate[], count: number) {
    const picks = jsonObject<{ picks?: { id?: unknown; reason?: unknown }[] }>(text)?.picks || [];
    const out: { poem: PoemCandidate; reason: string }[] = [];
    for (const pick of picks) {
        const poem = candidates.find((item) => item.id === Number(pick.id));
        if (!poem || out.some((item) => item.poem.id === poem.id)) continue;
        out.push({ poem, reason: String(pick.reason || "").trim() });
        if (out.length === count) break;
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// 配诗: where to put the poem, and the layers that set it.

/** A rectangle in fractions of the picture (0–1). */
export type PoemBox = { x0: number; y0: number; x1: number; y1: number };

/** Where to look for the blank area the prompt asked for. */
export function blankHint(ratio: PoemRatio, layout: PoemLayoutKind = "compact"): PoemBox {
    if (layout === "poster") return ratio === "3:2" ? { x0: 0.14, y0: 0, x1: 0.5, y1: 1 } : { x0: 0.5, y0: 0, x1: 1, y1: 0.5 };
    return ratio === "3:2" ? { x0: 0, y0: 0, x1: 0.5, y1: 1 } : { x0: 0.4, y0: 0, x1: 1, y1: 0.62 };
}

/** 大标题: where the title goes (the dark area the prompt asked for). */
export function titleArea(ratio: PoemRatio): PoemBox {
    return ratio === "3:2" ? { x0: 0.025, y0: 0.06, x1: 0.14, y1: 0.85 } : { x0: 0.045, y0: 0.035, x1: 0.33, y1: 0.6 };
}

function boxBlur(src: Float32Array, w: number, h: number): Float32Array {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let sum = 0;
            let n = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    const xx = x + dx;
                    const yy = y + dy;
                    if (xx >= 0 && yy >= 0 && xx < w && yy < h) {
                        sum += src[yy * w + xx];
                        n++;
                    }
                }
            }
            out[y * w + x] = sum / n;
        }
    }
    return out;
}

/**
 * The largest rectangle inside `hint` whose pixels are calm (low edge energy) — the blank sky or
 * paper the prompt asked for. `gray` is a luminance grid of w×h (a downscaled picture).
 */
export function calmBox(gray: Float32Array, w: number, h: number, hint: PoemBox, threshold = 40, minFill = 0.97): PoemBox | null {
    const edges = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
            const gx = (gray[y * w + x + 1] - gray[y * w + x - 1]) / 2;
            const gy = (gray[(y + 1) * w + x] - gray[(y - 1) * w + x]) / 2;
            edges[y * w + x] = Math.min(255, Math.hypot(gx, gy) * 8);
        }
    }
    const blurred = boxBlur(boxBlur(edges, w, h), w, h);
    const sat = new Int32Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
        let row = 0;
        for (let x = 0; x < w; x++) {
            row += blurred[y * w + x] < threshold ? 1 : 0;
            sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1] + row;
        }
    }
    const sum = (x0: number, y0: number, x1: number, y1: number) => sat[y1 * (w + 1) + x1] - sat[y0 * (w + 1) + x1] - sat[y1 * (w + 1) + x0] + sat[y0 * (w + 1) + x0];
    const hx0 = Math.floor(hint.x0 * w);
    const hy0 = Math.floor(hint.y0 * h);
    const hx1 = Math.floor(hint.x1 * w);
    const hy1 = Math.floor(hint.y1 * h);
    const step = Math.max(1, Math.round(Math.min(w, h) / 64));
    let best: [number, number, number, number, number] | null = null;
    for (let y0 = hy0; y0 < hy1; y0 += step) {
        for (let y1 = y0 + Math.floor(h / 8); y1 <= hy1; y1 += step) {
            for (let x0 = hx0; x0 < hx1; x0 += step) {
                for (let x1 = x0 + Math.floor(w / 8); x1 <= hx1; x1 += step) {
                    const area = (y1 - y0) * (x1 - x0);
                    if (best && area <= best[0]) continue;
                    if (sum(x0, y0, x1, y1) >= area * minFill) best = [area, x0, y0, x1, y1];
                }
            }
        }
    }
    if (!best) return null;
    const [, x0, y0, x1, y1] = best;
    const m = 0.05;
    return { x0: (x0 + m * (x1 - x0)) / w, y0: (y0 + m * (y1 - y0)) / h, x1: (x1 - m * (x1 - x0)) / w, y1: (y1 - m * (y1 - y0)) / h };
}

/** The title as set on the picture: a trailing note that tells same-named poems apart is dropped. */
export function displayTitle(title: string) {
    return title.replace(/\s*[（(][^（）()]*[）)]\s*$/, "").trim() || title;
}

/** The poem's lines as columns: one per line when it fits `rows`, else wrapped at punctuation. */
export function poemColumns(text: string, rows: number): string[] {
    const lines = text
        .split("\n")
        .map((line) => line.replace(/\s+/g, ""))
        .filter(Boolean);
    const out: string[] = [];
    for (const line of lines) {
        let rest = Array.from(line);
        while (rest.length > rows) {
            // Break after the last punctuation mark that fits, else at `rows` (punctuation stays with its character).
            let cut = -1;
            for (let i = Math.min(rows, rest.length) - 1; i > 0; i--) {
                if ("，。、；：！？".includes(rest[i])) {
                    cut = i + 1;
                    break;
                }
            }
            if (cut <= rows / 3) cut = "，。、；：！？".includes(rest[rows]) ? rows - 1 : rows;
            out.push(rest.slice(0, cut).join(""));
            rest = rest.slice(cut);
        }
        if (rest.length) out.push(rest.join(""));
    }
    return out;
}

export type PoemInk = "ink" | "light";

export type PoemLayoutInput = {
    title: string;
    author: string; // "〔清〕高鼎"
    lines: string;
    box: PoemBox;
    /** Picture width / height. */
    aspect: number;
    font: TextFontId;
    titleFont: TextFontId;
    ink: PoemInk;
    seal: string;
};

const TITLE_SCALE = 1.5;
const AUTHOR_SCALE = 0.62;
const BODY_LETTER = 0.12;
const BODY_LINE = 0.55;

/**
 * Text layers that set the poem in the box, right to left: the title (larger), the author (smaller,
 * a little lower), the lines, and a seal under the last column. Sizes are fractions of the picture
 * width, positions fractions of its width / height (the TextLayer model).
 */
export function poemLayers(input: PoemLayoutInput): TextLayer[] {
    const { box, aspect } = input;
    // Work in units of the picture width: the box is boxW wide and boxH tall.
    const boxW = box.x1 - box.x0;
    const boxH = (box.y1 - box.y0) / aspect;
    const title = displayTitle(input.title);
    const titleLen = Array.from(title).length;
    let best: { f: number; columns: string[] } | null = null;
    for (let f = Math.min(boxW, boxH) / 3; f >= 0.008; f *= 0.95) {
        const rows = Math.max(2, Math.floor(boxH / (f * (1 + BODY_LETTER))));
        const columns = poemColumns(input.lines, rows);
        const titleF = f * TITLE_SCALE;
        const titleH = titleLen * titleF * 1.08;
        const width = titleF + f * 0.5 + f * AUTHOR_SCALE + f * 0.7 + Math.max(0, columns.length - 1) * f * (1 + BODY_LINE) + f;
        if (columns.length && width <= boxW && titleH <= boxH) {
            best = { f: Math.min(f, 0.075), columns };
            break;
        }
    }
    const f = best?.f ?? 0.012;
    const columns = best?.columns ?? poemColumns(input.lines, 20);
    const color = input.ink === "ink" ? "#2b2622" : "#f6ecd6";
    const effectColor = input.ink === "ink" ? "#f4ecd8" : "#0c1620";
    const titleF = f * TITLE_SCALE;
    const authorF = f * AUTHOR_SCALE;
    const bodyW = Math.max(0, columns.length - 1) * f * (1 + BODY_LINE) + f;
    const total = titleF + f * 0.5 + authorF + f * 0.7 + bodyW;
    const portrait = aspect < 1.2;
    // Portrait: hug the right side of the box; landscape: centre in the box.
    let right = portrait ? box.x1 : box.x0 + (boxW + total) / 2;
    const top = box.y0;
    const titleX = right - titleF;
    right = titleX - f * 0.5;
    const authorX = right - authorF;
    right = authorX - f * 0.7;
    const bodyX = right - bodyW;
    const layers = [
        createTextLayer({ text: title, font: input.titleFont, vertical: true, size: titleF, x: titleX, y: top, color, letterSpacing: 0.08, lineSpacing: 0.3, effect: "shadow", effectColor }),
        createTextLayer({ text: input.author, font: input.font, vertical: true, size: authorF, x: authorX, y: top + titleF * aspect * 0.8, color, letterSpacing: 0.1, lineSpacing: 0.3, effect: "shadow", effectColor }),
        createTextLayer({ text: columns.join("\n"), font: input.font, vertical: true, size: f, x: bodyX, y: top, color, letterSpacing: BODY_LETTER, lineSpacing: BODY_LINE, effect: "shadow", effectColor }),
    ];
    if (input.seal.trim()) {
        // Under the last (leftmost) column, centred on it.
        const lastLen = Array.from(columns[columns.length - 1] || "").length;
        const sealSize = f * 0.75;
        const sealW = (Array.from(input.seal.trim()).length <= 2 ? 1 : 2) * sealSize * 1.08 + sealSize * 0.64;
        const sealX = bodyX + f / 2 - sealW / 2;
        const sealY = top + (lastLen * f * (1 + BODY_LETTER) + f * 0.5) * aspect;
        layers.push(createSealLayer({ text: input.seal.trim(), size: sealSize, x: Math.max(0.01, sealX), y: Math.min(0.92, sealY) }));
    }
    return layers;
}

export type PosterLayoutInput = {
    title: string;
    author: string;
    lines: string;
    titleBox: PoemBox;
    bodyBox: PoemBox;
    /** Picture width / height. */
    aspect: number;
    font: TextFontId;
    titleFont: TextFontId;
    titleInk: PoemInk;
    bodyInk: PoemInk;
    seal: string;
};

const POSTER_BODY_LETTER = 0.16;
const POSTER_BODY_LINE = 0.8;

/**
 * 大标题: a large vertical title filling the title area (two columns when it is long), the author small
 * beside it with the seal under it, and the lines in ruled columns at the right of the body area.
 * Sizes are fractions of the picture width, positions of its width / height.
 */
export function posterLayers(input: PosterLayoutInput): TextLayer[] {
    const { aspect, titleBox, bodyBox } = input;
    const title = displayTitle(input.title).replace(/[·・]/g, "");
    const n = Math.max(1, Array.from(title).length);
    const titleCols = n > 6 ? 2 : 1;
    const titleRows = Math.ceil(n / titleCols);
    const tW = titleBox.x1 - titleBox.x0;
    const tH = (titleBox.y1 - titleBox.y0) / aspect;
    // Characters stacked a little tighter than their size; two columns sit 0.15 apart.
    const t = Math.min(0.2, tH / (titleRows * 1.04), tW / (titleCols + (titleCols - 1) * 0.15));
    const titleColor = input.titleInk === "light" ? "#f6eedc" : "#2a2420";
    const titleShadow = input.titleInk === "light" ? "#0b1520" : "#f4ecd8";
    const titleW = t * (titleCols + (titleCols - 1) * 0.15);
    const layers: TextLayer[] = [
        createTextLayer({ text: title, font: input.titleFont, vertical: true, size: t, x: titleBox.x0, y: titleBox.y0, color: titleColor, letterSpacing: 0.04, lineSpacing: 0.15, wrapAt: titleCols > 1 ? titleRows : 0, effect: "shadow", effectColor: titleShadow }),
    ];
    // The author beside the title, from its second character down (the top corner is often the moon or a
    // peak); the seal under it.
    const a = Math.max(0.022, t * 0.24);
    const authorX = titleBox.x0 + titleW + t * 0.12;
    const authorY = titleBox.y0 + t * aspect * (titleRows > 2 ? 1.15 : 0.6);
    if (input.author.trim()) {
        layers.push(createTextLayer({ text: input.author, font: input.font, vertical: true, size: a, x: authorX, y: authorY, color: titleColor, letterSpacing: 0.12, lineSpacing: 0.2, effect: "shadow", effectColor: titleShadow }));
    }
    if (input.seal.trim()) {
        const authorLen = Array.from(input.author.trim()).length;
        layers.push(createSealLayer({ text: input.seal.trim(), size: a * 0.8, x: authorX - a * 0.1, y: authorY + (authorLen * a * 1.12 + a * 0.6) * aspect }));
    }
    // The lines: the largest size whose ruled columns fit the body area.
    const bW = bodyBox.x1 - bodyBox.x0;
    const bH = (bodyBox.y1 - bodyBox.y0) / aspect;
    let fit: { f: number; columns: string[] } | null = null;
    for (let f = Math.min(bW, bH) / 3; f >= 0.01; f *= 0.95) {
        const rows = Math.max(2, Math.floor(bH / (f * (1 + POSTER_BODY_LETTER))));
        const columns = poemColumns(input.lines, rows);
        const width = (columns.length - 1) * f * (1 + POSTER_BODY_LINE) + f + f * POSTER_BODY_LINE;
        if (columns.length && width <= bW) {
            fit = { f: Math.min(f, 0.048), columns };
            break;
        }
    }
    const f = fit?.f ?? 0.014;
    const columns = fit?.columns ?? poemColumns(input.lines, 16);
    const blockW = (columns.length - 1) * f * (1 + POSTER_BODY_LINE) + f;
    const bodyColor = input.bodyInk === "ink" ? "#2b2622" : "#f6ecd6";
    layers.push(
        createTextLayer({
            text: columns.join("\n"),
            font: input.font,
            vertical: true,
            size: f,
            // Hug the right of the area, leaving room for the outer rule.
            x: bodyBox.x1 - blockW - f * POSTER_BODY_LINE * 0.5,
            y: bodyBox.y0 + f * aspect * 0.4,
            color: bodyColor,
            letterSpacing: POSTER_BODY_LETTER,
            lineSpacing: POSTER_BODY_LINE,
            effect: "none",
            rules: true,
        }),
    );
    return layers;
}

/** 〔清〕高鼎 */
export function authorLine(poem: Pick<PoemSource, "author" | "dynasty">) {
    return poem.author ? `${poem.dynasty ? `〔${poem.dynasty}〕` : ""}${poem.author}` : "";
}

// ---------------------------------------------------------------------------------------------
// Projects (stored in IndexedDB by the page).

export type PoemImage = { url: string; storageKey?: string; width: number; height: number; mimeType?: string };

export type PoemDrawing = { id: string; image: PoemImage; prompt: string; createdAt: number };

export type PoemProject = {
    id: string;
    /** The prompt template's id (DEFAULT_TEMPLATE_ID or one of the user's). */
    templateId?: string;
    /** 版式 (older projects: compact). */
    layout?: PoemLayoutKind;
    poem: PoemSource;
    /** The lines set on the picture (and drawn): the whole poem, or the lines picked from a long one. */
    lines: string;
    style: PoemStyleId;
    ratio: PoemRatio;
    scene: string;
    drawings: PoemDrawing[];
    chosen?: string;
    /** 配诗 settings and the layers last placed on the chosen drawing. */
    font: TextFontId;
    titleFont: TextFontId;
    seal: string;
    layers?: TextLayer[];
    /** The finished poster (picture + poem), when saved. */
    poster?: PoemImage;
    createdAt: number;
    updatedAt: number;
};

/** Long texts (prose, long poems) start with their first lines only; the user can change them. */
export function defaultLines(content: string) {
    const lines = content.split("\n").filter((line) => line.trim());
    const chars = lines.join("").length;
    if (chars <= 120) return lines.join("\n");
    const out: string[] = [];
    let n = 0;
    for (const line of lines) {
        if (n + line.length > 80 && out.length) break;
        out.push(line);
        n += line.length;
    }
    return out.join("\n");
}
