import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_SKIN_NAME } from "@/constant/runtime-config";
import { type SkinName } from "@/lib/skins";

export type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    /** Color skin layered on top of the light/dark mode. */
    skin: SkinName;
    setTheme: (theme: ThemeName) => void;
    setSkin: (skin: SkinName) => void;
};

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "dark",
            skin: DEFAULT_SKIN_NAME,
            setTheme: (theme) => set({ theme }),
            setSkin: (skin) => set({ skin }),
        }),
        { name: "infinite-canvas:theme_store" },
    ),
);
