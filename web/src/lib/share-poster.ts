// Share poster for a work: cover, title, author, prompt excerpt and a QR code to the work page.
// Chat apps that don't preview links (WeChat) get an image people can save and forward.

import QRCode from "qrcode";

export type PosterInput = {
    cover: ImageBitmap | HTMLImageElement | HTMLCanvasElement;
    title: string;
    author: string;
    prompt?: string;
    url: string;
    siteName: string;
    aiLabel: string;
    scanHint: string;
};

const WIDTH = 1080;
const PAD = 64;
const INNER = WIDTH - PAD * 2;
const FONT = '"PingFang SC", "HarmonyOS Sans SC", "Microsoft YaHei", system-ui, sans-serif';

/** Splits text into at most maxLines lines that fit width (character-wise, so CJK wraps too). */
export function wrapText(measure: (text: string) => number, text: string, width: number, maxLines: number): string[] {
    const lines: string[] = [];
    let line = "";
    const chars = Array.from(text.replace(/\s+/g, " ").trim());
    for (let i = 0; i < chars.length; i++) {
        const next = line + chars[i];
        if (measure(next) <= width) {
            line = next;
            continue;
        }
        lines.push(line);
        line = chars[i] === " " ? "" : chars[i];
        if (lines.length === maxLines) {
            // Out of room: end the last line with an ellipsis.
            let last = lines[maxLines - 1];
            while (last && measure(`${last}…`) > width) last = Array.from(last).slice(0, -1).join("");
            lines[maxLines - 1] = `${last}…`;
            return lines;
        }
    }
    if (line) lines.push(line);
    return lines.slice(0, maxLines);
}

/** Cover height on the poster: the image's aspect within limits. */
export function posterCoverHeight(width: number, height: number): number {
    if (!width || !height) return INNER;
    return Math.round(Math.min(1.35, Math.max(0.5, height / width)) * INNER);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

export async function drawSharePoster(input: PosterInput): Promise<Blob> {
    const measureCanvas = document.createElement("canvas").getContext("2d")!;
    const measure = (font: string) => (text: string) => {
        measureCanvas.font = font;
        return measureCanvas.measureText(text).width;
    };
    const titleFont = `600 52px ${FONT}`;
    const bodyFont = `400 30px ${FONT}`;
    const coverW = "width" in input.cover ? input.cover.width : INNER;
    const coverH = "height" in input.cover ? input.cover.height : INNER;
    const coverHeight = posterCoverHeight(coverW, coverH);
    const titleLines = wrapText(measure(titleFont), input.title, INNER, 2);
    const promptLines = input.prompt ? wrapText(measure(bodyFont), input.prompt, INNER, 3) : [];
    const qrSize = 200;

    let height = PAD + coverHeight + 48 + titleLines.length * 66 + 16 + 40;
    if (promptLines.length) height += 24 + promptLines.length * 44;
    height += 48 + qrSize + PAD;

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, height);

    // Cover, centre-cropped into a rounded box.
    ctx.save();
    roundRect(ctx, PAD, PAD, INNER, coverHeight, 28);
    ctx.clip();
    const scale = Math.max(INNER / coverW, coverHeight / coverH);
    const dw = coverW * scale;
    const dh = coverH * scale;
    ctx.drawImage(input.cover, PAD + (INNER - dw) / 2, PAD + (coverHeight - dh) / 2, dw, dh);
    ctx.restore();

    // "AI 生成" label on the cover.
    ctx.font = `600 26px ${FONT}`;
    const labelW = ctx.measureText(input.aiLabel).width + 28;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    roundRect(ctx, PAD + 20, PAD + 20, labelW, 44, 10);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(input.aiLabel, PAD + 34, PAD + 42);

    let y = PAD + coverHeight + 48;
    ctx.textBaseline = "top";
    ctx.fillStyle = "#1c1917";
    ctx.font = titleFont;
    for (const line of titleLines) {
        ctx.fillText(line, PAD, y);
        y += 66;
    }
    y += 16;
    ctx.font = `500 32px ${FONT}`;
    ctx.fillStyle = "#7c3aed";
    ctx.fillText(input.author, PAD, y);
    y += 40;
    if (promptLines.length) {
        y += 24;
        ctx.font = bodyFont;
        ctx.fillStyle = "#57534e";
        for (const line of promptLines) {
            ctx.fillText(line, PAD, y);
            y += 44;
        }
    }

    // Footer: site name, hint and the QR code.
    y += 48;
    ctx.strokeStyle = "#e7e5e4";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD, y - 24);
    ctx.lineTo(WIDTH - PAD, y - 24);
    ctx.stroke();
    const qr = document.createElement("canvas");
    await QRCode.toCanvas(qr, input.url, { margin: 1, width: qrSize, color: { dark: "#1c1917", light: "#ffffff" } });
    ctx.drawImage(qr, WIDTH - PAD - qrSize, y, qrSize, qrSize);
    ctx.fillStyle = "#1c1917";
    ctx.font = `600 40px ${FONT}`;
    ctx.fillText(input.siteName, PAD, y + 44);
    ctx.fillStyle = "#78716c";
    ctx.font = `400 28px ${FONT}`;
    for (const [i, line] of wrapText(measure(`400 28px ${FONT}`), input.scanHint, INNER - qrSize - 40, 2).entries()) {
        ctx.fillText(line, PAD, y + 110 + i * 40);
    }

    // JPEG on a white background: a fraction of the PNG size, easier to send in chat apps.
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) throw new Error("poster export failed");
    return blob;
}
