import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { Prompt } from "@/services/api/prompts";

/** Scene + model + language chips, replacing the raw source tags (authors, repo names, duplicates). */
export function PromptBadges({ item, className, max = 3 }: { item: Prompt; className?: string; max?: number }) {
    const { t } = useTranslation();
    const { traits } = item;
    const badges: { label: string; tone: "scene" | "model" | "muted" }[] = [];
    for (const scene of traits.scenes.slice(0, traits.scenes[0] === "other" ? 0 : 2)) badges.push({ label: t(`prompts.scenes.${scene}`), tone: "scene" });
    if (traits.model === "nano-banana" || traits.model === "gpt-4o") badges.push({ label: t(`prompts.models.${traits.model}`), tone: "model" });
    if (traits.lang === "en") badges.push({ label: t("prompts.english"), tone: "muted" });
    if (!badges.length) return null;
    return (
        <div className={cn("flex flex-wrap gap-1", className)}>
            {badges.slice(0, max).map((badge) => (
                <span
                    key={badge.label}
                    className={cn(
                        "rounded px-1.5 py-0.5 text-[11px] leading-4",
                        badge.tone === "scene" && "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
                        badge.tone === "model" && "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                        badge.tone === "muted" && "border border-stone-200 text-stone-400 dark:border-stone-700 dark:text-stone-500",
                    )}
                >
                    {badge.label}
                </span>
            ))}
        </div>
    );
}
