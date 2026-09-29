import { useMemo } from "react";

import { SKINS, hexToRgba, neutral, tone, type SkinName } from "@/lib/skins";
import { useThemeStore } from "@/stores/use-theme-store";

export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export type CanvasTheme = {
    canvas: { background: string; dot: string; line: string; selectionStroke: string; selectionFill: string };
    node: { label: string; fill: string; panel: string; stroke: string; activeStroke: string; placeholder: string; text: string; muted: string; faint: string };
    toolbar: { panel: string; border: string; item: string; itemHover: string; activeBg: string; activeText: string };
};

export const canvasThemes: Record<CanvasColorTheme, CanvasTheme> = {
    light: {
        canvas: {
            background: "#f4f2ed",
            dot: "rgba(68,64,60,.28)",
            line: "rgba(68,64,60,.12)",
            selectionStroke: "#1c1917",
            selectionFill: "rgba(28,25,23,.06)",
        },
        node: {
            label: "#57534e",
            fill: "#e7e5df",
            panel: "#fbfaf7",
            stroke: "#d6d3ca",
            activeStroke: "#1c1917",
            placeholder: "#8a8479",
            text: "#292524",
            muted: "#78716c",
            faint: "#a8a29e",
        },
        toolbar: {
            panel: "rgba(251,250,247,.96)",
            border: "#d6d3ca",
            item: "#57534e",
            itemHover: "#e7e5df",
            activeBg: "#e7e5df",
            activeText: "#292524",
        },
    },
    dark: {
        canvas: {
            background: "#181715",
            dot: "rgba(245,245,244,.24)",
            line: "rgba(245,245,244,.10)",
            selectionStroke: "#fafaf9",
            selectionFill: "rgba(250,250,249,.10)",
        },
        node: {
            label: "#d6d3d1",
            fill: "#292524",
            panel: "#1f1d1a",
            stroke: "#44403c",
            activeStroke: "#fafaf9",
            placeholder: "#a8a29e",
            text: "#f5f5f4",
            muted: "#d6d3d1",
            faint: "#78716c",
        },
        toolbar: {
            panel: "rgba(31,29,26,.96)",
            border: "#44403c",
            item: "#d6d3d1",
            itemHover: "#292524",
            activeBg: "#3a3631",
            activeText: "#f5f5f4",
        },
    },
};

const skinPaletteCache = new Map<string, CanvasTheme>();

/** Canvas palette for a mode + skin. The classic skin returns the original palettes unchanged. */
export function getCanvasTheme(mode: CanvasColorTheme, skinName: SkinName): CanvasTheme {
    const skin = SKINS[skinName] ?? SKINS.classic;
    if (skin.tint === 0) return canvasThemes[mode];
    const key = `${mode}:${skin.name}`;
    const cached = skinPaletteCache.get(key);
    if (cached) return cached;
    const palette: CanvasTheme =
        mode === "light"
            ? {
                  canvas: {
                      background: tone(skin, 0.968, 0.012),
                      dot: hexToRgba(neutral(skin, 500), 0.3),
                      line: hexToRgba(neutral(skin, 500), 0.14),
                      selectionStroke: skin.accentStrong,
                      selectionFill: hexToRgba(skin.accent, 0.08),
                  },
                  node: {
                      label: neutral(skin, 600),
                      fill: neutral(skin, 200),
                      panel: tone(skin, 0.99, 0.006),
                      stroke: neutral(skin, 300),
                      activeStroke: skin.accentStrong,
                      placeholder: neutral(skin, 500),
                      text: neutral(skin, 800),
                      muted: neutral(skin, 500),
                      faint: neutral(skin, 400),
                  },
                  toolbar: {
                      panel: hexToRgba(tone(skin, 0.99, 0.006), 0.96),
                      border: neutral(skin, 300),
                      item: neutral(skin, 600),
                      itemHover: neutral(skin, 200),
                      activeBg: tone(skin, 0.93, 0.06),
                      activeText: skin.accentStrong,
                  },
              }
            : {
                  canvas: {
                      background: tone(skin, 0.185, 0.03),
                      dot: hexToRgba(neutral(skin, 300), 0.22),
                      line: hexToRgba(neutral(skin, 300), 0.09),
                      selectionStroke: skin.accentLight,
                      selectionFill: hexToRgba(skin.accent, 0.14),
                  },
                  node: {
                      label: neutral(skin, 300),
                      fill: neutral(skin, 800),
                      panel: tone(skin, 0.215, 0.03),
                      stroke: neutral(skin, 700),
                      activeStroke: skin.accentLight,
                      placeholder: neutral(skin, 400),
                      text: neutral(skin, 100),
                      muted: neutral(skin, 300),
                      faint: neutral(skin, 500),
                  },
                  toolbar: {
                      panel: hexToRgba(tone(skin, 0.215, 0.03), 0.96),
                      border: neutral(skin, 700),
                      item: neutral(skin, 300),
                      itemHover: neutral(skin, 800),
                      activeBg: tone(skin, 0.33, 0.08),
                      activeText: neutral(skin, 50),
                  },
              };
    skinPaletteCache.set(key, palette);
    return palette;
}

/** React hook: the canvas palette for the current mode and skin. */
export function useCanvasTheme(): CanvasTheme {
    const mode = useThemeStore((state) => state.theme);
    const skin = useThemeStore((state) => state.skin);
    return useMemo(() => getCanvasTheme(mode, skin), [mode, skin]);
}
