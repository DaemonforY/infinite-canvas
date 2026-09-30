// Pixel-level image adjustments for the image editor.
//
// Applied in JS on ImageData (not CSS / ctx.filter) so the live preview and the exported file are
// identical in every browser. All slider values are in [-100, 100] except the one-sided ones noted.

export type Adjustments = {
    brightness: number;
    contrast: number;
    saturation: number;
    /** Negative = cooler (blue), positive = warmer (amber). */
    warmth: number;
    /** 0..100 */
    sharpness: number;
    /** 0..100 */
    vignette: number;
    /** 0..100 — lifts blacks for a matte / film look. */
    fade: number;
    /** 0..100 */
    sepia: number;
};

export const NEUTRAL_ADJUSTMENTS: Adjustments = { brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpness: 0, vignette: 0, fade: 0, sepia: 0 };

export type FilterPresetId = "original" | "vivid" | "fresh" | "warm" | "cool" | "film" | "mono" | "vintage";

export const FILTER_PRESETS: { id: FilterPresetId; adjustments: Adjustments }[] = [
    { id: "original", adjustments: NEUTRAL_ADJUSTMENTS },
    { id: "vivid", adjustments: { ...NEUTRAL_ADJUSTMENTS, saturation: 35, contrast: 15, sharpness: 20 } },
    { id: "fresh", adjustments: { ...NEUTRAL_ADJUSTMENTS, brightness: 8, saturation: 10, warmth: -12, contrast: -5 } },
    { id: "warm", adjustments: { ...NEUTRAL_ADJUSTMENTS, warmth: 35, brightness: 5, saturation: 10 } },
    { id: "cool", adjustments: { ...NEUTRAL_ADJUSTMENTS, warmth: -35, contrast: 10 } },
    { id: "film", adjustments: { ...NEUTRAL_ADJUSTMENTS, contrast: -10, saturation: -15, warmth: 12, fade: 25, vignette: 25 } },
    { id: "mono", adjustments: { ...NEUTRAL_ADJUSTMENTS, saturation: -100, contrast: 20 } },
    { id: "vintage", adjustments: { ...NEUTRAL_ADJUSTMENTS, sepia: 45, contrast: -5, vignette: 35, fade: 15 } },
];

export const ADJUSTMENT_RANGES: Record<keyof Adjustments, [number, number]> = {
    brightness: [-100, 100],
    contrast: [-100, 100],
    saturation: [-100, 100],
    warmth: [-100, 100],
    sharpness: [0, 100],
    vignette: [0, 100],
    fade: [0, 100],
    sepia: [0, 100],
};

export function isNeutral(a: Adjustments): boolean {
    return (Object.keys(NEUTRAL_ADJUSTMENTS) as (keyof Adjustments)[]).every((key) => a[key] === NEUTRAL_ADJUSTMENTS[key]);
}

/** Minimal ImageData shape so the math can be tested without a DOM. */
export type PixelBuffer = { data: Uint8ClampedArray; width: number; height: number };

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Applies adjustments in place. Order: sharpen → tone (brightness, contrast, fade) → color → vignette. */
export function applyAdjustments(buffer: PixelBuffer, a: Adjustments): void {
    if (isNeutral(a)) return;
    if (a.sharpness > 0) sharpen(buffer, a.sharpness / 100);

    const { data, width, height } = buffer;
    const brightness = 1 + a.brightness / 100;
    const c = (a.contrast / 100) * 255;
    const contrast = (259 * (c + 255)) / (255 * (259 - c));
    const saturation = 1 + a.saturation / 100;
    const warmth = a.warmth * 0.6;
    const fade = a.fade / 100;
    const sepia = a.sepia / 100;
    const vignette = a.vignette / 100;
    const cx = width / 2;
    const cy = height / 2;
    const maxDist = Math.hypot(cx, cy) || 1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            r *= brightness;
            g *= brightness;
            b *= brightness;

            r = contrast * (r - 128) + 128;
            g = contrast * (g - 128) + 128;
            b = contrast * (b - 128) + 128;

            if (fade > 0) {
                const lift = fade * 48;
                r = r * (1 - fade * 0.25) + lift;
                g = g * (1 - fade * 0.25) + lift;
                b = b * (1 - fade * 0.25) + lift;
            }

            if (saturation !== 1) {
                const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                r = gray + (r - gray) * saturation;
                g = gray + (g - gray) * saturation;
                b = gray + (b - gray) * saturation;
            }

            if (warmth !== 0) {
                r += warmth;
                b -= warmth;
            }

            if (sepia > 0) {
                const sr = 0.393 * r + 0.769 * g + 0.189 * b;
                const sg = 0.349 * r + 0.686 * g + 0.168 * b;
                const sb = 0.272 * r + 0.534 * g + 0.131 * b;
                r += (sr - r) * sepia;
                g += (sg - g) * sepia;
                b += (sb - b) * sepia;
            }

            if (vignette > 0) {
                const d = Math.hypot(x - cx, y - cy) / maxDist;
                const t = Math.min(1, Math.max(0, (d - 0.45) / 0.55));
                const k = 1 - vignette * 0.75 * t * t;
                r *= k;
                g *= k;
                b *= k;
            }

            data[i] = clamp255(r);
            data[i + 1] = clamp255(g);
            data[i + 2] = clamp255(b);
        }
    }
}

/** Unsharp mask with a 3×3 box blur: out = orig + amount × (orig − blur). */
function sharpen(buffer: PixelBuffer, strength: number): void {
    const { data, width, height } = buffer;
    if (width < 3 || height < 3) return;
    const amount = strength * 1.5;
    const src = new Uint8ClampedArray(data);
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            const i = (y * width + x) * 4;
            for (let ch = 0; ch < 3; ch++) {
                let sum = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    const row = (y + dy) * width;
                    for (let dx = -1; dx <= 1; dx++) sum += src[(row + x + dx) * 4 + ch];
                }
                const orig = src[i + ch];
                data[i + ch] = clamp255(orig + amount * (orig - sum / 9));
            }
        }
    }
}

export type Geometry = { rotate: 0 | 90 | 180 | 270; flipH: boolean; flipV: boolean };

export const IDENTITY_GEOMETRY: Geometry = { rotate: 0, flipH: false, flipV: false };

export function rotateBy(geometry: Geometry, delta: 90 | -90): Geometry {
    return { ...geometry, rotate: ((((geometry.rotate + delta) % 360) + 360) % 360) as Geometry["rotate"] };
}

/** Output size after rotation. */
export function rotatedSize(width: number, height: number, rotate: Geometry["rotate"]) {
    return rotate === 90 || rotate === 270 ? { width: height, height: width } : { width, height };
}
