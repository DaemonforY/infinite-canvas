import { Clock3, Search, Star } from "lucide-react";
import { Input, Segmented, Select, Tag } from "antd";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import { PROMPT_SCENES, type PromptScene } from "@/lib/prompt-taxonomy";
import { ALL_PROMPTS_OPTION, type PromptModelFilter, type PromptSort } from "@/services/api/prompts";
import type { PromptBrowserState, PromptTab } from "./use-prompt-list";

type Props = {
    state: PromptBrowserState;
    onChange: (patch: Partial<PromptBrowserState>) => void;
    sources: string[];
    sceneCounts: Partial<Record<PromptScene, number>>;
    favoriteCount: number;
    recentCount: number;
    compact?: boolean;
};

/** Tabs + search + scene chips + model / sort / source selectors shared by the page and the picker. */
export function PromptFilters({ state, onChange, sources, sceneCounts, favoriteCount, recentCount, compact = false }: Props) {
    const { t } = useTranslation();
    const remote = state.tab === "all";
    const scenes = PROMPT_SCENES.filter((scene) => !remote || (sceneCounts[scene] || 0) > 0 || state.scene === scene);

    return (
        <div className="space-y-3" data-testid="prompt-filters">
            <div className="flex flex-wrap items-center gap-2">
                <Segmented<PromptTab>
                    className="shrink-0"
                    value={state.tab}
                    onChange={(tab) => onChange({ tab })}
                    options={[
                        { value: "all", label: t("prompts.tabAll") },
                        {
                            value: "favorites",
                            label: (
                                <span className="inline-flex items-center gap-1">
                                    <Star className="size-3.5" />
                                    {t("prompts.tabFavorites")}
                                    {favoriteCount ? ` ${favoriteCount}` : ""}
                                </span>
                            ),
                        },
                        {
                            value: "recent",
                            label: (
                                <span className="inline-flex items-center gap-1">
                                    <Clock3 className="size-3.5" />
                                    {t("prompts.tabRecent")}
                                    {recentCount ? ` ${recentCount}` : ""}
                                </span>
                            ),
                        },
                    ]}
                />
                <Input
                    allowClear
                    className="order-first min-w-0 basis-full sm:order-none sm:min-w-48 sm:flex-1 sm:basis-0"
                    size={compact ? "middle" : "large"}
                    prefix={<Search className="size-4 text-stone-400" />}
                    value={state.keyword}
                    placeholder={t("prompts.search")}
                    onChange={(event) => onChange({ keyword: event.target.value })}
                />
                <Select<PromptModelFilter>
                    className="min-w-32 flex-1 sm:w-40 sm:flex-none"
                    size={compact ? "middle" : "large"}
                    value={state.model}
                    onChange={(model) => onChange({ model })}
                    options={[
                        { value: ALL_PROMPTS_OPTION, label: t("prompts.modelAll") },
                        { value: "gpt-image-2", label: t("prompts.modelHere") },
                        { value: "other", label: t("prompts.modelOther") },
                    ]}
                />
                {remote ? (
                    <Select<PromptSort>
                        className="w-24 sm:w-28"
                        size={compact ? "middle" : "large"}
                        value={state.sort}
                        onChange={(sort) => onChange({ sort })}
                        options={[
                            { value: "recommended", label: t("prompts.sortRecommended") },
                            { value: "latest", label: t("prompts.sortLatest") },
                        ]}
                    />
                ) : null}
                {remote && !compact && sources.length > 1 ? (
                    // antd sets its own display, so the mobile hide goes on a wrapper.
                    <div className="hidden sm:block">
                        <Select<string>
                            className="w-48"
                            size="large"
                            value={state.source}
                            onChange={(source) => onChange({ source })}
                            popupMatchSelectWidth={false}
                            options={[{ value: ALL_PROMPTS_OPTION, label: t("prompts.allSources") }, ...sources.map((source) => ({ value: source, label: source }))]}
                        />
                    </div>
                ) : null}
            </div>
            <div className={cn("thin-scrollbar flex gap-1.5 overflow-x-auto pb-1", compact ? "flex-nowrap" : "flex-nowrap sm:flex-wrap sm:overflow-visible")} data-testid="prompt-scene-chips">
                <SceneChip active={state.scene === ALL_PROMPTS_OPTION} onClick={() => onChange({ scene: ALL_PROMPTS_OPTION })}>
                    {t("common.all")}
                </SceneChip>
                {scenes.map((scene) => (
                    <SceneChip key={scene} active={state.scene === scene} onClick={() => onChange({ scene })}>
                        {t(`prompts.scenes.${scene}`)}
                        {remote && sceneCounts[scene] ? <span className="ml-1 opacity-50">{sceneCounts[scene]}</span> : null}
                    </SceneChip>
                ))}
            </div>
        </div>
    );
}

// Reuses the library's skin-aware filter-tag styling (plain Tailwind stone colors are remapped by skins).
function SceneChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <Tag.CheckableTag checked={active} onChange={onClick} className={cn("prompt-filter-tag shrink-0 whitespace-nowrap", active && "is-active")}>
            {children}
        </Tag.CheckableTag>
    );
}
