import { useState } from "react";
import { Button, Input, Segmented, Switch, Tooltip } from "antd";
import { Crown, Download, FolderPlus, Lightbulb, Plus, ScanSearch, Send, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import { panelRects, type ComicBubble, type ComicLineKind, type ComicProject } from "@/lib/comic";
import { LetteredPage } from "./comic-lettering";
import { LINE_KINDS } from "./comic-story-step";

/** Step 4: the dialogue laid over the page — edit, move, resize — and the finished page saved or published. */
export function ComicLetterStep({
    project,
    busy,
    free,
    onSale,
    membershipHref,
    onChange,
    onDetect,
    onSave,
    onPublish,
    onAddToAssets,
}: {
    project: ComicProject;
    busy: boolean;
    free: boolean;
    onSale: boolean;
    membershipHref: string;
    onChange: (bubbles: ComicBubble[]) => void;
    onDetect: () => void;
    onSave: () => void;
    onPublish: () => void;
    onAddToAssets: () => void;
}) {
    const { t } = useTranslation();
    const page = project.pages[project.page];
    const [selected, setSelected] = useState<string>("");
    if (!page) return null;
    const bubbles = page.bubbles;
    const current = bubbles.find((bubble) => bubble.id === selected);
    const rects = panelRects(project.panels.length);

    const update = (bubble: ComicBubble) => onChange(bubbles.map((item) => (item.id === bubble.id ? bubble : item)));
    const add = () => {
        const panel = current?.panel ?? 0;
        const rect = rects[panel] || rects[0];
        const bubble: ComicBubble = {
            id: nanoid(),
            panel,
            line: bubbles.filter((item) => item.panel === panel).length,
            text: t("comic.letter.newLine"),
            kind: "speech",
            x: rect.x + rect.w * 0.35,
            y: rect.y + rect.h * 0.1,
            w: Math.min(0.3, rect.w * 0.34),
            h: Math.min(0.08, rect.h * 0.24),
            drawn: true,
        };
        onChange([...bubbles, bubble]);
        setSelected(bubble.id);
    };

    const sorted = [...bubbles].sort((a, b) => a.panel - b.panel || a.y - b.y || a.x - b.x);

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 lg:flex-row lg:overflow-hidden lg:p-6">
            <div className="flex shrink-0 justify-center lg:h-full lg:min-h-0">
                <LetteredPage image={page.image} bubbles={bubbles} className="w-full max-w-md shadow-lg lg:h-full lg:w-auto lg:max-w-none" selectedBubble={selected} onSelectBubble={setSelected} onChangeBubble={update} />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-4 lg:overflow-y-auto">
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
                        <Button size="small" icon={<Plus className="size-3.5" />} onClick={add}>
                            {t("comic.letter.add")}
                        </Button>
                        <Button size="small" type="text" icon={<ScanSearch className="size-3.5" />} disabled={busy} onClick={onDetect}>
                            {t("comic.letter.detect")}
                        </Button>
                    </div>

                    {current ? (
                        <div className="mt-4 border-t border-stone-100 pt-3 dark:border-stone-800">
                            <div className="mb-2 text-xs text-stone-500">{t("comic.letter.selected", { n: current.panel + 1 })}</div>
                            <div className="flex flex-wrap items-center gap-3">
                                <Segmented size="small" value={current.kind} onChange={(value) => update({ ...current, kind: value as ComicLineKind })} options={LINE_KINDS.map((kind) => ({ value: kind, label: t(`comic.kinds.${kind}`) }))} />
                                <label className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300">
                                    <Switch size="small" checked={current.drawn} onChange={(checked) => update({ ...current, drawn: checked })} />
                                    {t("comic.letter.drawn")}
                                </label>
                            </div>
                            <div className="mt-2 text-[11px] leading-5 text-stone-400">{t("comic.letter.drawnHint")}</div>
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
