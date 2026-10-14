import { useState } from "react";
import { Button, Input, Segmented, Switch, Tooltip } from "antd";
import { Crown, Download, FolderPlus, Lightbulb, Plus, RotateCcw, ScanSearch, Send, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import { panelRects, type ComicBubble, type ComicBubbleKind, type ComicLayoutId, type ComicProject, type ComicTail } from "@/lib/comic";
import { SFX_COLORS } from "@/lib/comic-layout";
import { scenePanelRects } from "./comic-api";
import { ComicSceneView, type ComicSceneSource } from "./comic-lettering";
import { LayoutPicker } from "./comic-page-step";

const KINDS: ComicBubbleKind[] = ["speech", "thought", "shout", "narration", "sfx"];
const TAILS: ComicTail[] = ["left", "right", "none"];
const TILTS = [-12, 0, 12];

/** Step 4: lettering over the page — edit, move, resize, balloon styles, sound effects — and the finished page. */
export function ComicLetterStep({
    project,
    source,
    busy,
    free,
    onSale,
    membershipHref,
    onChange,
    onFocus,
    onLayout,
    onReset,
    onSave,
    onPublish,
    onAddToAssets,
}: {
    project: ComicProject;
    source: ComicSceneSource;
    busy: boolean;
    free: boolean;
    onSale: boolean;
    membershipHref: string;
    onChange: (bubbles: ComicBubble[]) => void;
    onFocus: (panel: number, focus: { x: number; y: number }) => void;
    onLayout: (layout: ComicLayoutId) => void;
    /** 整页: find the balloons again; 逐格: put the lines back in their default places. */
    onReset: () => void;
    onSave: () => void;
    onPublish: () => void;
    onAddToAssets: () => void;
}) {
    const { t } = useTranslation();
    const [selected, setSelected] = useState<string>("");
    const cells = Boolean(source.cells);
    const bubbles = source.bubbles;
    const current = bubbles.find((bubble) => bubble.id === selected);
    const sfxWords = t("comic.letter.sfxWords", { returnObjects: true }) as string[];

    const update = (bubble: ComicBubble) => onChange(bubbles.map((item) => (item.id === bubble.id ? bubble : item)));

    /** A new bubble in the selected bubble's panel (else the first), placed in that panel's coordinates. */
    const add = (kind: ComicBubbleKind, text: string) => {
        const panel = current?.panel ?? 0;
        const sfx = kind === "sfx";
        let box = cells ? { x: 0.3, y: 0.1, w: sfx ? 0.42 : 0.42, h: sfx ? 0.2 : 0.26 } : { x: 0, y: 0, w: 0, h: 0 };
        if (!cells) {
            const rect = panelRects(project.panels.length)[panel] || panelRects(project.panels.length)[0];
            box = { x: rect.x + rect.w * 0.35, y: rect.y + rect.h * 0.1, w: Math.min(0.3, rect.w * 0.34), h: Math.min(sfx ? 0.06 : 0.08, rect.h * 0.24) };
        }
        const bubble: ComicBubble = {
            id: nanoid(),
            panel,
            line: bubbles.filter((item) => item.panel === panel).length,
            text,
            kind,
            ...box,
            drawn: true,
            ...(cells ? { cell: true } : {}),
            ...(sfx ? { rotate: -12, color: SFX_COLORS[0] } : { tail: kind === "speech" || kind === "thought" ? "left" : "none" }),
        };
        onChange([...bubbles, bubble]);
        setSelected(bubble.id);
    };

    const sorted = [...bubbles].sort((a, b) => a.panel - b.panel || a.y - b.y || a.x - b.x);

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 lg:flex-row lg:overflow-hidden lg:p-6">
            <div className="flex shrink-0 justify-center lg:h-full lg:min-h-0">
                <ComicSceneView
                    source={source}
                    className="w-full max-w-md shadow-lg lg:h-full lg:w-auto lg:max-w-none"
                    selectedBubble={selected}
                    onSelectBubble={setSelected}
                    onChangeBubble={update}
                    onChangeFocus={cells ? onFocus : undefined}
                    panelRects={scenePanelRects(project, source)}
                />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-4 lg:overflow-y-auto">
                {cells ? (
                    <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
                        <LayoutPicker value={project.layout || "manga"} count={project.panels.length} onChange={onLayout} />
                        <div className="mt-2 text-xs text-stone-400">{t("comic.letter.panHint")}</div>
                    </div>
                ) : null}

                <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
                    <div className="mb-2 flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{t("comic.letter.title")}</h3>
                        <span className="text-xs text-stone-400">{t("comic.letter.hint")}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {sorted.map((bubble) => (
                            <div
                                key={bubble.id}
                                className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${bubble.id === selected ? "border-(--skin-accent) bg-(--skin-accent)/5" : "border-stone-200 dark:border-stone-700"}`}
                                onClick={() => setSelected(bubble.id)}
                            >
                                <span className="w-12 shrink-0 text-[11px] text-stone-400">{t("comic.panelN", { n: bubble.panel + 1 })}</span>
                                <Input variant="borderless" size="small" value={bubble.text} onChange={(event) => update({ ...bubble, text: event.target.value.slice(0, 60) })} data-testid="comic-line" />
                                <span className="shrink-0 text-[11px] text-stone-400">{t(`comic.kinds.${bubble.kind}`)}</span>
                                <Tooltip title={t("common.delete")}>
                                    <Button
                                        type="text"
                                        size="small"
                                        icon={<Trash2 className="size-3.5" />}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onChange(bubbles.filter((item) => item.id !== bubble.id));
                                        }}
                                    />
                                </Tooltip>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => add("speech", t("comic.letter.newLine"))}>
                            {t("comic.letter.add")}
                        </Button>
                        <Button size="small" type="text" icon={cells ? <RotateCcw className="size-3.5" /> : <ScanSearch className="size-3.5" />} disabled={busy} onClick={onReset}>
                            {cells ? t("comic.letter.resetCells") : t("comic.letter.detect")}
                        </Button>
                    </div>

                    <div className="mt-3 border-t border-stone-100 pt-3 dark:border-stone-800">
                        <div className="mb-1.5 text-xs text-stone-500">{t("comic.letter.sfxTitle")}</div>
                        <div className="flex flex-wrap gap-1.5">
                            {sfxWords.map((word) => (
                                <button key={word} type="button" className="rounded-full border border-stone-200 px-2.5 py-0.5 text-xs font-bold text-orange-600 hover:border-orange-300 dark:border-stone-700" onClick={() => add("sfx", word)}>
                                    {word}
                                </button>
                            ))}
                        </div>
                    </div>

                    {current ? (
                        <div className="mt-3 space-y-2.5 border-t border-stone-100 pt-3 dark:border-stone-800">
                            <div className="text-xs text-stone-500">{t("comic.letter.selected", { n: current.panel + 1 })}</div>
                            <Segmented
                                size="small"
                                value={current.kind}
                                onChange={(value) => update({ ...current, kind: value as ComicBubbleKind, drawn: current.drawn || value === "sfx", ...(value === "sfx" ? { rotate: current.rotate ?? -12, color: current.color || SFX_COLORS[0] } : {}) })}
                                options={KINDS.map((kind) => ({ value: kind, label: t(`comic.kinds.${kind}`) }))}
                            />
                            {current.kind === "speech" || current.kind === "thought" ? (
                                <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                                    {t("comic.letter.tail")}
                                    <Segmented
                                        size="small"
                                        value={current.tail ?? (current.kind === "speech" ? "left" : "none")}
                                        onChange={(value) => update({ ...current, tail: value as ComicTail })}
                                        options={TAILS.map((tail) => ({ value: tail, label: t(`comic.letter.tails.${tail}`) }))}
                                    />
                                </div>
                            ) : null}
                            {current.kind === "sfx" ? (
                                <div className="flex flex-wrap items-center gap-3 text-xs text-stone-600 dark:text-stone-300">
                                    <span className="flex items-center gap-1.5">
                                        {t("comic.letter.color")}
                                        {SFX_COLORS.map((color) => (
                                            <button
                                                key={color}
                                                type="button"
                                                aria-label={color}
                                                onClick={() => update({ ...current, color })}
                                                className={`size-5 rounded-full border-2 ${current.color === color ? "border-(--skin-accent)" : "border-white shadow"}`}
                                                style={{ background: color }}
                                            />
                                        ))}
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        {t("comic.letter.tilt")}
                                        <Segmented
                                            size="small"
                                            value={current.rotate ?? 0}
                                            onChange={(value) => update({ ...current, rotate: Number(value) })}
                                            options={TILTS.map((tilt) => ({ value: tilt, label: t(`comic.letter.tilts.${tilt < 0 ? "left" : tilt > 0 ? "right" : "none"}`) }))}
                                        />
                                    </span>
                                </div>
                            ) : null}
                            {!cells && current.kind !== "sfx" ? (
                                <label className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300">
                                    <Switch size="small" checked={current.drawn} onChange={(checked) => update({ ...current, drawn: checked })} />
                                    {t("comic.letter.drawn")}
                                </label>
                            ) : null}
                            <div className="text-[11px] leading-5 text-stone-400">{cells ? t("comic.letter.cellsHint") : t("comic.letter.drawnHint")}</div>
                        </div>
                    ) : null}
                </div>

                <div className="flex gap-2 rounded-xl bg-(--skin-accent)/5 p-3 text-xs leading-5 text-stone-600 dark:text-stone-300">
                    <Lightbulb className="mt-0.5 size-4 shrink-0 text-(--skin-accent)" />
                    <span>{t("comic.letter.tip")}</span>
                </div>

                <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
                    <h3 className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-100">{t("comic.letter.doneTitle")}</h3>
                    <div className="flex flex-wrap gap-2">
                        <Button type="primary" icon={<Download className="size-4" />} onClick={onSave} disabled={busy} data-testid="comic-save">
                            {t("comic.letter.save")}
                        </Button>
                        <Button icon={<Send className="size-4" />} onClick={onPublish} disabled={busy}>
                            {t("comic.letter.publish")}
                        </Button>
                        <Button type="text" icon={<FolderPlus className="size-4" />} onClick={onAddToAssets} disabled={busy}>
                            {t("comic.letter.assets")}
                        </Button>
                    </div>
                    <div className="mt-2 text-xs text-stone-400">{free ? t("comic.letter.noWatermark") : t("comic.letter.watermark")}</div>
                    {!free && onSale ? (
                        <a href={membershipHref} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-amber-600">
                            <Crown className="size-3.5" />
                            {t("studio.watermark.removeHint")}
                        </a>
                    ) : null}
                </div>
            </div>
        </div>
    );
}
