import { useState } from "react";
import { Button, Input, Segmented, Switch, Tooltip } from "antd";
import { BookPlus, Copy, Crown, Download, Eye, LoaderCircle, Plus, RefreshCw, RotateCcw, Send, Sparkles, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import { TITLE_STYLES, type ComicBubble, type ComicBubbleKind, type ComicProject, type ComicTail, type ComicTitleStyle } from "@/lib/comic";
import { SFX_COLORS, TITLE_HIGHLIGHT } from "@/lib/comic-layout";
import { slideSource } from "./comic-api";
import { ComicImageView, ComicSceneView } from "./comic-lettering";

const KINDS: ComicBubbleKind[] = ["speech", "thought", "shout", "caption", "title", "sfx"];
const TAILS: ComicTail[] = ["left", "right", "none"];

/** Default boxes (relative to the slide) for lettering added by hand. */
const NEW_BOX: Record<string, Pick<ComicBubble, "x" | "y" | "w" | "h">> = {
    speech: { x: 0.3, y: 0.08, w: 0.45, h: 0.15 },
    caption: { x: 0, y: 0.875, w: 1, h: 0.125 },
    title: { x: 0.05, y: 0.05, w: 0.9, h: 0.2 },
    sfx: { x: 0.55, y: 0.3, w: 0.38, h: 0.1 },
};

/** Step 4 for 小红书多图: lettering slide by slide, then everything needed to post — preview, note, save all. */
export function ComicSlidesLetterStep({
    project,
    bubbles,
    busy,
    free,
    onSale,
    membershipHref,
    noteBusy,
    saving,
    onChange,
    onFocus,
    onPageNumbers,
    onTitleStyle,
    onReset,
    onPreview,
    onWriteNote,
    onCopy,
    onSaveAll,
    onPublish,
    onNextEpisode,
}: {
    project: ComicProject;
    bubbles: ComicBubble[];
    busy: boolean;
    free: boolean;
    onSale: boolean;
    membershipHref: string;
    noteBusy: boolean;
    saving: boolean;
    onChange: (bubbles: ComicBubble[]) => void;
    onFocus: (panel: number, focus: { x: number; y: number }) => void;
    onPageNumbers: (on: boolean) => void;
    /** For every title (the cover and the 互动页). */
    onTitleStyle: (style: ComicTitleStyle) => void;
    onReset: () => void;
    onPreview: (index: number) => void;
    onWriteNote: () => void;
    onCopy: (text: string) => void;
    onSaveAll: () => void;
    onPublish: () => void;
    onNextEpisode: () => void;
}) {
    const { t } = useTranslation();
    const [index, setIndex] = useState(0);
    const [selected, setSelected] = useState("");
    const sfxWords = t("comic.letter.sfxWords", { returnObjects: true }) as string[];
    const slideIndex = Math.min(index, project.panels.length - 1);
    const source = slideSource(project, slideIndex, bubbles);
    const own = source.bubbles;
    const current = own.find((bubble) => bubble.id === selected);
    const note = project.note;

    const update = (bubble: ComicBubble) => onChange(bubbles.map((item) => (item.id === bubble.id ? bubble : item)));
    const add = (kind: ComicBubbleKind, text: string) => {
        const box = NEW_BOX[kind] || NEW_BOX.speech;
        const bubble: ComicBubble = {
            id: nanoid(),
            panel: slideIndex,
            line: own.length + 1,
            text,
            kind,
            ...box,
            drawn: true,
            cell: true,
            ...(kind === "sfx" ? { rotate: -12, color: SFX_COLORS[0] } : { tail: kind === "speech" || kind === "thought" ? "left" : "none" }),
        };
        onChange([...bubbles, bubble]);
        setSelected(bubble.id);
    };

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 lg:flex-row lg:overflow-hidden lg:p-6">
            <div className="mx-auto flex w-full max-w-sm shrink-0 flex-col gap-2 lg:mx-0 lg:w-[400px] lg:max-w-none lg:overflow-y-auto xl:w-[460px]">
                <ComicSceneView source={source} className="w-full shadow-lg" selectedBubble={selected} onSelectBubble={setSelected} onChangeBubble={update} onChangeFocus={onFocus} />
                <div className="flex max-w-full gap-1.5 overflow-x-auto pb-1">
                    {project.panels.map((panel, i) => {
                        const cell = project.cells?.[panel.id];
                        const image = cell?.versions[cell.version]?.image;
                        return (
                            <button
                                key={panel.id}
                                type="button"
                                onClick={() => {
                                    setIndex(i);
                                    setSelected("");
                                }}
                                className={`relative h-14 w-[2.6rem] shrink-0 overflow-hidden rounded-md border-2 bg-stone-100 dark:bg-stone-800 ${i === slideIndex ? "border-(--skin-accent)" : "border-transparent"}`}
                            >
                                {image ? <ComicImageView image={image} className="size-full object-cover" /> : null}
                                <span className="absolute bottom-0 left-0 rounded-tr bg-black/55 px-1 text-[9px] text-white">{i + 1}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-4 lg:overflow-y-auto">
                <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
                    <div className="mb-2 flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{t("comic.slides.letterTitle", { n: slideIndex + 1 })}</h3>
                        <span className="text-xs text-stone-400">{t("comic.letter.hint")}</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        {own.map((bubble) => (
                            <div
                                key={bubble.id}
                                className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${bubble.id === selected ? "border-(--skin-accent) bg-(--skin-accent)/5" : "border-stone-200 dark:border-stone-700"}`}
                                onClick={() => setSelected(bubble.id)}
                            >
                                <span className="w-14 shrink-0 text-[11px] text-stone-400">{t(`comic.kinds.${bubble.kind}`)}</span>
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
                        {!own.length ? <div className="text-xs text-stone-400">{t("comic.slides.noLettering")}</div> : null}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => add("speech", t("comic.letter.newLine"))}>
                            {t("comic.letter.add")}
                        </Button>
                        <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => add("caption", t("comic.slides.newCaption"))}>
                            {t("comic.slides.addCaption")}
                        </Button>
                        <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => add("title", t("comic.slides.newTitle"))}>
                            {t("comic.slides.addTitle")}
                        </Button>
                        <Button size="small" type="text" icon={<RotateCcw className="size-3.5" />} disabled={busy} onClick={onReset}>
                            {t("comic.slides.resetLettering")}
                        </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-stone-100 pt-3 dark:border-stone-800">
                        {sfxWords.map((word) => (
                            <button key={word} type="button" className="rounded-full border border-stone-200 px-2.5 py-0.5 text-xs font-bold text-orange-600 hover:border-orange-300 dark:border-stone-700" onClick={() => add("sfx", word)}>
                                {word}
                            </button>
                        ))}
                    </div>
                    {current ? (
                        <div className="mt-3 space-y-2.5 border-t border-stone-100 pt-3 dark:border-stone-800">
                            <Segmented
                                size="small"
                                value={current.kind}
                                onChange={(value) => update({ ...current, kind: value as ComicBubbleKind, ...(value === "sfx" ? { rotate: current.rotate ?? -12, color: current.color || SFX_COLORS[0] } : {}) })}
                                options={KINDS.map((kind) => ({ value: kind, label: t(`comic.kinds.${kind}`) }))}
                            />
                            {current.kind === "speech" || current.kind === "thought" ? (
                                <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                                    {t("comic.letter.tail")}
                                    <Segmented size="small" value={current.tail ?? "left"} onChange={(value) => update({ ...current, tail: value as ComicTail })} options={TAILS.map((tail) => ({ value: tail, label: t(`comic.letter.tails.${tail}`) }))} />
                                </div>
                            ) : null}
                            {current.kind === "sfx" ? (
                                <div className="flex items-center gap-1.5 text-xs text-stone-600 dark:text-stone-300">
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
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    {own.some((bubble) => bubble.kind === "title") ? (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3 text-xs text-stone-600 dark:border-stone-800 dark:text-stone-300" data-testid="comic-title-style">
                            {t("comic.slides.titleStyle")}
                            <Segmented
                                size="small"
                                value={project.titleStyle || "highlight"}
                                onChange={(value) => onTitleStyle(value as ComicTitleStyle)}
                                options={TITLE_STYLES.map((style) => ({ value: style, label: <TitleStyleLabel style={style} text={t(`comic.slides.titleStyles.${style}`)} /> }))}
                            />
                        </div>
                    ) : null}
                    <label className="mt-3 flex items-center gap-2 border-t border-stone-100 pt-3 text-xs text-stone-600 dark:border-stone-800 dark:text-stone-300">
                        <Switch size="small" checked={project.pageNumbers !== false} onChange={onPageNumbers} />
                        {t("comic.slides.pageNumbers", { n: Math.min(2, project.panels.length), count: project.panels.length })}
                    </label>
                    <div className="mt-2 text-[11px] leading-5 text-stone-400">{t("comic.slides.letterHint")}</div>
                </div>

                <div className="rounded-2xl border border-rose-200 bg-white p-4 dark:border-rose-900/60 dark:bg-stone-900" data-testid="comic-post">
                    <div className="mb-3 flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100">{t("comic.slides.postTitle")}</h3>
                        <span className="text-xs text-stone-400">{t("comic.slides.postSteps")}</span>
                    </div>
                    <div className="rounded-xl bg-stone-50 p-3 dark:bg-stone-800/60">
                        <div className="mb-2 flex items-center gap-2">
                            <b className="text-xs text-stone-700 dark:text-stone-200">{t("comic.slides.noteTitle")}</b>
                            <span className="flex-1" />
                            <Button
                                size="small"
                                type={note ? "text" : "primary"}
                                icon={noteBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : note ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />}
                                disabled={noteBusy}
                                onClick={onWriteNote}
                                data-testid="comic-write-note"
                            >
                                {note ? t("comic.slides.noteAgain") : t("comic.slides.noteWrite")}
                            </Button>
                        </div>
                        {note ? (
                            <div className="space-y-2 text-sm">
                                <NoteRow label={t("comic.slides.noteHeadline")} text={note.title} onCopy={onCopy} bold />
                                <NoteRow label={t("comic.slides.noteBody")} text={note.body} onCopy={onCopy} />
                                <NoteRow label={t("comic.slides.noteTags")} text={note.tags.map((tag) => `#${tag}`).join(" ")} onCopy={onCopy} />
                            </div>
                        ) : (
                            <div className="text-xs text-stone-400">{t("comic.slides.noteHint")}</div>
                        )}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button icon={<Eye className="size-4" />} onClick={() => onPreview(slideIndex)} data-testid="comic-preview">
                            {t("comic.slides.preview")}
                        </Button>
                        <Button type="primary" danger icon={saving ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} disabled={busy || saving} onClick={onSaveAll} data-testid="comic-save-all">
                            {t("comic.slides.saveAll", { count: project.panels.length })}
                        </Button>
                        <Button icon={<Send className="size-4" />} disabled={busy || saving} onClick={onPublish}>
                            {t("comic.letter.publish")}
                        </Button>
                        <Button type="text" icon={<BookPlus className="size-4" />} onClick={onNextEpisode}>
                            {t("comic.series.next", { n: (project.series?.episode || 1) + 1 })}
                        </Button>
                    </div>
                    <div className="mt-2 text-[11px] leading-5 text-stone-400">
                        {free ? t("comic.letter.noWatermark") : t("comic.letter.watermark")} {t("comic.slides.aiLabel")}
                    </div>
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

/** The style's name, painted in that style. */
function TitleStyleLabel({ style, text }: { style: ComicTitleStyle; text: string }) {
    const sample =
        style === "highlight"
            ? { background: `linear-gradient(transparent 55%, ${TITLE_HIGHLIGHT} 55%)`, color: "#111" }
            : style === "box"
              ? { background: "#fff", color: "#111", borderRadius: 3, padding: "0 3px", boxShadow: "0 0 2px rgba(0,0,0,.35)" }
              : { color: "#fff", WebkitTextStroke: "3px #111", paintOrder: "stroke fill" as const };
    // On a light chip, like the art behind a title, so every style reads in both themes.
    return (
        <span className="inline-flex items-center rounded bg-stone-300 px-1.5 py-0.5">
            <b style={sample} className="text-xs font-black">
                {text}
            </b>
        </span>
    );
}

function NoteRow({ label, text, onCopy, bold }: { label: string; text: string; onCopy: (text: string) => void; bold?: boolean }) {
    return (
        <div className="flex gap-2">
            <span className="w-10 shrink-0 pt-0.5 text-[11px] text-stone-400">{label}</span>
            <span className={`min-w-0 flex-1 whitespace-pre-wrap text-stone-800 dark:text-stone-100 ${bold ? "font-semibold" : ""}`}>{text}</span>
            <Button size="small" type="text" icon={<Copy className="size-3.5" />} onClick={() => onCopy(text)} aria-label="copy" />
        </div>
    );
}
