import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

import { SKINS, hexToRgba, tone, type SkinName } from "@/lib/skins";

const neutral = {
    light: {
        primary: "#171717",
        primaryHover: "#000000",
        primaryText: "#ffffff",
        elevatedBg: "#ffffff",
        itemHoverBg: "rgba(23, 23, 23, 0.06)",
        itemSelectedBg: "rgba(23, 23, 23, 0.1)",
        itemSelectedHoverBg: "rgba(23, 23, 23, 0.14)",
        itemText: "#171717",
        tableSelectedBg: "rgba(17, 17, 17, 0.05)",
        tableSelectedHoverBg: "rgba(17, 17, 17, 0.08)",
    },
    dark: {
        primary: "#fafafa",
        primaryHover: "#ffffff",
        primaryText: "#171717",
        elevatedBg: "#1c1917",
        itemHoverBg: "rgba(250, 250, 249, 0.08)",
        itemSelectedBg: "rgba(250, 250, 249, 0.12)",
        itemSelectedHoverBg: "rgba(250, 250, 249, 0.16)",
        itemText: "#fafafa",
        tableSelectedBg: "rgba(255, 255, 255, 0.08)",
        tableSelectedHoverBg: "rgba(255, 255, 255, 0.12)",
    },
};

type AntPalette = (typeof neutral)["light"];

/** antd palette for a skin; the classic skin keeps the original black / white primary. */
function skinPalette(dark: boolean, skinName: SkinName): AntPalette {
    const skin = SKINS[skinName] ?? SKINS.classic;
    if (skin.tint === 0) return dark ? neutral.dark : neutral.light;
    const primary = dark ? skin.accent : skin.accentStrong;
    return {
        primary,
        primaryHover: dark ? skin.accentLight : skin.accent,
        primaryText: "#ffffff",
        elevatedBg: dark ? tone(skin, 0.22, 0.03) : "#ffffff",
        itemHoverBg: hexToRgba(skin.accent, dark ? 0.12 : 0.07),
        itemSelectedBg: hexToRgba(skin.accent, dark ? 0.2 : 0.12),
        itemSelectedHoverBg: hexToRgba(skin.accent, dark ? 0.26 : 0.16),
        itemText: dark ? "#fafafa" : tone(skin, 0.22, 0.03),
        tableSelectedBg: hexToRgba(skin.accent, dark ? 0.12 : 0.06),
        tableSelectedHoverBg: hexToRgba(skin.accent, dark ? 0.18 : 0.1),
    };
}

export function getAntThemeConfig(dark: boolean, skinName: SkinName = "classic"): ThemeConfig {
    const color = skinPalette(dark, skinName);
    const darkColor = skinPalette(true, skinName);

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: `infinite-canvas-${dark ? "dark" : "light"}-${skinName}` },
        token: {
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            colorBgElevated: color.elevatedBg,
            controlItemBgHover: color.itemHoverBg,
            controlItemBgActive: color.itemSelectedBg,
            controlItemBgActiveHover: color.itemSelectedHoverBg,
        },
        components: {
            Button: {
                primaryShadow: "none",
            },
            Dropdown: {
                colorBgElevated: color.elevatedBg,
                colorText: color.itemText,
                controlItemBgHover: color.itemHoverBg,
                controlItemBgActive: color.itemSelectedBg,
                controlItemBgActiveHover: color.itemSelectedHoverBg,
            },
            Menu: {
                popupBg: color.elevatedBg,
                itemActiveBg: color.itemSelectedBg,
                itemHoverBg: color.itemHoverBg,
                itemSelectedBg: color.itemSelectedBg,
                itemSelectedColor: color.itemText,
                darkPopupBg: darkColor.elevatedBg,
                darkItemHoverBg: darkColor.itemHoverBg,
                darkItemSelectedBg: darkColor.itemSelectedBg,
                darkItemSelectedColor: darkColor.itemText,
            },
            Select: {
                optionActiveBg: color.itemHoverBg,
                optionSelectedBg: color.itemSelectedBg,
                optionSelectedColor: color.itemText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}
