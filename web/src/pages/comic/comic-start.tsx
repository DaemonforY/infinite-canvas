import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Input, Modal, Popconfirm, Segmented } from "antd";
import { BookOpen, LoaderCircle, Palette, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { COMIC_GENRES, COMIC_PANEL_COUNTS, COMIC_STYLES, type ComicGenre, type ComicProject, type ComicStyleChoice } from "@/lib/comic";
import { HandrawStylePicker } from "./handraw-style-picker";
import { ComicImageView } from "./comic-lettering";

const GENRE_ICONS: Record<ComicGenre, string> = { funny: "😹", work: "💼", romance: "💕", science: "🔬", brand: "🏷️" };
const GENRE_BG: Record<ComicGenre, string> = { funny: "bg-amber-100", work: "bg-sky-100", romance: "bg-pink-100", science: "bg-emerald-100", brand: "bg-violet-100" };
// A sample of each built-in style (the same cat drawn in each), in web/public/comic-styles.
const styleSample = (id: string) => `/comic-styles/${id}.webp`;

export type ComicStartInput = { idea: string; genre: ComicGenre; panelCount: number; style: ComicStyleChoice };

/** 画漫画 start: one idea, three optional choices, and the comics drawn before. */
export function ComicStart({
    projects,
    busy,
    progress,
    onStart,
    onOpen,
    onDelete,
}: {
    projects: ComicProject[];
    busy: boolean;
    progress: string;
    onStart: (input: ComicStartInput) => void;
    onOpen: (id: string) => void;
    onDelete: (project: ComicProject) => void;
}) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const ideas = useMemo(() => t("comic.start.ideas", { returnObjects: true }) as string[], [t]);
    const [idea, setIdea] = useState("");
    const [genre, setGenre] = useState<ComicGenre>("funny");
    const [panelCount, setPanelCount] = useState<number>(4);
    const [style, setStyle] = useState<ComicStyleChoice>(COMIC_STYLES[0]);
    const [ideaPage, setIdeaPage] = useState(0);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [customOpen, setCustomOpen] = useState(false);
    const [customStyle, setCustomStyle] = useState("");
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => inputRef.current?.focus(), []);

    const start = () => {
        if (!idea.trim()) {
            message.info(t("comic.start.ideaRequired"));
            inputRef.current?.focus();
            return;
        }
        onStart({ idea: idea.trim(), genre, panelCount, style });
    };

    const shownIdeas = ideas
        .slice((ideaPage * 4) % ideas.length)
        .concat(ideas)
        .slice(0, 4);
    const builtIn = COMIC_STYLES.some((item) => item.id === style.id);

    return (
        <div className="h-full overflow-y-auto">
            <div className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 sm:pt-12">
                <div className="text-center">
                    <h1 className="text-2xl font-bold text-stone-950 sm:text-3xl dark:text-stone-50">{t("comic.start.title")}</h1>
                    <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">{t("comic.start.subtitle")}</p>
                </div>

                <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-(--skin-accent)/50 bg-white p-4 shadow-[0_10px_30px_rgba(124,58,237,0.08)] dark:bg-stone-900">
                    <textarea
                        ref={inputRef}
                        value={idea}
                        onChange={(event) => setIdea(event.target.value.slice(0, 300))}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) start();
                        }}
                        placeholder={t("comic.start.placeholder")}
                        rows={2}
                        className="w-full resize-none border-0 bg-transparent text-base leading-relaxed text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100"
                        data-testid="comic-idea"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Segmented size="small" value={panelCount} onChange={(value) => setPanelCount(Number(value))} options={COMIC_PANEL_COUNTS.map((count) => ({ value: count, label: t("comic.start.panels", { count }) }))} />
                        <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                            <Palette className="size-3.5" />
                            {style.name}
                        </span>
                        <span className="flex-1" />
                        <span className="text-xs text-stone-400">{t("comic.start.free")}</span>
                        <Button type="primary" icon={busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} disabled={busy} onClick={start} data-testid="comic-write">
                            {busy ? t("comic.start.writing") : t("comic.start.write")}
                        </Button>
                    </div>
                    {busy ? <div className="mt-2 truncate text-xs text-stone-400">{progress}</div> : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                    <span className="text-xs text-stone-500">{t("comic.start.tryThese")}</span>
                    {shownIdeas.map((item) => (
                        <button
                            key={item}
                            type="button"
                            className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-600 transition hover:border-(--skin-accent) hover:text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300"
                            onClick={() => setIdea(item)}
                        >
                            {item}
                        </button>
                    ))}
                    <button type="button" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-stone-500 hover:text-stone-900 dark:hover:text-stone-100" onClick={() => setIdeaPage((value) => value + 1)}>
                        <RefreshCw className="size-3" />
                        {t("comic.start.moreIdeas")}
                    </button>
                </div>

                <section className="mt-10">
                    <h2 className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-100">
                        {t("comic.start.genreTitle")} <span className="ml-1 text-xs font-normal text-stone-400">{t("comic.start.genreHint")}</span>
                    </h2>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                        {COMIC_GENRES.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setGenre(item.id)}
                                className={`rounded-xl border p-3 text-left transition ${genre === item.id ? "border-(--skin-accent) bg-(--skin-accent)/10" : "border-stone-200 bg-white hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900"}`}
                                data-testid={`comic-genre-${item.id}`}
                            >
                                <span className={`mb-2 flex size-8 items-center justify-center rounded-lg text-base ${GENRE_BG[item.id]}`}>{GENRE_ICONS[item.id]}</span>
                                <span className="block text-sm font-medium text-stone-900 dark:text-stone-100">{t(`comic.genres.${item.id}.name`)}</span>
                                <span className="mt-0.5 block text-xs leading-5 text-stone-500">{t(`comic.genres.${item.id}.desc`)}</span>
                                <span className="mt-1 block text-[11px] text-stone-400">{item.beats.join(" → ")}</span>
                            </button>
                        ))}
                    </div>
                </section>

                <section className="mt-8">
                    <h2 className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-100">
                        {t("comic.start.styleTitle")} <span className="ml-1 text-xs font-normal text-stone-400">{t("comic.start.styleHint")}</span>
                    </h2>
                    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-8">
                        {COMIC_STYLES.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setStyle(item)}
                                className={`overflow-hidden rounded-xl border-2 bg-white text-left dark:bg-stone-900 ${style.id === item.id ? "border-(--skin-accent)" : "border-transparent"}`}
                            >
                                <img src={styleSample(item.id)} alt="" loading="lazy" className="block h-24 w-full object-cover object-[50%_25%]" />
                                <span className="block px-2 py-1.5 text-xs font-medium text-stone-800 dark:text-stone-200">{item.name}</span>
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => setPickerOpen(true)}
                            className={`overflow-hidden rounded-xl border-2 bg-white text-left dark:bg-stone-900 ${!builtIn && style.id.startsWith("handraw:") ? "border-(--skin-accent)" : "border-transparent"}`}
                        >
                            {!builtIn && style.cover ? (
                                <img src={style.cover} alt="" className="block h-24 w-full object-cover" />
                            ) : (
                                <span className="relative block h-24">
                                    <img src={styleSample("handraw")} alt="" loading="lazy" className="size-full object-cover object-[50%_25%]" />
                                    <span className="absolute bottom-1 right-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] text-white">{t("comic.start.handrawCount")}</span>
                                </span>
                            )}
                            <span className="block truncate px-2 py-1.5 text-xs font-medium text-stone-800 dark:text-stone-200">{!builtIn && style.id.startsWith("handraw:") ? style.name : t("comic.start.handraw")}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setCustomOpen(true)}
                            className={`overflow-hidden rounded-xl border-2 bg-white text-left dark:bg-stone-900 ${style.id === "custom" ? "border-(--skin-accent)" : "border-dashed border-stone-300 dark:border-stone-700"}`}
                        >
                            <span className="flex h-24 items-center justify-center text-stone-400">✎</span>
                            <span className="block truncate px-2 py-1.5 text-xs font-medium text-stone-800 dark:text-stone-200">{style.id === "custom" ? style.name : t("comic.start.customStyle")}</span>
                        </button>
                    </div>
                </section>

                {projects.length ? (
                    <section className="mt-10">
                        <h2 className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-100">{t("comic.start.continue")}</h2>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {projects.map((project) => {
                                const cover = project.pages[project.page]?.image;
                                return (
                                    <div key={project.id} className="group flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-2.5 dark:border-stone-700 dark:bg-stone-900">
                                        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(project.id)}>
                                            {cover ? (
                                                <ComicImageView image={cover} className="h-16 w-11 shrink-0 rounded-md object-cover" />
                                            ) : (
                                                <span className="flex h-16 w-11 shrink-0 items-center justify-center rounded-md bg-stone-100 text-stone-400 dark:bg-stone-800">
                                                    <BookOpen className="size-4" />
                                                </span>
                                            )}
                                            <span className="min-w-0">
                                                <span className="block truncate text-sm font-medium text-stone-900 dark:text-stone-100">{project.title}</span>
                                                <span className="mt-0.5 block text-xs text-stone-500">
                                                    {t(`comic.steps.${project.step}`)} · {t("comic.start.panels", { count: project.panels.length })}
                                                </span>
                                            </span>
                                        </button>
                                        <Popconfirm title={t("comic.start.deleteConfirm")} okText={t("common.delete")} cancelText={t("common.cancel")} onConfirm={() => onDelete(project)}>
                                            <Button type="text" size="small" icon={<Trash2 className="size-4" />} className="opacity-60 group-hover:opacity-100" aria-label={t("common.delete")} />
                                        </Popconfirm>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ) : null}
            </div>

            <HandrawStylePicker
                open={pickerOpen}
                onClose={() => setPickerOpen(false)}
                onPick={(choice) => {
                    setStyle(choice);
                    setPickerOpen(false);
                }}
            />
            <Modal
                open={customOpen}
                title={t("comic.start.customStyle")}
                onCancel={() => setCustomOpen(false)}
                okText={t("comic.ok")}
                cancelText={t("common.cancel")}
                okButtonProps={{ disabled: !customStyle.trim() }}
                onOk={() => {
                    setStyle({ id: "custom", name: customStyle.trim().slice(0, 12), prompt: customStyle.trim() });
                    setCustomOpen(false);
                }}
            >
                <Input.TextArea value={customStyle} onChange={(event) => setCustomStyle(event.target.value.slice(0, 200))} rows={3} placeholder={t("comic.start.customStylePlaceholder")} />
            </Modal>
        </div>
    );
}
