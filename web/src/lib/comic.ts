// 画漫画: a one-line idea becomes a short comic in four steps — story (a text model writes the panels),
// characters (a design sheet per character, used as a reference for every page), one full page drawn in a
// single image (the model keeps the characters consistent inside one image) and lettering (dialogue is text
// laid over the empty speech bubbles the model left, so it can be edited and never has typos).
// Everything here is pure or browser-only; the page in pages/comic wires it to storage and the UI.

export type ComicGenre = "funny" | "work" | "romance" | "science" | "brand";
export type ComicLineKind = "speech" | "thought" | "shout" | "narration";

export type ComicLine = { speaker: string; text: string; kind: ComicLineKind };

export type ComicPanel = {
    id: string;
    /** Role of the panel in the story (起 / 承 / 转 / 合, 提问 / 解释…). */
    beat: string;
    shot: string;
    /** Who does what, with expressions. */
    action: string;
    /** Where it happens. */
    place: string;
    characters: string[];
    lines: ComicLine[];
    /** One sentence on why the panel is written (and prompted) this way — the prompt lesson. */
    note: string;
};

export type ComicImage = { url: string; storageKey?: string; width: number; height: number; mimeType?: string };

export type ComicCharacter = {
    id: string;
    name: string;
    role: string;
    /** Fixed look, written into every panel prompt. */
    look: string;
    sheets: ComicImage[];
    /** Index into sheets of the chosen design (-1: none yet). */
    sheet: number;
    /** A photo the design sheet is drawn from (pets, oneself). */
    photo?: ComicImage;
};

/** A bubble rectangle in page fractions (0–1). `drawn`: we draw the balloon ourselves (none was found). */
export type ComicBubble = { id: string; panel: number; line: number; text: string; kind: ComicLineKind; x: number; y: number; w: number; h: number; drawn: boolean };

export type ComicPage = { id: string; image: ComicImage; bubbles: ComicBubble[]; createdAt: number; label?: string; prompt: string };

export type ComicStep = "story" | "characters" | "page" | "letter";

export type ComicProject = {
    id: string;
    title: string;
    idea: string;
    genre: ComicGenre;
    panelCount: number;
    style: ComicStyleChoice;
    characters: ComicCharacter[];
    panels: ComicPanel[];
    pages: ComicPage[];
    /** Index into pages of the version shown. */
    page: number;
    step: ComicStep;
    createdAt: number;
    updatedAt: number;
};

export type ComicStyleChoice = { id: string; name: string; prompt: string; cover?: string };

export const COMIC_PANEL_COUNTS = [4, 6] as const;

export const COMIC_GENRES: Array<{ id: ComicGenre; beats: string[] }> = [
    { id: "funny", beats: ["起", "承", "转", "合"] },
    { id: "work", beats: ["起", "承", "转", "合"] },
    { id: "romance", beats: ["起", "承", "转", "合"] },
    { id: "science", beats: ["提问", "解释", "举例", "总结"] },
    { id: "brand", beats: ["痛点", "转机", "产品", "结果"] },
];

const GENRE_BRIEF: Record<ComicGenre, string> = {
    funny: "日常搞笑：按起承转合，第三格出意外，最后一格反转或反差，让人会心一笑。",
    work: "职场吐槽：打工人的共鸣点，夸张但真实，结尾一句扎心或自嘲。",
    romance: "恋爱小剧场：甜、心动或小误会，节奏轻快，结尾温暖。",
    science: "科普小漫画：角色提出一个问题，用对话和画面把知识讲清楚，举一个生活里的例子，最后一格一句话总结。知识要准确。",
    brand: "品牌 / 产品故事：先讲一个真实的痛点，再出现转机，产品自然登场解决问题，最后展示好结果。不要硬广，产品名用用户给的，不要编造功效和数据。",
};

/** Built-in styles; the 327 hand-drawn styles of the prompt library can be picked as well. */
export const COMIC_STYLES: ComicStyleChoice[] = [
    { id: "manga-cute", name: "日系萌漫", prompt: "日系萌系漫画风格，干净的黑色线稿，柔和的平涂上色，角色圆润可爱，表情夸张生动" },
    { id: "guoman", name: "国漫厚涂", prompt: "国风漫画厚涂风格，细腻的光影和质感，色彩浓郁，人物比例写实偏唯美" },
    { id: "american", name: "美漫", prompt: "美式漫画风格，粗犷有力的黑色描边，高对比的色块和阴影，网点和动感线条" },
    { id: "chibi", name: "Q 版", prompt: "Q 版二头身漫画风格，大头小身子，线条圆润，配色明亮清新，非常可爱" },
    { id: "screentone", name: "黑白网点", prompt: "黑白日漫风格，只用黑白灰，网点纸阴影，速度线和集中线，像印刷的漫画书" },
    { id: "picture-book", name: "水彩绘本", prompt: "水彩绘本风格，柔和的水彩晕染，铅笔淡线稿，温暖治愈的色调" },
];

/** What a beat is for — shown on the panel card so beginners learn how a short comic is built. */
export const BEAT_TIPS: Record<string, string> = {
    起: "交代谁、在哪。第一格让读者认识主角和场景，常用远景。",
    承: "顺着往下发展，节奏放慢，给后面的意外做铺垫。",
    转: "出意外！笑点或冲突通常在这一格，用近景、特写或速度线制造紧张。",
    合: "给个结局或反差，出人意料又合情合理，让人想转发。",
    提问: "角色抛出一个读者也好奇的问题。",
    解释: "用对话把答案讲清楚，一格只讲一个点。",
    举例: "用生活里的例子或比喻，让知识看得见。",
    总结: "一句话总结，最好有个小幽默收尾。",
    痛点: "先讲一个真实的烦恼，让读者觉得「这不就是我吗」。",
    转机: "情况开始变化，引出解决办法。",
    产品: "产品自然登场，展示它怎么解决问题，不要硬广。",
    结果: "展示用了之后的好结果，情绪要正向。",
};

export const SHOTS = ["远景", "中景", "近景", "特写"] as const;

// ---------------------------------------------------------------------------------------------
// Story: the text model returns JSON.

export const STORY_INSTRUCTION = [
    "你是漫画编剧，帮完全不懂漫画的新手把一个点子写成短篇条漫的分镜。",
    "只输出一个 JSON 对象，不要任何解释，不要代码块。格式：",
    '{"title":"标题，10 字以内","characters":[{"name":"角色名","role":"主角/配角","look":"固定外貌，30–60 字：物种或人物、体型、发型/毛色、五官特点、固定服装和配饰，写得具体，便于每一格都画得一样"}],"panels":[{"beat":"这一格在结构里的作用","shot":"远景/中景/近景/特写","action":"谁在做什么、什么表情，20–50 字","place":"在哪里、时间和环境，10–25 字","characters":["出场角色名"],"lines":[{"speaker":"说话的角色名，旁白写「旁白」","text":"对白","kind":"speech/thought/shout/narration"}],"note":"一句话说明这一格的镜头和画面为什么这样写，40 字以内，给新手看"}]}',
    "要求：",
    "1. 角色 1–3 个；没有特别说明时，主角可以是可爱的动物或普通人，不要用现有动漫、影视里的角色和名人。",
    "2. 每格只讲一件事；对白每句不超过 14 个字，每格最多 2 句，能用画面表达的就不写字；有的格子可以没有对白。",
    "3. 镜头要有变化，不要每格都一样。",
    "4. 不要出现血腥、暴力、色情、政治和歧视内容。",
    "5. 用户写出的名字、品牌和具体内容原样使用，不要编造产品功效、数据和日期。",
].join("\n");

export function storyRequest(input: { idea: string; genre: ComicGenre; panelCount: number; previous?: ComicStory; change?: string }) {
    const genre = COMIC_GENRES.find((item) => item.id === input.genre) || COMIC_GENRES[0];
    const beats = beatsFor(genre.id, input.panelCount);
    const lines = [`点子：${input.idea.trim()}`, `类型：${GENRE_BRIEF[genre.id]}`, `一共 ${input.panelCount} 格，每格的 beat 依次是：${beats.join("、")}。`];
    if (input.previous) {
        lines.push(`上一版分镜：${JSON.stringify(input.previous)}`);
        lines.push(`这次的修改要求：${input.change?.trim() || "换一种写法"}。没有要求改动的地方尽量保留，角色外貌不要变；输出完整的新 JSON。`);
    }
    return lines.join("\n");
}

/** Beats for n panels: the genre's four, with the middle ones repeated for six. */
export function beatsFor(genre: ComicGenre, panelCount: number) {
    const base = (COMIC_GENRES.find((item) => item.id === genre) || COMIC_GENRES[0]).beats;
    if (panelCount <= base.length) return base.slice(0, panelCount);
    const middle = base.slice(1, -1);
    const out = [base[0]];
    for (let i = 0; out.length < panelCount - 1; i++) out.push(middle[Math.floor((i * middle.length) / (panelCount - 2))]);
    return [...out, base[base.length - 1]];
}

export type ComicStory = { title: string; characters: Array<{ name: string; role: string; look: string }>; panels: Array<Omit<ComicPanel, "id">> };

const LINE_KINDS: ComicLineKind[] = ["speech", "thought", "shout", "narration"];

/** Reads the model's answer; tolerant of code fences, prose around the JSON and missing fields. */
export function parseStory(text: string, panelCount: number): ComicStory {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no json");
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const str = (value: unknown, max = 200) => (typeof value === "string" ? value.trim().slice(0, max) : "");
    const characters = (Array.isArray(raw.characters) ? raw.characters : [])
        .map((item) => item as Record<string, unknown>)
        .map((item) => ({ name: str(item.name, 12), role: str(item.role, 8), look: str(item.look, 160) }))
        .filter((item) => item.name)
        .slice(0, 4);
    const names = new Set(characters.map((item) => item.name));
    const panels = (Array.isArray(raw.panels) ? raw.panels : [])
        .map((item) => item as Record<string, unknown>)
        .map((item) => ({
            beat: str(item.beat, 6),
            shot: SHOTS.find((shot) => str(item.shot).includes(shot)) || "中景",
            action: str(item.action),
            place: str(item.place, 80),
            characters: (Array.isArray(item.characters) ? item.characters : []).map((name) => str(name, 12)).filter((name) => names.has(name)),
            lines: (Array.isArray(item.lines) ? item.lines : [])
                .map((line) => line as Record<string, unknown>)
                .map((line) => ({ speaker: str(line.speaker, 12), text: str(line.text, 40), kind: (LINE_KINDS.includes(line.kind as ComicLineKind) ? line.kind : str(line.speaker) === "旁白" ? "narration" : "speech") as ComicLineKind }))
                .filter((line) => line.text)
                .slice(0, 3),
            note: str(item.note, 120),
        }))
        .filter((panel) => panel.action)
        .slice(0, panelCount);
    if (!panels.length) throw new Error("no panels");
    return { title: str(raw.title, 20), characters, panels };
}

// ---------------------------------------------------------------------------------------------
// Prompts. Each panel prompt is built from labelled segments so the page can show beginners which part
// of the prompt does what (镜头 / 人物 / 动作 / 场景 / 画风 / 留白).

export type PromptSegmentKind = "shot" | "who" | "action" | "place" | "style" | "space";
export type PromptSegment = { kind: PromptSegmentKind; text: string };

export function panelSegments(panel: Pick<ComicPanel, "shot" | "action" | "place" | "characters" | "lines">, characters: ComicCharacter[], style: ComicStyleChoice): PromptSegment[] {
    const who = panel.characters
        .map((name) => characters.find((item) => item.name === name))
        .filter((item): item is ComicCharacter => Boolean(item))
        .map((item) => `${item.name}（${item.look}）`);
    const segments: PromptSegment[] = [{ kind: "shot", text: panel.shot }];
    if (who.length) segments.push({ kind: "who", text: who.join("，") });
    segments.push({ kind: "action", text: panel.action });
    if (panel.place) segments.push({ kind: "place", text: panel.place });
    segments.push({ kind: "style", text: style.prompt });
    segments.push({ kind: "space", text: spaceInstruction(panel.lines) });
    return segments;
}

function spaceInstruction(lines: ComicLine[]) {
    const speakers = lines.filter((line) => line.kind !== "narration").map((line) => line.speaker);
    const narration = lines.length - speakers.length;
    const parts: string[] = [];
    // Lines are matched to balloons in reading order, so the order of the speakers is spelled out.
    if (speakers.length === 1) parts.push(`留 1 个空白的白色对话气泡，尾巴指向${speakers[0]}`);
    else if (speakers.length > 1) parts.push(`留 ${speakers.length} 个空白的白色对话气泡，从左到右依次是${speakers.join("、")}说的，尾巴指向说话的人`);
    if (narration) parts.push("角落留一个空白的长方形旁白框");
    return parts.length ? `${parts.join("，")}，气泡里不要写字` : "这一格没有对白，不要画对话气泡";
}

/** Layout of a page: rows × columns of equal panels, reading left to right, top to bottom. */
export function pageGrid(panelCount: number) {
    return panelCount <= 4 ? { rows: panelCount, cols: 1 } : { rows: Math.ceil(panelCount / 2), cols: 2 };
}

/** Panel rectangles in page fractions (approximate; the model draws its own gutters). */
export function panelRects(panelCount: number) {
    const { rows, cols } = pageGrid(panelCount);
    return Array.from({ length: panelCount }, (_, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        return { x: col / cols, y: row / rows, w: 1 / cols, h: 1 / rows };
    });
}

/** The prompt for a whole page; character design sheets are sent as 图片1, 图片2… in `sheetCharacters` order. */
export function pagePrompt(project: Pick<ComicProject, "panels" | "characters" | "style">, sheetCharacters: ComicCharacter[]) {
    const n = project.panels.length;
    const { rows, cols } = pageGrid(n);
    const layout = cols === 1 ? `${n} 个等高的横向长格子从上到下排列` : `${rows} 行 ${cols} 列共 ${n} 个大小相同的格子，阅读顺序从左到右、从上到下`;
    const lines = [`一整页竖版漫画，${layout}，格子之间是细黑边框和白色间隔。`, `画风：${project.style.prompt}。整页画风统一。`];
    if (sheetCharacters.length) {
        lines.push(`角色必须和参考图完全一致（脸型、毛色/发型、服装、配色都不能变）：${sheetCharacters.map((item, index) => `${item.name}是图片${index + 1}里的角色，${item.look}`).join("；")}。参考图只用来确定角色长相，不要照搬参考图的排版。`);
    }
    project.panels.forEach((panel, index) => {
        const segments = panelSegments(panel, project.characters, project.style).filter((segment) => segment.kind !== "style");
        lines.push(`第 ${index + 1} 格：${segments.map((segment) => segment.text).join("，")}。`);
    });
    lines.push("所有对话气泡和旁白框都保持空白，整页画面里不要出现任何文字、字母、数字和拟声字，不要页码、标题、签名和水印。");
    return lines.join("\n");
}

export function characterSheetPrompt(character: Pick<ComicCharacter, "name" | "look">, style: ComicStyleChoice, fromPhoto: boolean) {
    return [
        fromPhoto ? `把图片1里的主体画成漫画角色「${character.name}」，保留它最有辨识度的特征（花色、脸型、发型、标志性的配饰）。` : `漫画角色设定图，角色「${character.name}」。`,
        `角色外貌：${character.look}。`,
        `画风：${style.prompt}。`,
        "纯米白色背景，横版排布：左边依次是同一个角色的正面全身、侧面全身、背面全身，右边一列是三个头像表情（开心、惊讶、生气）。",
        "比例和服装在每个视角里完全一致。不要文字、标签、箭头和水印。",
    ].join("\n");
}

/** Prompt for changing one panel of a page (图片1: the page, 图片2: the page with that panel tinted blue). */
export function panelEditPrompt(panelIndex: number, instruction: string, sheetCharacters: ComicCharacter[], panelText: string) {
    const refs = sheetCharacters.map((item, index) => `图片${index + 3}是${item.name}的设定图`).join("，");
    return [
        `图片1是一整页漫画，图片2是同一页，第 ${panelIndex + 1} 格被蓝色半透明标出。只重画蓝色标出的这一格，其余格子、边框和留白与图片1保持完全一致，输出与图片1相同尺寸的完整一页，结果里不要保留蓝色。`,
        `这一格原来的分镜：${panelText}。`,
        `这次的修改要求：${instruction.trim()}。`,
        refs ? `角色长相要和设定图一致（${refs}）。` : "",
        "对话气泡保持空白，画面里不要出现任何文字。",
    ]
        .filter(Boolean)
        .join("\n");
}

// ---------------------------------------------------------------------------------------------
// Speech bubbles: find the empty white balloons the model drew, so the dialogue can be placed in them.

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Finds empty white regions shaped like balloons in an RGBA image. Works on a small copy (width ≤ 360):
 * near-white pixels are grouped into connected regions; a region counts as a balloon when it sits inside
 * one panel (by its centre) without touching the page edge or spanning the panel (the white gutters do), is mostly filled (an ellipse or rounded box)
 * and has a sensible size. Returns rectangles in fractions of the image, per panel, largest first.
 */
export function findBubbles(data: Uint8ClampedArray, width: number, height: number, panels: Rect[]): Rect[][] {
    const white = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        if (r > 236 && g > 236 && b > 236 && Math.max(r, g, b) - Math.min(r, g, b) < 14) white[i] = 1;
    }
    const label = new Int32Array(width * height);
    const result: Rect[][] = panels.map(() => []);
    const queue = new Int32Array(width * height);
    let next = 1;
    for (let start = 0; start < width * height; start++) {
        if (!white[start] || label[start]) continue;
        let head = 0;
        let tail = 0;
        queue[tail++] = start;
        label[start] = next;
        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;
        let area = 0;
        while (head < tail) {
            const index = queue[head++];
            const x = index % width;
            const y = (index - x) / width;
            area++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            const neighbours = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1];
            for (const n of neighbours) {
                if (n >= 0 && white[n] && !label[n]) {
                    label[n] = next;
                    queue[tail++] = n;
                }
            }
        }
        next++;
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const fill = area / (bw * bh);
        const aspect = bw / bh;
        if (fill < 0.55 || aspect < 0.35 || aspect > 4) continue;
        const cx = (minX + bw / 2) / width;
        const cy = (minY + bh / 2) / height;
        const panelIndex = panels.findIndex((panel) => cx >= panel.x && cx < panel.x + panel.w && cy >= panel.y && cy < panel.y + panel.h);
        if (panelIndex < 0) continue;
        // The white gutters touch the page edge or span a whole panel; balloons do neither.
        const panel = panels[panelIndex];
        const margin = 2;
        if (minX <= margin || minY <= margin || maxX >= width - margin - 1 || maxY >= height - margin - 1) continue;
        if (bw > panel.w * width * 0.85) continue;
        const panelArea = panel.w * width * panel.h * height;
        if (area < panelArea * 0.012 || area > panelArea * 0.3) continue;
        result[panelIndex].push({ x: minX / width, y: minY / height, w: bw / width, h: bh / height });
    }
    return result.map((list) => list.sort((a, b) => b.w * b.h - a.w * a.h));
}

/** Where a panel's lines go: into the balloons found (reading order), else drawn balloons in the corners. */
export function placeBubbles(panels: Array<Pick<ComicPanel, "lines">>, found: Rect[][], rects: Rect[], makeId: () => string): ComicBubble[] {
    const bubbles: ComicBubble[] = [];
    panels.forEach((panel, panelIndex) => {
        // Reading order: left to right for balloons side by side, else top to bottom.
        const balloons = (found[panelIndex] || []).slice(0, panel.lines.length).sort((a, b) => (Math.abs(a.y - b.y) < Math.min(a.h, b.h) * 0.6 ? a.x - b.x : a.y - b.y));
        const rect = rects[panelIndex];
        panel.lines.forEach((line, lineIndex) => {
            const balloon = balloons[lineIndex];
            if (balloon) {
                // Text sits in the box inscribed in the balloon.
                bubbles.push({ id: makeId(), panel: panelIndex, line: lineIndex, text: line.text, kind: line.kind, x: balloon.x + balloon.w * 0.14, y: balloon.y + balloon.h * 0.16, w: balloon.w * 0.72, h: balloon.h * 0.68, drawn: false });
                return;
            }
            const w = Math.min(rect.w * 0.34, 0.3);
            const h = Math.min(rect.h * 0.26, 0.09);
            const right = lineIndex % 2 === 1;
            bubbles.push({
                id: makeId(),
                panel: panelIndex,
                line: lineIndex,
                text: line.text,
                kind: line.kind,
                x: rect.x + (right ? rect.w - w - rect.w * 0.05 : rect.w * 0.05),
                y: rect.y + rect.h * 0.07 + Math.floor(lineIndex / 2) * (h + 0.01),
                w,
                h,
                drawn: true,
            });
        });
    });
    return bubbles;
}

// ---------------------------------------------------------------------------------------------
// Lettering: the same layout is used for the on-screen preview (SVG) and the exported PNG (canvas).

export const COMIC_FONT = `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;

type Measure = (text: string, fontSize: number) => number;

/** Breaks text into lines that fit `width` at the largest font size (≤ maxSize) whose lines fit `height`. */
export function fitText(text: string, width: number, height: number, measure: Measure, maxSize: number, minSize = 8) {
    const clean = text.replace(/\s+/g, " ").trim();
    for (let size = Math.floor(maxSize); size >= minSize; size--) {
        const lines = wrap(clean, width, size, measure);
        if (lines.length * size * 1.25 <= height && lines.every((line) => measure(line, size) <= width)) return { fontSize: size, lines };
    }
    return { fontSize: minSize, lines: wrap(clean, width, minSize, measure) };
}

/** Breaks at punctuation when a phrase fits on a line (「阿橘，/周报呢？」), else between characters. */
function wrap(text: string, width: number, size: number, measure: Measure) {
    const lines: string[] = [];
    let current = "";
    const phrases = text.split("\n").flatMap((part, index) => [...(index ? ["\n"] : []), ...(part.match(/[^，。！？、；：,!?;:]+[，。！？、；：,!?;:…」』）)]*|[，。！？、；：,!?;:…」』）)]+/g) || [])]);
    for (const phrase of phrases) {
        if (phrase === "\n") {
            lines.push(current);
            current = "";
        } else if (measure(current + phrase, size) <= width) current += phrase;
        else if (measure(phrase, size) <= width) {
            if (current) lines.push(current);
            current = phrase;
        } else {
            for (const char of Array.from(phrase)) {
                // Keep closing punctuation with the previous character.
                if (current && measure(current + char, size) > width && !/[，。！？、…）」』,.!?)]/.test(char)) {
                    lines.push(current);
                    current = char;
                } else current += char;
            }
        }
    }
    if (current) lines.push(current);
    return lines;
}

export function canvasMeasure(fontWeight = 700): Measure {
    const context = document.createElement("canvas").getContext("2d");
    return (text, size) => {
        if (!context) return text.length * size;
        context.font = `${fontWeight} ${size}px ${COMIC_FONT}`;
        return context.measureText(text).width;
    };
}

/** Lays out every bubble for an image of the given pixel size. */
export function layoutBubbles(bubbles: ComicBubble[], width: number, height: number, measure: Measure) {
    const maxSize = Math.max(12, Math.round(Math.min(width, height) * 0.034));
    return bubbles.map((bubble) => {
        const box = { x: bubble.x * width, y: bubble.y * height, w: bubble.w * width, h: bubble.h * height };
        const padX = bubble.drawn ? box.w * 0.14 : 0;
        const padY = bubble.drawn ? box.h * 0.16 : 0;
        const fit = fitText(bubble.text, box.w - padX * 2, box.h - padY * 2, measure, bubble.kind === "narration" ? maxSize * 0.85 : maxSize);
        return { bubble, box, ...fit };
    });
}

/** Draws the page with its lettering into a PNG blob. */
export async function renderLetteredPage(src: string, bubbles: ComicBubble[]): Promise<Blob> {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.crossOrigin = "anonymous";
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error("image load failed"));
        element.src = src;
    });
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    context.drawImage(image, 0, 0, width, height);
    const stroke = Math.max(2, Math.round(Math.min(width, height) * 0.0035));
    for (const item of layoutBubbles(bubbles, width, height, canvasMeasure())) {
        const { box, bubble } = item;
        if (bubble.drawn) drawBalloon(context, box, bubble.kind, stroke);
        context.fillStyle = "#111";
        context.font = `${bubble.kind === "narration" ? 500 : 700} ${item.fontSize}px ${COMIC_FONT}`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        const lineHeight = item.fontSize * 1.25;
        const top = box.y + box.h / 2 - ((item.lines.length - 1) * lineHeight) / 2;
        item.lines.forEach((line, index) => context.fillText(line, box.x + box.w / 2, top + index * lineHeight));
    }
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), "image/png"));
}

function drawBalloon(context: CanvasRenderingContext2D, box: Rect, kind: ComicLineKind, stroke: number) {
    context.save();
    context.lineWidth = stroke;
    context.strokeStyle = "#111";
    context.fillStyle = kind === "narration" ? "#fffbea" : "#fff";
    context.beginPath();
    if (kind === "narration") context.rect(box.x, box.y, box.w, box.h);
    else context.ellipse(box.x + box.w / 2, box.y + box.h / 2, box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
}

/** Short Chinese title for a project without one. */
export function fallbackTitle(idea: string) {
    return (
        idea
            .trim()
            .replace(/[，。！？,.!?].*$/, "")
            .slice(0, 10) || "我的漫画"
    );
}
