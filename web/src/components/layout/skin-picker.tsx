import type { CSSProperties } from "react";
import { Popover } from "antd";
import { Check, Palette } from "lucide-react";
import { useTranslation } from "react-i18next";

import { SKINS, SKIN_NAMES, type SkinName } from "@/lib/skins";
import { useThemeStore } from "@/stores/use-theme-store";

type SkinPickerProps = {
    className?: string;
    style?: CSSProperties;
};

function swatchStyle(name: SkinName): CSSProperties {
    const skin = SKINS[name];
    return { background: `linear-gradient(135deg, ${skin.accentLight} 0%, ${skin.accent} 45%, ${skin.accent2} 100%)` };
}

/** Top-bar button that opens a grid of color skins. */
export function SkinPicker({ className, style }: SkinPickerProps) {
    const { t } = useTranslation();
    const skin = useThemeStore((state) => state.skin);
    const setSkin = useThemeStore((state) => state.setSkin);
    const label = t("skins.title");

    const content = (
        <div className="w-64" data-testid="skin-picker">
            <div className="mb-2 text-xs text-stone-500 dark:text-stone-400">{t("skins.hint")}</div>
            <div className="grid grid-cols-3 gap-2">
                {SKIN_NAMES.map((name) => {
                    const active = name === skin;
                    return (
                        <button
                            key={name}
                            type="button"
                            onClick={() => setSkin(name)}
                            aria-pressed={active}
                            className={`group flex flex-col items-center gap-1.5 rounded-lg border p-2 text-xs transition ${active ? "border-[var(--skin-accent,#57534e)] bg-stone-100 dark:bg-stone-800" : "border-transparent hover:bg-stone-100 dark:hover:bg-stone-800"}`}
                        >
                            <span className="relative size-9 rounded-full shadow-sm ring-1 ring-black/5" style={swatchStyle(name)}>
                                {active ? (
                                    <span className="absolute inset-0 grid place-items-center text-white">
                                        <Check className="size-4 drop-shadow" />
                                    </span>
                                ) : null}
                            </span>
                            <span className={active ? "font-semibold text-stone-950 dark:text-white" : "text-stone-600 dark:text-stone-300"}>{t(`skins.names.${name}`)}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );

    return (
        <Popover content={content} trigger="click" placement="bottomRight" arrow={false}>
            <button type="button" className={className} style={style} aria-label={label} title={label}>
                <Palette className="size-4" />
            </button>
        </Popover>
    );
}
