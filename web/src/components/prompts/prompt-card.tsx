import { Check, Copy, FileText, Flame, FolderPlus, ImagePlus, Pencil, Pin, Star, Trash2, Wand2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button, Card, Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { Prompt } from "@/services/api/prompts";
import { PromptBadges } from "./prompt-badges";

export function PromptCard({
    item,
    favorite = false,
    onOpen,
    onDraw,
    onCopy,
    onFavorite,
    onSaveAsset,
    onEdit,
    onDelete,
    selection,
    extra,
    compact = false,
}: {
    item: Prompt;
    favorite?: boolean;
    onOpen: () => void;
    onDraw?: () => void;
    onCopy?: () => void;
    onFavorite?: () => void;
    onSaveAsset?: () => void;
    /** The user's own prompts: edit / delete instead of keeping as an asset. */
    onEdit?: () => void;
    onDelete?: () => void;
    /** Multi-select in 「我的」: the whole card toggles, the actions are hidden. */
    selection?: { selected: boolean; onToggle: () => void };
    /** More actions (pin / move) after the regular ones. */
    extra?: ReactNode;
    compact?: boolean;
}) {
    const { t } = useTranslation();
    // Some upstream images have been deleted; fall back to the placeholder instead of a broken image.
    const [failedCover, setFailedCover] = useState("");
    const showCover = Boolean(item.coverUrl) && failedCover !== item.coverUrl;
    const video = item.traits.scenes[0] === "video";
    const open = selection ? selection.onToggle : onOpen;

    return (
        <Card
            hoverable
            className={cn("group flex h-full flex-col overflow-hidden", compact && "cursor-pointer", selection?.selected && "!border-sky-500 ring-2 ring-sky-500/40")}
            styles={{ body: { display: "flex", flex: 1, flexDirection: "column", padding: 0 } }}
            cover={
                <div className="relative overflow-hidden">
                    <button type="button" className="block w-full cursor-pointer text-left" onClick={open} aria-label={item.title}>
                        {showCover ? (
                            <img
                                src={item.coverUrl}
                                alt={item.title}
                                className={cn("w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]", compact ? "aspect-square" : "aspect-[4/3]")}
                                loading="lazy"
                                onError={() => setFailedCover(item.coverUrl)}
                            />
                        ) : (
                            <span className={cn("grid w-full place-items-center bg-stone-100 text-stone-400 dark:bg-stone-900 dark:text-stone-600", compact ? "aspect-square" : "aspect-[4/3]")}>
                                <FileText className="size-8" />
                            </span>
                        )}
                    </button>
                    {item.mine && item.status ? (
                        <span className={cn("pointer-events-none absolute bottom-2 left-2 rounded-full px-2 py-0.5 text-[11px] text-white backdrop-blur", mineStatusClass(item))} data-testid="prompt-mine-status">
                            {t(`myPrompts.status.${mineStatus(item)}`)}
                        </span>
                    ) : item.featured ? (
                        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-amber-500/90 px-2 py-0.5 text-[11px] text-white">{t("prompts.featured")}</span>
                    ) : null}
                    {item.traits.needsReference ? (
                        <span className="pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white backdrop-blur">
                            <ImagePlus className="size-3" />
                            {t("prompts.needsReference")}
                        </span>
                    ) : null}
                    {selection ? (
                        <button
                            type="button"
                            data-testid="prompt-select"
                            aria-pressed={selection.selected}
                            onClick={selection.onToggle}
                            className={cn(
                                "absolute right-2 top-2 grid size-7 place-items-center rounded-full border-2 text-white transition",
                                selection.selected ? "border-sky-500 bg-sky-500" : "border-white/90 bg-black/30 backdrop-blur",
                            )}
                        >
                            {selection.selected ? <Check className="size-4" /> : null}
                        </button>
                    ) : onFavorite ? (
                        <Tooltip title={favorite ? t("prompts.unfavorite") : t("prompts.favorite")}>
                            <button
                                type="button"
                                data-testid="prompt-favorite"
                                aria-pressed={favorite}
                                aria-label={favorite ? t("prompts.unfavorite") : t("prompts.favorite")}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onFavorite();
                                }}
                                className={cn(
                                    "absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/45 text-white backdrop-blur transition-opacity hover:bg-black/65",
                                    favorite ? "opacity-100" : "opacity-0 focus:opacity-100 group-hover:opacity-100",
                                )}
                            >
                                <Star className={cn("size-4", favorite && "fill-amber-400 text-amber-400")} />
                            </button>
                        </Tooltip>
                    ) : null}
                </div>
            }
        >
            <button type="button" className="block w-full flex-1 cursor-pointer text-left" onClick={open}>
                <div className={compact ? "px-3 py-2.5" : "px-4 pb-2 pt-3"}>
                    <div className="flex items-center gap-2">
                        {item.pinned ? <Pin className="size-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label={t("myPrompts.pinned")} data-testid="prompt-pinned" /> : null}
                        <h2 className="line-clamp-1 min-w-0 flex-1 text-sm font-semibold text-stone-950 dark:text-stone-100">{item.title}</h2>
                        {item.useCount ? (
                            <span className="inline-flex shrink-0 items-center gap-0.5 text-[11px] text-stone-400" title={t("prompts.useCount", { count: item.useCount })} data-testid="prompt-use-count">
                                <Flame className="size-3" />
                                {formatCount(item.useCount)}
                            </span>
                        ) : null}
                    </div>
                    {!compact ? <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-stone-500 dark:text-stone-400">{item.prompt}</p> : null}
                    <PromptBadges item={item} className={compact ? "mt-1.5" : "mt-2.5"} max={compact ? 2 : 3} />
                </div>
            </button>
            {!compact && !selection && (onDraw || onCopy || onSaveAsset || onEdit) ? (
                <div className="mt-auto flex items-center gap-1 px-4 pb-4 pt-1">
                    {onDraw ? (
                        <Button type="primary" size="small" icon={<Wand2 className="size-3.5" />} onClick={onDraw} data-testid="prompt-draw">
                            {video ? t("prompts.useToVideo") : t("prompts.useToDraw")}
                        </Button>
                    ) : null}
                    <span className="flex-1" />
                    {onCopy ? (
                        <Tooltip title={t("common.copyPrompt")}>
                            <Button type="text" size="small" icon={<Copy className="size-3.5" />} onClick={onCopy} aria-label={t("common.copyPrompt")} />
                        </Tooltip>
                    ) : null}
                    {onEdit ? (
                        <Tooltip title={t("myPrompts.edit")}>
                            <Button type="text" size="small" icon={<Pencil className="size-3.5" />} onClick={onEdit} aria-label={t("myPrompts.edit")} data-testid="prompt-mine-edit" />
                        </Tooltip>
                    ) : null}
                    {onDelete ? (
                        <Tooltip title={t("common.delete")}>
                            <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} onClick={onDelete} aria-label={t("common.delete")} data-testid="prompt-mine-delete" />
                        </Tooltip>
                    ) : null}
                    {onSaveAsset ? (
                        <Tooltip title={t("common.addToAssets")}>
                            <Button type="text" size="small" icon={<FolderPlus className="size-3.5" />} onClick={onSaveAsset} aria-label={t("common.addToAssets")} />
                        </Tooltip>
                    ) : null}
                    {extra}
                </div>
            ) : null}
        </Card>
    );
}

/** How the user's own prompt stands: private, waiting for review, public, rejected or hidden. */
export function mineStatus(item: Prompt): "private" | "pending" | "public" | "rejected" | "hidden" {
    if (item.status === "hidden") return "hidden";
    if (item.visibility !== "public") return "private";
    if (item.status === "pending") return "pending";
    if (item.status === "rejected") return "rejected";
    return "public";
}

function mineStatusClass(item: Prompt) {
    switch (mineStatus(item)) {
        case "public":
            return "bg-emerald-600/85";
        case "pending":
            return "bg-amber-500/90";
        case "rejected":
        case "hidden":
            return "bg-red-600/85";
        default:
            return "bg-black/55";
    }
}

function formatCount(n: number) {
    return n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, "")}w` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}
