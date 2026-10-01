// Outpainting (扩图): the original is placed on a larger canvas whose blank border the image model fills in.

export type OutpaintAnchor = "start" | "center" | "end";
export type OutpaintPlan = {
    /** Canvas size, in source pixels. */
    width: number;
    height: number;
    /** Where the original sits on it. */
    x: number;
    y: number;
    /** Requested size for the model ("16:9"…), matching the canvas. */
    size: string;
};

/** Ratios the image models accept. */
export const OUTPAINT_RATIOS = ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16"] as const;
/** Fill of the blank area; named in the prompt. */
export const OUTPAINT_FILL = "#808080";
/** Long edge of the layout image sent to the model. */
const LAYOUT_MAX_EDGE = 2048;

function ratioValue(ratio: string) {
    const [w, h] = ratio.split(":").map(Number);
    return w > 0 && h > 0 ? w / h : 1;
}

export function nearestRatio(width: number, height: number) {
    const target = Math.log(width / height);
    return OUTPAINT_RATIOS.reduce((best, ratio) => (Math.abs(Math.log(ratioValue(ratio)) - target) < Math.abs(Math.log(ratioValue(best)) - target) ? ratio : best), OUTPAINT_RATIOS[0] as string);
}

/**
 * Canvas for an outpaint: at least `factor` times the original on both sides, widened or heightened to `ratio`
 * ("keep" = the standard ratio closest to the original). Returns null when nothing would be added.
 */
export function planOutpaint(width: number, height: number, ratio: string, factor: number, anchor: OutpaintAnchor): OutpaintPlan | null {
    const size = ratio === "keep" ? nearestRatio(width, height) : ratio;
    const r = ratioValue(size);
    const f = Math.max(1, factor);
    let canvasWidth = width * f;
    let canvasHeight = height * f;
    if (canvasWidth / canvasHeight < r) canvasWidth = canvasHeight * r;
    else canvasHeight = canvasWidth / r;
    canvasWidth = Math.round(canvasWidth);
    canvasHeight = Math.round(canvasHeight);
    // Less than 3% more on both sides is not worth a generation.
    if (canvasWidth < width * 1.03 && canvasHeight < height * 1.03) return null;
    const place = (free: number) => (anchor === "start" ? 0 : anchor === "end" ? free : Math.round(free / 2));
    return { width: canvasWidth, height: canvasHeight, x: place(canvasWidth - width), y: place(canvasHeight - height), size };
}

/** The layout image: the original on the larger canvas, the new area flat grey. PNG data URL. */
export async function buildOutpaintImage(src: string, plan: OutpaintPlan): Promise<string> {
    const image = await loadImage(src);
    const scale = Math.min(1, LAYOUT_MAX_EDGE / Math.max(plan.width, plan.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(plan.width * scale);
    canvas.height = Math.round(plan.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.fillStyle = OUTPAINT_FILL;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, Math.round(plan.x * scale), Math.round(plan.y * scale), Math.round(image.naturalWidth * scale), Math.round(image.naturalHeight * scale));
    return canvas.toDataURL("image/png");
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("image load failed"));
        image.src = src;
    });
}
