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
};

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

export function drawTextLayers(ctx: CanvasRenderingContext2D, layers: TextLayer[], imageW: number, imageH: number) {
    for (const layer of layers) {
        if (!layer.text.trim()) continue;
        const layout = layoutLayer(layer, imageW, imageH, canvasMeasure(ctx, layer));
        ctx.save();
        ctx.globalAlpha = Math.min(1, Math.max(0, layer.opacity));
        ctx.font = `${layout.fontPx}px ${fontFamilyOf(layer.font)}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

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
            for (const g of layout.glyphs) ctx.fillText(g.ch, g.x, g.y);
            ctx.restore();
            continue;
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
            for (const g of layout.glyphs) ctx.strokeText(g.ch, g.x, g.y);
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
        for (const g of layout.glyphs) ctx.fillText(g.ch, g.x, g.y);
        ctx.restore();
    }
}

/** Index of the top-most layer whose box contains the point (image pixels), or -1. */
export function hitTestLayers(ctx: CanvasRenderingContext2D, layers: TextLayer[], imageW: number, imageH: number, px: number, py: number): number {
    for (let i = layers.length - 1; i >= 0; i--) {
        const { box } = layoutLayer(layers[i], imageW, imageH, canvasMeasure(ctx, layers[i]));
        const pad = Math.max(6, Math.min(imageW, imageH) * 0.01);
        if (px >= box.x - pad && px <= box.x + box.w + pad && py >= box.y - pad && py <= box.y + box.h + pad) return i;
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
