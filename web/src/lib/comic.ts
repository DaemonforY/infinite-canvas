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
    /** 小红书多图: the caption bar at the bottom of the slide (旁白), and the cliffhanger that makes readers swipe on. */
    caption?: string;
    hook?: string;
    /** 小红书多图: a second scene, making the slide two panels stacked (上格 = this panel, 下格 = sub). */
    sub?: ComicSubPanel;
};

export type ComicSubPanel = Pick<ComicPanel, "shot" | "action" | "place" | "characters" | "lines">;

/** How big titles (cover, 互动 question) are drawn: highlighter stroke, white box, or white letters outlined in black. */
export type ComicTitleStyle = "highlight" | "box" | "outline";
export const TITLE_STYLES: ComicTitleStyle[] = ["highlight", "box", "outline"];

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
    /** Set when the character came from, or was saved to, 我的角色. */
    libraryId?: string;
};

/** `caption`: the bar along the bottom of a 小红书 slide; `title`: big highlighted text (cover title, 互动页 question). */
export type ComicBubbleKind = ComicLineKind | "sfx" | "caption" | "title";
export type ComicTail = "left" | "right" | "none";

/**
 * Lettering. The rectangle is in page fractions (0–1), or in fractions of the panel's cell when `cell` is set
 * (逐格 pages, so a bubble stays with its panel when the layout changes). `drawn`: we draw the balloon
 * ourselves (none was found in the art). `sfx` is a sound effect: big outlined text, no balloon.
 */
export type ComicBubble = {
    id: string;
    panel: number;
    line: number;
    text: string;
    kind: ComicBubbleKind;
    x: number;
    y: number;
    w: number;
    h: number;
    drawn: boolean;
    cell?: boolean;
    tail?: ComicTail;
    color?: string;
    rotate?: number;
};

export type ComicPage = { id: string; image: ComicImage; bubbles: ComicBubble[]; createdAt: number; label?: string; prompt: string };

export type ComicStep = "story" | "characters" | "page" | "letter";

/** 整页一次出 (one image for the page) or 逐格精画 (one image per panel, laid out by us). */
export type ComicMode = "page" | "cells";
/** 一页漫画 (4 / 6 panels on one page) or 小红书多图 (one 3:4 image per scene, 3–18 of them, swiped through). */
export type ComicFormat = "page" | "slides";
export type ComicNote = { title: string; body: string; tags: string[] };
export type ComicLayoutId = "strip" | "manga" | "grid";

export type ComicCellVersion = { image: ComicImage; prompt: string; label?: string; createdAt: number };
/** A panel drawn on its own: every version kept, `focus` is where the cell crops it (0–1 each way). */
export type ComicCell = { versions: ComicCellVersion[]; version: number; focus: { x: number; y: number } };

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
    mode?: ComicMode;
    layout?: ComicLayoutId;
    /** 逐格: drawn panels by panel id, and their lettering (cell-relative bubbles). */
    cells?: Record<string, ComicCell>;
    cellBubbles?: ComicBubble[];
    /** 连载: episodes of one series share an id; `title` is the series name. */
    series?: ComicSeries;
    /** 小红书多图 (slides are drawn like 逐格 panels and stored in `cells` / `cellBubbles`). */
    format?: ComicFormat;
    /** Whether the last slide is the 互动页. */
    cta?: boolean;
    coverTitles?: string[];
    coverTitle?: string;
    /** 笔记文案 for the post. */
    note?: ComicNote;
    /** Page numbers 「2/7」 on slides (on unless turned off). */
    pageNumbers?: boolean;
    titleStyle?: ComicTitleStyle;
    createdAt: number;
    updatedAt: number;
};

export type ComicStyleChoice = { id: string; name: string; prompt: string; cover?: string };

export type ComicSeries = { id: string; title: string; episode: number };

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
    封面: "封面只放结果、不说原因，主角大表情，顶部留大标题，让人想点开。",
    交代: "交代谁、在哪、要干嘛，一张图就让人看懂。",
    发展: "顺着往下发展，一张只讲一件事，结尾留个小悬念。",
    转折: "出意外！这一张结尾最好卡在悬念上，让人忍不住往后滑。",
    高潮: "冲突最激烈、笑点最大的一张，画面要夸张。",
    反转: "出人意料的反转，是读者转发的理由。",
    结局: "给个结局或余味，情绪落下来。",
    互动: "最后一张请读者评论：问一个和故事有关、人人能答的问题。",
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

/** 小红书多图: one scene per 3:4 image, swiped through; the cover and the 互动页 are slides too. */
export const SLIDES_INSTRUCTION = [
    "你是小红书漫画博主的编剧，帮完全不懂漫画的新手把一个点子写成小红书多图漫画：一张图讲一幕，读者一张张往后滑着看完一个故事。",
    "只输出一个 JSON 对象，不要任何解释，不要代码块。格式：",
    '{"title":"故事名，10 字以内","coverTitles":["封面标题 1","封面标题 2","封面标题 3"],"characters":[{"name":"角色名","role":"主角/配角","look":"固定外貌，30–60 字：物种或人物、体型、发型/毛色、五官特点、固定服装和配饰，写得具体"}],"slides":[{"beat":"封面/交代/发展/转折/高潮/反转/结局/互动","shot":"远景/中景/近景/特写","action":"谁在做什么、什么表情，20–50 字","place":"在哪里、时间和环境，10–25 字","characters":["出场角色名"],"lines":[{"speaker":"说话的角色名","text":"对白","kind":"speech/thought/shout"}],"caption":"底部字幕条的旁白，18 字以内，可以为空","hook":"这一张结尾留的悬念（让人想往后滑），可以为空","note":"一句话说明这一张为什么这样写，40 字以内，给新手看"}]}',
    "要求：",
    "1. 第 1 张是封面：主角特写、大表情，画面和故事的结果有关但不说破原因；不要对白和字幕。coverTitles 给 3 个封面标题，每个 20 字以内：只说结果不说原因、用「我」或主角的口吻、带反差，像小红书爆款标题。",
    "2. 中间每张只讲一幕：交代 → 发展（可以有好几张）→ 转折 → 高潮 → 反转或结局。镜头要有变化。转折前后的几张写 hook，卡在悬念上。",
    "3. 对白每句不超过 14 个字，每张最多 2 句；字幕条讲旁白和时间变化（「下班前……」），能用画面表达的就不写字。",
    "4. 如果要互动页：最后一张 beat 写「互动」，主要角色对着读者挥手或摆姿势，caption 写一个和故事有关、人人能答的问题（20 字以内），lines 留空。",
    "5. 角色 1–3 个；不要用现有动漫、影视里的角色和名人；不要血腥、暴力、色情、政治和歧视内容；用户写出的名字和具体内容原样使用。",
].join("\n");

/** Asks for one new slide to insert after `index` (fits between its neighbours). */
export function slideInsertRequest(project: Pick<ComicProject, "title" | "panels" | "characters">, index: number) {
    const brief = (panel: ComicPanel | undefined) => (panel ? `${panel.beat}：${panel.action}${panel.lines.length ? `（${panel.lines.map((line) => `${line.speaker}：「${line.text}」`).join(" ")}）` : ""}` : "（没有）");
    return [
        `这是小红书多图漫画《${project.title}》的分镜，一共 ${project.panels.length} 张：`,
        ...project.panels.map((panel, i) => `${i + 1}. ${brief(panel)}`),
        `请在第 ${index + 1} 张和第 ${index + 2} 张之间插入一张新的，让前后衔接得更自然或者多一个笑点。`,
        `可用角色：${project.characters.map((item) => `${item.name}：${item.look}`).join("；")}`,
        '只输出一个 JSON 对象：{"slides":[{这一张，字段和格式与分镜相同}]}',
    ].join("\n");
}

/** Slides that may hold two panels: not the cover or the 互动页, which need the room for big text. */
export function canHoldTwoPanels(panel: Pick<ComicPanel, "beat">) {
    return panel.beat !== "封面" && panel.beat !== "互动";
}

/** Asks for the 下格 of a slide becoming two panels: the next moment after the slide's own scene. */
export function subSceneRequest(project: Pick<ComicProject, "title" | "panels" | "characters">, index: number) {
    const panel = project.panels[index];
    return [
        `小红书多图漫画《${project.title}》的第 ${index + 1} 张要改成上下两格。上格就是这张原来的内容：${panel.action}（${panel.place}）${panel.lines.length ? `，对白：${panel.lines.map((line) => `${line.speaker}：「${line.text}」`).join(" ")}` : ""}。`,
        `下一张是：${project.panels[index + 1]?.action || "（没有，这是最后一张）"}。`,
        "请写下格：紧接着上格的下一刻（同一个场景），用一个动作或表情的变化制造小笑点或反差，不要抢下一张的内容。",
        `可用角色：${project.characters.map((item) => `${item.name}：${item.look}`).join("；")}`,
        '只输出一个 JSON 对象：{"slides":[{"beat":"下格","shot":"远景/中景/近景/特写","action":"…","place":"…","characters":["…"],"lines":[{"speaker":"…","text":"14 字以内","kind":"speech/thought/shout"}]}]}',
    ].join("\n");
}

/** Asks for one slide rewritten as two consecutive slides (more room for the moment). */
export function splitSlideRequest(project: Pick<ComicProject, "title" | "panels" | "characters">, index: number) {
    const panel = project.panels[index];
    return [
        `小红书多图漫画《${project.title}》的第 ${index + 1} 张（${panel.beat}）要拆成两张，把这一幕讲得更细：${panel.action}（${panel.place}）${panel.lines.length ? `，对白：${panel.lines.map((line) => `${line.speaker}：「${line.text}」`).join(" ")}` : ""}${panel.caption ? `，字幕：${panel.caption}` : ""}。`,
        "第一张铺垫，第二张给出结果或笑点；第一张结尾写 hook。不要改变故事走向。",
        `可用角色：${project.characters.map((item) => `${item.name}：${item.look}`).join("；")}`,
        '只输出一个 JSON 对象：{"slides":[{第一张},{第二张}]}，字段和分镜相同（beat、shot、action、place、characters、lines、caption、hook、note）。',
    ].join("\n");
}

/**
 * Splits a two-panel slide into two slides without asking the model: 上格 and 下格 become slides of their own; the
 * caption and the hook move to the second, which ends the moment.
 */
export function splitTwoPanelSlide(panel: ComicPanel, makeId: () => string): ComicPanel[] {
    if (!panel.sub) return [panel];
    const { sub, ...top } = panel;
    return [
        { ...top, id: makeId(), caption: undefined, hook: undefined },
        { ...sub, id: makeId(), beat: panel.beat, note: panel.note, caption: panel.caption, hook: panel.hook },
    ];
}

/** 笔记文案: the title, body and hashtags for posting the slides on 小红书. */
export const NOTE_INSTRUCTION = [
    "你是小红书运营，给一组原创漫画写发布用的笔记文案。",
    '只输出一个 JSON 对象，不要任何解释：{"title":"笔记标题，20 字以内，可以带 1 个 emoji","body":"正文 3–5 行，口语化，带 emoji，不剧透结局的反转，最后一行提一个问题引导评论","tags":["话题1","话题2","话题3","话题4","话题5"]}',
    "话题不带 #，选小红书上常见的词，必须和这个故事的角色、场景相符（固定带上「原创漫画」）。不要编造数据，不要夸大，不要提其他平台。",
].join("\n");

export function noteRequest(project: Pick<ComicProject, "title" | "panels" | "coverTitle">) {
    return [
        `漫画标题：${project.coverTitle || project.title}`,
        "分镜：",
        ...project.panels.map((panel, i) => `${i + 1}. ${panel.action}${panel.caption ? `（字幕：${panel.caption}）` : ""}${panel.lines.length ? `（${panel.lines.map((line) => `${line.speaker}：「${line.text}」`).join(" ")}）` : ""}`),
    ].join("\n");
}

export function parseNote(text: string): ComicNote {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("no json");
    const raw = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");
    const tags = (Array.isArray(raw.tags) ? raw.tags : [])
        .map((item) => str(item, 20).replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 10);
    const title = str(raw.title, 30);
    if (!title) throw new Error("no title");
    return { title, body: str(raw.body, 600), tags };
}

export type StoryInput = {
    idea: string;
    genre: ComicGenre;
    panelCount: number;
    previous?: ComicStory;
    change?: string;
    /** Characters to use as they are (我的角色, or the cast of a series). */
    cast?: Array<{ name: string; role?: string; look: string }>;
    /** 连载: the episode number and what happened in the episodes before. */
    episode?: number;
    previously?: string[];
    /** 小红书多图: a number of slides, or 0 to let the model choose 5–9; `cta` adds the 互动页. */
    format?: ComicFormat;
    cta?: boolean;
};

export function storyRequest(input: StoryInput) {
    const genre = COMIC_GENRES.find((item) => item.id === input.genre) || COMIC_GENRES[0];
    const beats = beatsFor(genre.id, input.panelCount);
    const lines: string[] = [];
    if (input.previously?.length) {
        lines.push(`这是一部连载漫画的第 ${input.episode || input.previously.length + 1} 话。前情提要：`, ...input.previously.map((item) => `- ${item}`));
        lines.push("接着往下讲一个新的小故事：和前面连贯（人物关系、发生过的事都算数），但这一话本身也要完整、有自己的笑点或结局，不要重复前面的梗。");
    }
    lines.push(`点子：${input.idea.trim() || (input.previously?.length ? "你来决定，顺着前面的故事自然发展" : "你来决定")}`);
    if (input.cast?.length) lines.push(`固定角色（名字和外貌原样使用，可以只用其中几个，需要时也可以加新角色）：${input.cast.map((item) => `${item.name}${item.role ? `（${item.role}）` : ""}：${item.look}`).join("；")}`);
    if (input.format === "slides") {
        const count = input.panelCount ? `一共 ${input.panelCount} 张` : "张数按故事长短来定，一般 5–9 张";
        lines.push(`类型：${GENRE_BRIEF[genre.id]}`, `${count}（包括封面${input.cta ? "和最后的互动页" : ""}）。第 1 张是封面${input.cta ? "，最后一张是互动页" : "，最后一张是结局"}。`);
    } else lines.push(`类型：${GENRE_BRIEF[genre.id]}`, `一共 ${input.panelCount} 格，每格的 beat 依次是：${beats.join("、")}。`);
    if (input.previous) {
        lines.push(`上一版分镜：${JSON.stringify(input.previous)}`);
        lines.push(`这次的修改要求：${input.change?.trim() || "换一种写法"}。没有要求改动的地方尽量保留，角色外貌不要变；输出完整的新 JSON。`);
    }
    return lines.join("\n");
}

/** One line about an episode for the next one's 前情提要: its title, what happens and what is said. */
export function episodeSummary(project: Pick<ComicProject, "title" | "panels" | "series">) {
    const text = project.panels.map((panel) => `${panel.action}${panel.lines.length ? `（${panel.lines.map((line) => `${line.speaker}：「${line.text}」`).join(" ")}）` : ""}`).join("；");
    const head = project.series ? `第 ${project.series.episode} 话《${project.title}》` : `《${project.title}》`;
    return `${head}：${text}`.slice(0, 360);
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

export type ComicStory = { title: string; characters: Array<{ name: string; role: string; look: string }>; panels: Array<Omit<ComicPanel, "id">>; coverTitles?: string[] };

const LINE_KINDS: ComicLineKind[] = ["speech", "thought", "shout", "narration"];

/** Reads the model's answer; tolerant of code fences, prose around the JSON and missing fields. */
/** `knownNames`: the cast already in the project (answers for one slide carry no character list). */
export function parseStory(text: string, panelCount: number, knownNames: string[] = []): ComicStory {
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
    const names = new Set([...characters.map((item) => item.name), ...knownNames]);
    const list = Array.isArray(raw.slides) ? raw.slides : Array.isArray(raw.panels) ? raw.panels : [];
    const panels = list
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
            ...(str(item.caption) ? { caption: str(item.caption, 40) } : {}),
            ...(str(item.hook) ? { hook: str(item.hook, 80) } : {}),
        }))
        .filter((panel) => panel.action)
        .slice(0, panelCount);
    if (!panels.length) throw new Error("no panels");
    const coverTitles = (Array.isArray(raw.coverTitles) ? raw.coverTitles : [])
        .map((item) => str(item, 30))
        .filter(Boolean)
        .slice(0, 3);
    return { title: str(raw.title, 20), characters, panels, ...(coverTitles.length ? { coverTitles } : {}) };
}

// ---------------------------------------------------------------------------------------------
// Prompts. Each panel prompt is built from labelled segments so the page can show beginners which part
// of the prompt does what (镜头 / 人物 / 动作 / 场景 / 画风 / 留白).

export type PromptSegmentKind = "shot" | "who" | "action" | "place" | "style" | "space";
export type PromptSegment = { kind: PromptSegmentKind; text: string };

export function panelSegments(panel: Pick<ComicPanel, "shot" | "action" | "place" | "characters" | "lines">, characters: ComicCharacter[], style: ComicStyleChoice, mode: ComicMode = "page"): PromptSegment[] {
    const who = panel.characters
        .map((name) => characters.find((item) => item.name === name))
        .filter((item): item is ComicCharacter => Boolean(item))
        .map((item) => `${item.name}（${item.look}）`);
    const segments: PromptSegment[] = [{ kind: "shot", text: panel.shot }];
    if (who.length) segments.push({ kind: "who", text: who.join("，") });
    segments.push({ kind: "action", text: panel.action });
    if (panel.place) segments.push({ kind: "place", text: panel.place });
    segments.push({ kind: "style", text: style.prompt });
    segments.push({ kind: "space", text: mode === "cells" ? cellSpaceInstruction(panel.lines) : spaceInstruction(panel.lines) });
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

/** 逐格: we letter the panel ourselves, so the art only leaves room for it. */
function cellSpaceInstruction(lines: ComicLine[]) {
    return lines.length ? "画面上方留出一些干净的空白放对白，不要画对话气泡，不要任何文字" : "不要画对话气泡，不要任何文字";
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

/** 逐格: one panel as its own image; the sheets of the characters in it are 图片1, 图片2… */
export function cellPrompt(project: Pick<ComicProject, "panels" | "characters" | "style">, panelIndex: number, sheetCharacters: ComicCharacter[], ratio: string) {
    const panel = project.panels[panelIndex];
    const [w, h] = ratio.split(":").map(Number);
    const shape = w > h ? "横版" : w < h ? "竖版" : "方形";
    const lines = [`一格漫画画面（一部 ${project.panels.length} 格漫画里的第 ${panelIndex + 1} 格），${shape}构图，画面铺满整张图。`, `画风：${project.style.prompt}。`];
    if (sheetCharacters.length)
        lines.push(`角色必须和参考图完全一致（脸型、毛色/发型、服装、配色都不能变）：${sheetCharacters.map((item, index) => `${item.name}是图片${index + 1}里的角色`).join("；")}。参考图只用来确定角色长相，不要照搬参考图的排版和背景。`);
    const segments = panelSegments(panel, project.characters, project.style, "cells").filter((segment) => segment.kind !== "style");
    lines.push(`画面：${segments.map((segment) => segment.text).join("，")}。`);
    lines.push("不要画漫画分格边框、对话气泡和旁白框，画面里不要出现任何文字、字母、数字、拟声字、签名和水印。");
    return lines.join("\n");
}

/** 小红书多图: one slide as a vertical image; the cover and the 互动页 leave room for big text. */
export function slidePrompt(project: Pick<ComicProject, "panels" | "characters" | "style">, panelIndex: number, sheetCharacters: ComicCharacter[]) {
    const panel = project.panels[panelIndex];
    const lines = [`一张竖版漫画插图（一组 ${project.panels.length} 张小红书多图漫画里的第 ${panelIndex + 1} 张），画面铺满整张图，主体在中间偏下。`, `画风：${project.style.prompt}。整组图画风统一。`];
    if (sheetCharacters.length)
        lines.push(`角色必须和参考图完全一致（脸型、毛色/发型、服装、配色都不能变）：${sheetCharacters.map((item, index) => `${item.name}是图片${index + 1}里的角色`).join("；")}。参考图只用来确定角色长相，不要照搬参考图的排版和背景。`);
    const scene = (item: ComicSubPanel) =>
        panelSegments(item, project.characters, project.style, "cells")
            .filter((segment) => segment.kind !== "style" && segment.kind !== "space")
            .map((segment) => segment.text)
            .join("，");
    if (panel.sub) {
        lines[0] = `一张竖版漫画（一组 ${project.panels.length} 张小红书多图漫画里的第 ${panelIndex + 1} 张），上下两格，两格一样大，中间是细黑边框和白色间隔，画面上下各留一点白边。`;
        lines.push(`上格：${scene(panel)}。`, `下格：${scene(panel.sub)}。`);
        lines.push(`每一格上方留出一些干净的空白放对白${panel.caption ? "；整张图底部 12% 不要放重要内容（会盖上字幕条）" : ""}。`);
        lines.push("不要画对话气泡和字幕框，画面里不要出现任何文字、字母、数字、拟声字、签名和水印。");
        return lines.join("\n");
    }
    lines.push(`画面：${scene(panel)}。`);
    if (panel.beat === "封面") lines.push("这是封面：主角特写、表情夸张，有速度线或闪光点缀；画面上方 35% 是干净的纯色背景，留给大标题。");
    else if (panel.beat === "互动") lines.push("角色在画面下半部分，面向读者；画面上半部分是干净的浅色背景，留给文字。");
    else lines.push(`画面上方留出一些干净的空白放对白${panel.caption ? "，底部 12% 不要放重要内容（会盖上字幕条）" : ""}。`);
    lines.push("不要画分格边框、对话气泡和字幕框，画面里不要出现任何文字、字母、数字、拟声字、签名和水印。");
    return lines.join("\n");
}

/** 逐格: changing one panel image (图片1), with the sheets after it. */
export function cellEditPrompt(instruction: string, sheetCharacters: ComicCharacter[], panelText: string) {
    const refs = sheetCharacters.map((item, index) => `图片${index + 2}是${item.name}的设定图`).join("，");
    return [
        "图片1是一格漫画画面。按下面的要求修改它，没有提到的地方（构图、角色、画风、配色）尽量保持不变，输出同样比例的完整画面。",
        `这一格的分镜：${panelText}。`,
        `修改要求：${instruction.trim()}。`,
        refs ? `角色长相要和设定图一致（${refs}）。` : "",
        "不要画对话气泡，画面里不要出现任何文字。",
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
// Lettering text layout (balloons and scenes are in comic-layout.ts).

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

/** Every stored image a project refers to. */
export function comicImages(project: ComicProject): ComicImage[] {
    return [
        ...project.characters.flatMap((character) => [...character.sheets, ...(character.photo ? [character.photo] : [])]),
        ...project.pages.map((page) => page.image),
        ...Object.values(project.cells || {}).flatMap((cell) => cell.versions.map((version) => version.image)),
    ];
}

/** Image keys of a project that nothing else uses: episodes of a series and 我的角色 share design sheets. */
export function keysToDelete(project: ComicProject, others: ComicProject[], libraryImages: ComicImage[]) {
    const keep = new Set([...others.flatMap(comicImages), ...libraryImages].map((image) => image.storageKey).filter(Boolean));
    return [...new Set(comicImages(project).map((image) => image.storageKey))].filter((key): key is string => Boolean(key) && !keep.has(key));
}

// ---------------------------------------------------------------------------------------------
// Cloud sync: comics and 我的角色 merge by id, newest edit wins, and a deletion wins over older edits.

export type ComicTombstone = { id: string; deletedAt: number };
/** `library` holds 我的角色 entries (pages/comic/comic-library); only id and updatedAt matter here. */
export type ComicSyncData = { projects: ComicProject[]; deleted: ComicTombstone[]; library: Array<{ id: string; updatedAt: number }>; libraryDeleted: ComicTombstone[] };

function mergeKeyed<T extends { id: string; updatedAt: number }>(local: T[], remote: T[], localDeleted: ComicTombstone[], remoteDeleted: ComicTombstone[]) {
    const deletedAt = new Map<string, number>();
    for (const item of [...remoteDeleted, ...localDeleted]) if (item.id && (deletedAt.get(item.id) || 0) < item.deletedAt) deletedAt.set(item.id, item.deletedAt);
    const byId = new Map<string, T>();
    for (const item of [...remote, ...local]) {
        const current = byId.get(item.id);
        if (!current || item.updatedAt >= current.updatedAt) byId.set(item.id, item);
    }
    const items = [...byId.values()].filter((item) => {
        const at = deletedAt.get(item.id);
        if (at === undefined) return true;
        // Edited after it was deleted elsewhere: the edit wins and the tombstone goes.
        if (item.updatedAt > at) {
            deletedAt.delete(item.id);
            return true;
        }
        return false;
    });
    return { items: items.sort((a, b) => b.updatedAt - a.updatedAt), deleted: [...deletedAt.entries()].map(([id, at]) => ({ id, deletedAt: at })) };
}

export function mergeComicData(local: ComicSyncData, remote: ComicSyncData): ComicSyncData {
    const projects = mergeKeyed(local.projects || [], remote.projects || [], local.deleted || [], remote.deleted || []);
    const library = mergeKeyed(local.library || [], remote.library || [], local.libraryDeleted || [], remote.libraryDeleted || []);
    return { projects: projects.items, deleted: projects.deleted, library: library.items, libraryDeleted: library.deleted };
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
