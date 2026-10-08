import { MAIN_SITE_URL } from "@/constant/runtime-config";

// The 「AI 生成 · hivegpt.cn」 mark drawn into images the workbench saves, downloads or shares.
// It is both the site's credit and the explicit AI-content label 《人工智能生成合成内容标识办法》 asks for;
// members of 创作会员 get the original instead (see useWatermarkFree).

function siteHost() {
    try {
        return new URL(MAIN_SITE_URL).host.replace(/^www\./, "");
    } catch {
        return "hivegpt.cn";
    }
}

export const WATERMARK_TEXT = `AI 生成 · ${siteHost()}`;

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("image load failed"));
        image.src = src;
    });
}

/** Draw the mark into the bottom-right corner; returns a PNG (or JPEG for JPEG sources) blob. */
export async function watermarkImage(src: string, mimeType = "image/png"): Promise<Blob> {
    const image = await loadImage(src);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    context.drawImage(image, 0, 0, width, height);

    const short = Math.min(width, height);
    const fontSize = Math.max(12, Math.round(short * 0.026));
    const padX = Math.round(fontSize * 0.55);
    const padY = Math.round(fontSize * 0.32);
    const margin = Math.round(short * 0.022);
    context.font = `500 ${fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    context.textBaseline = "middle";
    const textWidth = context.measureText(WATERMARK_TEXT).width;
    const boxWidth = textWidth + padX * 2;
    const boxHeight = fontSize + padY * 2;
    const x = width - margin - boxWidth;
    const y = height - margin - boxHeight;
    context.fillStyle = "rgba(0, 0, 0, 0.32)";
    context.beginPath();
    context.roundRect(x, y, boxWidth, boxHeight, Math.round(fontSize * 0.35));
    context.fill();
    context.fillStyle = "rgba(255, 255, 255, 0.94)";
    context.fillText(WATERMARK_TEXT, x + padX, y + boxHeight / 2 + 1);

    const type = mimeType === "image/jpeg" || mimeType === "image/webp" ? mimeType : "image/png";
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), type, 0.95));
}
