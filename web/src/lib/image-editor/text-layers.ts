/**
 * Text and seal layers drawn on top of an image (image editor 「文字」 tab).
 *
 * Image models misspell text, so the editor lets people repaint the area clean and set real text
 * here instead. Positions and sizes are fractions of the image, so the same layers draw on the
 * downsampled preview and on the full-resolution export.
 */

export type TextFontId = "ma-shan-zheng" | "zhi-mang-xing" | "long-cang" | "zcool-xiaowei" | "noto-serif-sc" | "lxgw-wenkai" | "zcool-qingke-huangyou" | "system-sans";

export type TextFont = { id: TextFontId; family: string; /** Hosted in /fonts/fonts.css; system fonts need no download. */ webfont: boolean };

export const TEXT_FONTS: TextFont[] = [
    { id: "ma-shan-zheng", family: "Ma Shan Zheng", webfont: true },
    { id: "zhi-mang-xing", family: "Zhi Mang Xing", webfont: true },
    { id: "long-cang", family: "Long Cang", webfont: true },
    { id: "noto-serif-sc", family: "Noto Serif SC", webfont: true },
    { id: "lxgw-wenkai", family: "LXGW WenKai", webfont: true },
    { id: "zcool-xiaowei", family: "ZCOOL XiaoWei", webfont: true },
    { id: "zcool-qingke-huangyou", family: "ZCOOL QingKe HuangYou", webfont: true },
    { id: "system-sans", family: "PingFang SC", webfont: false },
];

const FALLBACK_FAMILIES = `"Kaiti SC", STKaiti, KaiTi, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", serif`;

export function fontFamilyOf(id: TextFontId): string {
    const font = TEXT_FONTS.find((f) => f.id === id) || TEXT_FONTS[0];
    return `"${font.family}", ${FALLBACK_FAMILIES}`;
}

export type TextEffect = "none" | "shadow" | "stroke";
export type SealStyle = "white" | "red";

export type TextLayer = {
    id: string;
    kind: "text" | "seal";
    text: string;
    /** Top-left corner of the block, as a fraction of the image width / height. */
    x: number;
    y: number;
    /** Font size as a fraction of the image width. */
    size: number;
    font: TextFontId;
    color: string;
    vertical: boolean;
    /** Extra space between characters, in em. */
    letterSpacing: number;
    /** Gap between lines (or columns), in em. */
    lineSpacing: number;
    /** Characters per line / column before wrapping; 0 = only at line breaks. */
    wrapAt: number;
    align: "start" | "center" | "end";
    effect: TextEffect;
    effectColor: string;
    opacity: number;
    /** Seals only: 白文 (light text on a red block) or 朱文 (red text in a red frame). */
    sealStyle: SealStyle;
    /** Vertical text only: thin rules between and beside the columns, like ruled paper (诗画). */
    rules?: boolean;
    /** Clockwise rotation in degrees around the centre of the block. */
    rotation?: number;
    /** How the text mixes with the picture: multiply makes ink read as printed on the paper. */
    blend?: TextBlend;
    /** 飞白 / dry brush, 0–1: thin gaps along the strokes and specks, as if the brush ran dry. */
    texture?: number;
    /** 自然变化, 0–1: each character a little bigger or smaller, turned and off its line, like handwriting. */
    jitter?: number;
    /** Changes the brush marks and the variation (same seed → same result). */
    seed?: number;
};

export type TextBlend = "normal" | "multiply" | "screen" | "overlay" | "soft-light";

export const SEAL_RED = "#b3302a";

let layerSeq = 0;
function newId(): string {
    layerSeq += 1;
    return `t${Date.now().toString(36)}${layerSeq}`;
}

export function createTextLayer(patch: Partial<TextLayer> = {}): TextLayer {
    return {
        id: newId(),
        kind: "text",
        text: "",
        x: 0.08,
        y: 0.06,
        size: 0.06,
        font: "ma-shan-zheng",
        color: "#ffffff",
        vertical: false,
        letterSpacing: 0.05,
        lineSpacing: 0.35,
        wrapAt: 0,
        align: "start",
        effect: "shadow",
        effectColor: "#000000",
        opacity: 1,
        sealStyle: "white",
        ...patch,
    };
}

export function createSealLayer(patch: Partial<TextLayer> = {}): TextLayer {
    return createTextLayer({ kind: "seal", text: "", size: 0.03, font: "ma-shan-zheng", color: "#fbe9dc", effect: "none", letterSpacing: 0, lineSpacing: 0, sealStyle: "white", x: 0.12, y: 0.3, ...patch });
}

/** A ready-made 古诗词 layout: vertical title, vertical body to its right, author seal. */
export function poemTemplate(title: string, body: string, author: string): TextLayer[] {
    return [
        createTextLayer({ text: title, font: "zhi-mang-xing", vertical: true, size: 0.11, x: 0.05, y: 0.03, color: "#f4ecd8", letterSpacing: 0.08, effect: "shadow", effectColor: "#0a1824" }),
        createTextLayer({ text: body, font: "ma-shan-zheng", vertical: true, size: 0.024, x: 0.26, y: 0.035, color: "#f2e9d4", letterSpacing: 0.18, lineSpacing: 0.45, wrapAt: 0, effect: "shadow", effectColor: "#08141e" }),
        createSealLayer({ text: author, x: 0.175, y: 0.2 }),
    ];
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Punctuation that has a dedicated vertical form (CJK Vertical Forms / Compatibility Forms). */
const VERTICAL_FORMS: Record<string, string> = {
    "，": "︐",
    "。": "︒",
    "、": "︑",
    "：": "︓",
    "；": "︔",
    "！": "︕",
    "？": "︖",
    "「": "﹁",
    "」": "﹂",
    "『": "﹃",
    "』": "﹄",
    "《": "︽",
    "》": "︾",
    "〈": "︿",
    "〉": "﹀",
    "（": "︵",
    "）": "︶",
    "(": "︵",
    ")": "︶",
    "【": "︻",
    "】": "︼",
    "〔": "︹",
    "〕": "︺",
    "…": "︙",
    "—": "︱",
    "-": "︱",
    ",": "︐",
    ".": "︒",
};

export function verticalForm(ch: string): string {
    return VERTICAL_FORMS[ch] || ch;
}

/** Splits text into lines (columns when vertical): explicit line breaks first, then every `wrapAt` characters. */
export function splitLines(text: string, wrapAt: number): string[][] {
    const lines: string[][] = [];
    for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
        const chars = Array.from(raw);
        if (wrapAt > 0 && chars.length > wrapAt) {
            for (let i = 0; i < chars.length; i += wrapAt) lines.push(chars.slice(i, i + wrapAt));
        } else {
            lines.push(chars);
        }
    }
    // Drop trailing empty lines so a stray Enter doesn't add an invisible column.
    while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
    return lines;
}

export type Glyph = { ch: string; x: number; y: number };
export type LayerLayout = {
    glyphs: Glyph[];
    box: { x: number; y: number; w: number; h: number };
    fontPx: number;
    seal?: { x: number; y: number; w: number; h: number; radius: number; border: number };
    /** x of each column rule (vertical text with rules), from top to the bottom of the block. */
    rules?: number[];
};

/** Width of one character at the given pixel size; the canvas measures it, tests pass a stub. */
export type MeasureChar = (ch: string, fontPx: number) => number;

/**
 * Glyph centres (x, y) in image pixels. Text is drawn with textAlign=center / textBaseline=middle at
 * each centre, so horizontal and vertical layouts use the same drawing code.
 */
export function layoutLayer(layer: TextLayer, imageW: number, imageH: number, measure: MeasureChar): LayerLayout {
    const fontPx = Math.max(4, layer.size * imageW);
    const left = layer.x * imageW;
    const top = layer.y * imageH;

    if (layer.kind === "seal") return layoutSeal(layer, left, top, fontPx);

    const lines = splitLines(layer.text, layer.wrapAt);
    const glyphs: Glyph[] = [];
    const step = fontPx * (1 + layer.letterSpacing);
    const lineStep = fontPx * (1 + layer.lineSpacing);

    if (layer.vertical) {
        const longest = Math.max(0, ...lines.map((l) => l.length));
        const blockH = longest > 0 ? longest * step - fontPx * layer.letterSpacing : fontPx;
        const blockW = lines.length > 0 ? (lines.length - 1) * lineStep + fontPx : fontPx;
        // Columns run right to left; column 0 sits at the right edge of the block.
        lines.forEach((line, col) => {
            const colH = line.length > 0 ? line.length * step - fontPx * layer.letterSpacing : 0;
            const offset = layer.align === "center" ? (blockH - colH) / 2 : layer.align === "end" ? blockH - colH : 0;
            const cx = left + blockW - fontPx / 2 - col * lineStep;
            line.forEach((ch, i) => glyphs.push({ ch: verticalForm(ch), x: cx, y: top + offset + i * step + fontPx / 2 }));
        });
        // Rules halfway between columns, and one beside each outer column.
        const rules = layer.rules && lines.length ? Array.from({ length: lines.length + 1 }, (_, i) => left + blockW + (lineStep - fontPx) / 2 - i * lineStep) : undefined;
        return { glyphs, box: { x: left, y: top, w: blockW, h: blockH }, fontPx, ...(rules ? { rules } : {}) };
    }

    const spacing = fontPx * layer.letterSpacing;
    const widths = lines.map((line) => line.map((ch) => measure(ch, fontPx)));
    const lineW = widths.map((w) => (w.length > 0 ? w.reduce((a, b) => a + b, 0) + spacing * (w.length - 1) : 0));
    const blockW = Math.max(fontPx, ...lineW);
    const blockH = lines.length > 0 ? (lines.length - 1) * lineStep + fontPx : fontPx;
    lines.forEach((line, row) => {
        const offset = layer.align === "center" ? (blockW - lineW[row]) / 2 : layer.align === "end" ? blockW - lineW[row] : 0;
        let x = left + offset;
        line.forEach((ch, i) => {
            const w = widths[row][i];
            glyphs.push({ ch, x: x + w / 2, y: top + row * lineStep + fontPx / 2 });
            x += w + spacing;
        });
    });
    return { glyphs, box: { x: left, y: top, w: blockW, h: blockH }, fontPx };
}

/**
 * Seal characters read like a real seal: one column for up to 2 characters, otherwise two columns
 * right to left (top-to-bottom within each).
 */
function layoutSeal(layer: TextLayer, left: number, top: number, fontPx: number): LayerLayout {
    const chars = Array.from(layer.text.replace(/\s+/g, "")).slice(0, 4);
    const cols = chars.length <= 2 ? 1 : 2;
    const perCol = Math.max(1, Math.ceil(chars.length / cols));
    const cell = fontPx * 1.08;
    const pad = fontPx * 0.32;
    const w = cols * cell + pad * 2;
    const h = perCol * cell + pad * 2;
    const glyphs: Glyph[] = chars.map((ch, i) => {
        const col = Math.floor(i / perCol);
        const row = i % perCol;
        return { ch, x: left + w - pad - cell / 2 - col * cell, y: top + pad + cell / 2 + row * cell };
    });
    const seal = { x: left, y: top, w, h, radius: fontPx * 0.18, border: Math.max(1, fontPx * 0.09) };
    return { glyphs, box: { x: left, y: top, w, h }, fontPx, seal };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

function roundRect(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function hexAlpha(hex: string, alpha: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function canvasMeasure(ctx: CanvasRenderingContext2D, layer: TextLayer): MeasureChar {
    return (ch, fontPx) => {
        ctx.font = `${fontPx}px ${fontFamilyOf(layer.font)}`;
        return ctx.measureText(ch).width;
    };
}

// ---------------------------------------------------------------------------
// Texture and variation (deterministic per layer)
// ---------------------------------------------------------------------------

function hashString(text: string): number {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** mulberry32: a small seeded random generator, 0 ≤ x < 1. */
export function seededRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function layerSeed(layer: Pick<TextLayer, "id" | "seed">): number {
    return hashString(`${layer.id}:${layer.seed ?? 0}`);
}

export type GlyphJitter = { scale: number; angle: number; dx: number; dy: number };

/** Per-character variation: ±4 % size, ±2° turn, ±3 % of the size off the line, all times strength. */
export function glyphJitters(seed: number, count: number, strength: number): GlyphJitter[] {
    const rand = seededRandom(seed ^ 0x9e3779b9);
    const k = Math.min(1, Math.max(0, strength));
    return Array.from({ length: count }, () => {
        const r = () => rand() * 2 - 1;
        return { scale: 1 + r() * 0.04 * k, angle: r() * 2 * k, dx: r() * 0.03 * k, dy: r() * 0.03 * k };
    });
}

export type TextureMark = { kind: "streak"; x: number; y: number; length: number; width: number; angle: number; alpha: number } | { kind: "speck"; x: number; y: number; r: number; alpha: number };

/**
 * 飞白 marks inside a block (pixels): streaks along the main stroke directions (near-horizontal rising strokes and
 * near-vertical ones) where the dry brush leaves paper showing, plus small specks. Erased from the text.
 */
export function textureMarks(seed: number, box: { x: number; y: number; w: number; h: number }, fontPx: number, strength: number): TextureMark[] {
    const k = Math.min(1, Math.max(0, strength));
    if (k <= 0 || fontPx <= 0) return [];
    const rand = seededRandom(seed);
    const cells = Math.max(1, (box.w * box.h) / (fontPx * fontPx));
    const marks: TextureMark[] = [];
    // Groups of parallel hairlines (one dry stroke each), a little longer and fainter at random.
    const groups = Math.round(cells * 2.2 * k);
    for (let i = 0; i < groups; i++) {
        const vertical = rand() < 0.45;
        const angle = (vertical ? 88 : -8) + (rand() * 2 - 1) * 7;
        const rad = (angle * Math.PI) / 180;
        const nx = -Math.sin(rad);
        const ny = Math.cos(rad);
        const cx = box.x + rand() * box.w;
        const cy = box.y + rand() * box.h;
        const length = fontPx * (0.25 + rand() * 0.5);
        const lines = 3 + Math.floor(rand() * 5);
        const gap = fontPx * (0.022 + rand() * 0.02);
        for (let l = 0; l < lines; l++) {
            const off = (l - (lines - 1) / 2) * gap;
            const along = (rand() * 2 - 1) * length * 0.2;
            marks.push({
                kind: "streak",
                x: cx + nx * off + Math.cos(rad) * along,
                y: cy + ny * off + Math.sin(rad) * along,
                length: length * (0.45 + rand() * 0.55),
                width: fontPx * (0.006 + rand() * 0.012) * (0.7 + k * 0.6),
                angle: angle + (rand() * 2 - 1) * 1.5,
                alpha: 0.6 + rand() * 0.4,
            });
        }
    }
    const specks = Math.round(cells * 28 * k);
    for (let i = 0; i < specks; i++) {
        marks.push({ kind: "speck", x: box.x + rand() * box.w, y: box.y + rand() * box.h, r: fontPx * (0.003 + rand() * 0.009), alpha: 0.3 + rand() * 0.5 });
    }
    return marks;
}

function makeCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null {
    if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
    if (typeof document === "undefined") return null;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function rotateAround(ctx: Ctx2D, layer: TextLayer, box: LayerLayout["box"]) {
    if (!layer.rotation) return;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
}

/** Calls draw for each glyph, with its natural variation applied (the same in painting and in the 飞白). */
function eachGlyph(ctx: Ctx2D, layer: TextLayer, layout: LayerLayout, draw: (ch: string, x: number, y: number) => void) {
    const jitters = layer.jitter ? glyphJitters(layerSeed(layer), layout.glyphs.length, layer.kind === "seal" ? layer.jitter * 0.4 : layer.jitter) : null;
    layout.glyphs.forEach((g, i) => {
        const j = jitters?.[i];
        if (!j) {
            draw(g.ch, g.x, g.y);
            return;
        }
        ctx.save();
        ctx.translate(g.x + j.dx * layout.fontPx, g.y + j.dy * layout.fontPx);
        ctx.rotate((j.angle * Math.PI) / 180);
        ctx.scale(j.scale, j.scale);
        draw(g.ch, 0, 0);
        ctx.restore();
    });
}

/** Draws one layer's seal / rules / glyphs (in the current transform, at full opacity). */
function paintLayer(ctx: Ctx2D, layer: TextLayer, layout: LayerLayout) {
    ctx.font = `${layout.fontPx}px ${fontFamilyOf(layer.font)}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const glyphs = (draw: (ch: string, x: number, y: number) => void) => eachGlyph(ctx, layer, layout, draw);

    if (layout.seal) {
        const s = layout.seal;
        if (layer.sealStyle === "white") {
            ctx.fillStyle = SEAL_RED;
            roundRect(ctx, s.x, s.y, s.w, s.h, s.radius);
            ctx.fill();
            ctx.fillStyle = layer.color || "#fbe9dc";
        } else {
            ctx.strokeStyle = SEAL_RED;
            ctx.lineWidth = s.border;
            roundRect(ctx, s.x + s.border / 2, s.y + s.border / 2, s.w - s.border, s.h - s.border, s.radius);
            ctx.stroke();
            ctx.fillStyle = SEAL_RED;
        }
        glyphs((ch, x, y) => ctx.fillText(ch, x, y));
        return;
    }

    if (layer.effect === "shadow") {
        ctx.shadowColor = hexAlpha(layer.effectColor, 0.6);
        ctx.shadowBlur = layout.fontPx * 0.18;
        ctx.shadowOffsetY = layout.fontPx * 0.04;
    }
    if (layer.effect === "stroke") {
        ctx.strokeStyle = layer.effectColor;
        ctx.lineWidth = Math.max(1, layout.fontPx * 0.09);
        ctx.lineJoin = "round";
        glyphs((ch, x, y) => ctx.strokeText(ch, x, y));
    }
    if (layout.rules) {
        ctx.save();
        ctx.shadowColor = "transparent";
        ctx.strokeStyle = hexAlpha(layer.color, 0.45);
        ctx.lineWidth = Math.max(1, layout.fontPx * 0.035);
        const y0 = layout.box.y - layout.fontPx * 0.35;
        const y1 = layout.box.y + layout.box.h + layout.fontPx * 0.35;
        for (const x of layout.rules) {
            ctx.beginPath();
            ctx.moveTo(x, y0);
            ctx.lineTo(x, y1);
            ctx.stroke();
        }
        ctx.restore();
    }
    ctx.fillStyle = layer.color;
    glyphs((ch, x, y) => ctx.fillText(ch, x, y));
}

function eraseTexture(ctx: Ctx2D, layer: TextLayer, layout: LayerLayout) {
    const margin = layout.fontPx * 0.4;
    const box = { x: layout.box.x - margin, y: layout.box.y - margin, w: layout.box.w + margin * 2, h: layout.box.h + margin * 2 };
    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.shadowColor = "transparent";
    // Seals take only specks (印泥 that didn't print), lighter.
    const strength = layer.kind === "seal" ? (layer.texture ?? 0) * 0.6 : layer.texture ?? 0;
    if (layer.kind !== "seal" && strength > 0) {
        // Broken, ragged stroke edges: the outline erased in random dashes.
        const rand = seededRandom(layerSeed(layer) ^ 0x51ed27);
        ctx.font = `${layout.fontPx}px ${fontFamilyOf(layer.font)}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = layout.fontPx * (0.008 + 0.018 * strength);
        ctx.lineJoin = "round";
        ctx.globalAlpha = 0.35 + 0.35 * strength;
        eachGlyph(ctx, layer, layout, (ch, x, y) => {
            // Short bites with long untouched stretches between them.
            ctx.setLineDash(Array.from({ length: 8 }, (_, i) => layout.fontPx * (i % 2 ? 0.08 + rand() * 0.3 : 0.01 + rand() * 0.04)));
            ctx.lineDashOffset = rand() * layout.fontPx;
            ctx.strokeText(ch, x, y);
        });
        ctx.setLineDash([]);
    }
    for (const m of textureMarks(layerSeed(layer), box, layout.fontPx, strength)) {
        if (m.kind === "streak" && layer.kind === "seal") continue;
        ctx.globalAlpha = m.alpha;
        if (m.kind === "speck") {
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
            ctx.fill();
        } else {
            const a = (m.angle * Math.PI) / 180;
            const dx = (Math.cos(a) * m.length) / 2;
            const dy = (Math.sin(a) * m.length) / 2;
            ctx.lineWidth = m.width;
            ctx.beginPath();
            ctx.moveTo(m.x - dx, m.y - dy);
            ctx.lineTo(m.x + dx, m.y + dy);
            ctx.stroke();
        }
    }
    ctx.restore();
}

export function drawTextLayers(ctx: CanvasRenderingContext2D, layers: TextLayer[], imageW: number, imageH: number) {
    for (const layer of layers) {
        if (!layer.text.trim()) continue;
        const layout = layoutLayer(layer, imageW, imageH, canvasMeasure(ctx, layer));
        const alpha = Math.min(1, Math.max(0, layer.opacity));
        const blend = layer.blend && layer.blend !== "normal" ? layer.blend : null;

        if ((layer.texture ?? 0) > 0) {
            // Drawn on its own canvas around the block, the 飞白 erased there, then laid on the picture.
            const pad = layout.fontPx * 1.2;
            const half = Math.hypot(layout.box.w, layout.box.h) / 2 + pad;
            const cx = layout.box.x + layout.box.w / 2;
            const cy = layout.box.y + layout.box.h / 2;
            const x0 = Math.max(0, Math.floor(cx - half));
            const y0 = Math.max(0, Math.floor(cy - half));
            const x1 = Math.min(imageW, Math.ceil(cx + half));
            const y1 = Math.min(imageH, Math.ceil(cy + half));
            const off = x1 > x0 && y1 > y0 ? makeCanvas(x1 - x0, y1 - y0) : null;
            const octx = off?.getContext("2d") as Ctx2D | null | undefined;
            if (off && octx) {
                octx.translate(-x0, -y0);
                rotateAround(octx, layer, layout.box);
                paintLayer(octx, layer, layout);
                eraseTexture(octx, layer, layout);
                ctx.save();
                ctx.globalAlpha = alpha;
                if (blend) ctx.globalCompositeOperation = blend;
                ctx.drawImage(off as CanvasImageSource, x0, y0);
                ctx.restore();
                continue;
            }
        }

        ctx.save();
        rotateAround(ctx, layer, layout.box);
        ctx.globalAlpha = alpha;
        if (blend) ctx.globalCompositeOperation = blend;
        paintLayer(ctx, layer, layout);
        ctx.restore();
    }
}

/** The point in the layer's own (unrotated) frame. */
export function unrotate(layer: Pick<TextLayer, "rotation">, box: LayerLayout["box"], px: number, py: number): [number, number] {
    if (!layer.rotation) return [px, py];
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const a = (-layer.rotation * Math.PI) / 180;
    const dx = px - cx;
    const dy = py - cy;
    return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** Index of the top-most layer whose box contains the point (image pixels), or -1. */
export function hitTestLayers(ctx: CanvasRenderingContext2D, layers: TextLayer[], imageW: number, imageH: number, px: number, py: number): number {
    for (let i = layers.length - 1; i >= 0; i--) {
        const { box } = layoutLayer(layers[i], imageW, imageH, canvasMeasure(ctx, layers[i]));
        const [x, y] = unrotate(layers[i], box, px, py);
        const pad = Math.max(6, Math.min(imageW, imageH) * 0.01);
        if (x >= box.x - pad && x <= box.x + box.w + pad && y >= box.y - pad && y <= box.y + box.h + pad) return i;
    }
    return -1;
}

// ---------------------------------------------------------------------------
// Fonts
// ---------------------------------------------------------------------------

let fontsCssPromise: Promise<void> | null = null;

/** Adds /fonts/fonts.css once (the @font-face rules); the browser fetches chunks only for characters in use. */
export function loadFontsCss(): Promise<void> {
    if (typeof document === "undefined") return Promise.resolve();
    if (fontsCssPromise) return fontsCssPromise;
    fontsCssPromise = new Promise<void>((resolve) => {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "/fonts/fonts.css";
        link.onload = () => resolve();
        link.onerror = () => resolve();
        document.head.appendChild(link);
    });
    return fontsCssPromise;
}

/** Waits until the chunks covering each layer's characters are loaded, so canvas drawing uses the real font. */
export async function ensureLayerFonts(layers: TextLayer[]): Promise<void> {
    if (typeof document === "undefined" || !document.fonts) return;
    await loadFontsCss();
    await Promise.all(
        layers.map((layer) => {
            const font = TEXT_FONTS.find((f) => f.id === layer.font);
            if (!font?.webfont || !layer.text.trim()) return Promise.resolve();
            const text = Array.from(layer.text).map(verticalForm).join("") + layer.text;
            return document.fonts.load(`32px "${font.family}"`, text).catch(() => []);
        }),
    );
}
