// Visual skins: a color layer on top of the light/dark mode.
//
// A skin tints three things from a single definition (hue + accent):
//   1. the app shell — Tailwind v4 compiles `stone-*` utilities to `var(--color-stone-*)`,
//      so re-defining that ramp on <html> recolors every page without touching markup;
//   2. the shadcn-style tokens (--background, --primary, ...);
//   3. the canvas palette (see getCanvasTheme) and the antd primary color.
// Solid colors are emitted as 6-digit hex because some components append a 2-digit
// alpha to palette values (e.g. `${theme.node.activeStroke}66`).

export type SkinName = "classic" | "nebula" | "ocean" | "forest" | "sunset" | "sakura";

export type SkinDef = {
    name: SkinName;
    /** Hue (OKLCH degrees) used to tint neutrals. */
    hue: number;
    /** Tint strength for neutrals, 0 = pure gray. */
    tint: number;
    /** Primary accent (≈ Tailwind 500). */
    accent: string;
    /** Darker accent for text / light-mode buttons (≈ 600). */
    accentStrong: string;
    /** Lighter accent for dark-mode strokes (≈ 400). */
    accentLight: string;
    /** Secondary color used only in swatches / gradients. */
    accent2: string;
};

export const SKINS: Record<SkinName, SkinDef> = {
    classic: { name: "classic", hue: 60, tint: 0, accent: "#57534e", accentStrong: "#292524", accentLight: "#d6d3d1", accent2: "#a8a29e" },
    nebula: { name: "nebula", hue: 295, tint: 1, accent: "#8b5cf6", accentStrong: "#7c3aed", accentLight: "#a78bfa", accent2: "#e879f9" },
    ocean: { name: "ocean", hue: 240, tint: 1, accent: "#0ea5e9", accentStrong: "#0284c7", accentLight: "#38bdf8", accent2: "#22d3ee" },
    forest: { name: "forest", hue: 165, tint: 0.9, accent: "#10b981", accentStrong: "#059669", accentLight: "#34d399", accent2: "#a3e635" },
    sunset: { name: "sunset", hue: 45, tint: 1, accent: "#f97316", accentStrong: "#ea580c", accentLight: "#fb923c", accent2: "#f43f5e" },
    sakura: { name: "sakura", hue: 350, tint: 0.9, accent: "#ec4899", accentStrong: "#db2777", accentLight: "#f472b6", accent2: "#fda4af" },
};

export const SKIN_NAMES = Object.keys(SKINS) as SkinName[];
export const DEFAULT_SKIN: SkinName = "nebula";

export function isSkinName(value: unknown): value is SkinName {
    return typeof value === "string" && value in SKINS;
}

// ---------------------------------------------------------------------------
// Color math: OKLCH -> sRGB hex (https://bottosson.github.io/posts/oklab/)
// ---------------------------------------------------------------------------

function clamp01(v: number) {
    return Math.min(1, Math.max(0, v));
}

function linearToSrgb(x: number) {
    return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

/** Converts OKLCH (L 0..1, C ≥ 0, h degrees) to a #rrggbb string, clamping out-of-gamut values. */
export function oklchToHex(l: number, c: number, h: number): string {
    const rad = (h * Math.PI) / 180;
    const a = c * Math.cos(rad);
    const b = c * Math.sin(rad);
    const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = l - 0.0894841775 * a - 1.291485548 * b;
    const L = l_ ** 3;
    const M = m_ ** 3;
    const S = s_ ** 3;
    const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
    const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
    const bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;
    const toHex = (v: number) =>
        Math.round(clamp01(linearToSrgb(v)) * 255)
            .toString(16)
            .padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

export function hexToRgba(hex: string, alpha: number): string {
    const n = Number.parseInt(hex.replace("#", ""), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

// Lightness ladder of Tailwind's stone ramp, with a chroma curve that is strongest mid-ramp.
const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
export type RampStep = (typeof RAMP_STEPS)[number];
const RAMP_L: Record<RampStep, number> = { 50: 0.985, 100: 0.97, 200: 0.923, 300: 0.869, 400: 0.709, 500: 0.553, 600: 0.444, 700: 0.374, 800: 0.268, 900: 0.216, 950: 0.147 };
const RAMP_C: Record<RampStep, number> = { 50: 0.005, 100: 0.008, 200: 0.013, 300: 0.018, 400: 0.026, 500: 0.032, 600: 0.03, 700: 0.028, 800: 0.026, 900: 0.024, 950: 0.02 };

/** Tinted neutral at a ramp step. */
export function neutral(skin: SkinDef, step: RampStep): string {
    return oklchToHex(RAMP_L[step], RAMP_C[step] * skin.tint, skin.hue);
}

/** Tinted neutral at an arbitrary lightness. */
export function tone(skin: SkinDef, l: number, c = 0.02): string {
    return oklchToHex(l, c * skin.tint, skin.hue);
}

/** CSS custom properties a skin writes on <html>. Empty for the classic skin. */
export function skinCssVariables(name: SkinName, dark: boolean): Record<string, string> {
    const skin = SKINS[name];
    if (skin.tint === 0) return {};
    const vars: Record<string, string> = {};
    for (const step of RAMP_STEPS) vars[`--color-stone-${step}`] = neutral(skin, step);
    Object.assign(
        vars,
        dark
            ? {
                  "--background": tone(skin, 0.165, 0.03),
                  "--card": tone(skin, 0.205, 0.03),
                  "--popover": tone(skin, 0.205, 0.03),
                  "--secondary": neutral(skin, 800),
                  "--muted": neutral(skin, 800),
                  "--accent": neutral(skin, 800),
                  "--sidebar": tone(skin, 0.19, 0.03),
              }
            : {
                  "--background": tone(skin, 0.992, 0.006),
                  "--card": "#ffffff",
                  "--popover": "#ffffff",
                  "--secondary": neutral(skin, 100),
                  "--muted": neutral(skin, 100),
                  "--accent": neutral(skin, 100),
                  "--sidebar": tone(skin, 0.98, 0.008),
                  "--border": neutral(skin, 200),
                  "--input": neutral(skin, 200),
              },
        {
            "--primary": dark ? skin.accent : skin.accentStrong,
            "--primary-foreground": "#ffffff",
            "--ring": skin.accent,
            "--skin-accent": skin.accent,
            "--skin-accent-2": skin.accent2,
        },
    );
    return vars;
}

const APPLIED_KEYS = new Set<string>();

/** Applies (or clears, for classic) skin variables on the document root. */
export function applySkinToDocument(name: SkinName, dark: boolean) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const vars = skinCssVariables(name, dark);
    for (const key of APPLIED_KEYS) {
        if (!(key in vars)) root.style.removeProperty(key);
    }
    APPLIED_KEYS.clear();
    for (const [key, value] of Object.entries(vars)) {
        root.style.setProperty(key, value);
        APPLIED_KEYS.add(key);
    }
    root.dataset.skin = name;
}
