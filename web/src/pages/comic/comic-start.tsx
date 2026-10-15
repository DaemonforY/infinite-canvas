import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Input, Modal, Popconfirm, Segmented, Slider, Switch } from "antd";
import { BookOpen, GalleryHorizontal, LoaderCircle, Palette, Plus, RefreshCw, Sparkles, Trash2, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";

import { COMIC_GENRES, COMIC_PANEL_COUNTS, COMIC_STYLES, type ComicFormat, type ComicGenre, type ComicProject, type ComicStyleChoice } from "@/lib/comic";
import { HandrawStylePicker } from "./handraw-style-picker";
import { listLibrary, type LibraryCharacter } from "./comic-library";
import { LibraryPicker } from "./comic-series";
import { ComicSyncBar } from "./comic-sync-bar";
import { SlideGallery } from "./comic-slide-gallery";
import { ComicImageView } from "./comic-lettering";

const GENRE_ICONS: Record<ComicGenre, string> = { funny: "😹", work: "💼", romance: "💕", science: "🔬", brand: "🏷️" };
const GENRE_BG: Record<ComicGenre, string> = { funny: "bg-amber-100", work: "bg-sky-100", romance: "bg-pink-100", science: "bg-emerald-100", brand: "bg-violet-100" };
// A sample of each built-in style (the same cat drawn in each), in web/public/comic-styles.
const styleSample = (id: string) => `/comic-styles/${id}.webp`;

export type ComicStartInput = { idea: string; genre: ComicGenre; panelCount: number; style: ComicStyleChoice; cast: LibraryCharacter[]; format: ComicFormat; cta: boolean };

// Finished 小红书多图 comics shown as examples (web/public/comic-samples, drawn with this feature's prompts): one
// slide per scene, and one with a two-panel slide and the 白底黑字 title.
const sampleUrl = (name: string) => `/comic-samples/${name}.webp`;
const SAMPLES = [
    { key: "work", slides: ["xhs-1", "xhs-2", "xhs-3", "xhs-4", "xhs-5", "xhs-6", "xhs-7"] },
    { key: "phone", slides: ["xhs2-1", "xhs2-2", "xhs2-3", "xhs2-4", "xhs2-5"] },
];

/** 画漫画 start: one idea, three optional choices, and the comics drawn before. */
export function ComicStart({
    projects,
    busy,
    progress,
    onStart,
    onOpen,
    onDelete,
    onNextEpisode,
}: {
    projects: ComicProject[];
    busy: boolean;
    progress: string;
    onStart: (input: ComicStartInput) => void;
    onOpen: (id: string) => void;
    /** Deletes a comic: every episode of a series. */
    onDelete: (projects: ComicProject[]) => void;
    /** 画第 N 话 from the latest episode. */
    onNextEpisode: (latest: ComicProject) => void;
}) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const ideas = useMemo(() => t("comic.start.ideas", { returnObjects: true }) as string[], [t]);
    const [idea, setIdea] = useState("");
    const [genre, setGenre] = useState<ComicGenre>("funny");
    const [panelCount, setPanelCount] = useState<number>(4);
    const [format, setFormat] = useState<ComicFormat>("page");
    /** 小红书多图: 0 lets the model choose (5–9). */
    const [slideCount, setSlideCount] = useState(0);
    const [cta, setCta] = useState(true);
    const [sampleOpen, setSampleOpen] = useState(false);
    const [sample, setSample] = useState(0);
    const [style, setStyle] = useState<ComicStyleChoice>(COMIC_STYLES[0]);
    const [ideaPage, setIdeaPage] = useState(0);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [customOpen, setCustomOpen] = useState(false);
    const [customStyle, setCustomStyle] = useState("");
    const [cast, setCast] = useState<LibraryCharacter[]>([]);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [libraryCount, setLibraryCount] = useState(0);

    useEffect(() => {
        if (!libraryOpen) void listLibrary().then((items) => setLibraryCount(items.length));
    }, [libraryOpen]);

    // Episodes of a series are shown together, newest series first.
    const groups = useMemo(() => {
        const map = new Map<string, ComicProject[]>();
        for (const project of projects) {
            const key = project.series?.id || project.id;
            map.set(key, [...(map.get(key) || []), project]);
        }
        return [...map.values()].map((items) => items.sort((a, b) => (a.series?.episode || 1) - (b.series?.episode || 1)));
    }, [projects]);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => inputRef.current?.focus(), []);

    const start = () => {
        if (!idea.trim()) {
            message.info(t("comic.start.ideaRequired"));
            inputRef.current?.focus();
            return;
        }
        onStart({ idea: idea.trim(), genre, panelCount: format === "slides" ? slideCount : panelCount, style, cast, format, cta: format === "slides" && cta });
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
                        {format === "page" ? (
                            <Segmented size="small" value={panelCount} onChange={(value) => setPanelCount(Number(value))} options={COMIC_PANEL_COUNTS.map((count) => ({ value: count, label: t("comic.start.panels", { count }) }))} />
                        ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                                <GalleryHorizontal className="size-3.5" />
                                {slideCount ? t("comic.slides.count", { count: slideCount }) : t("comic.slides.auto")}
                            </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                            <Palette className="size-3.5" />
                            {style.name}
                        </span>
                        <button
                            type="button"
                            onClick={() => setLibraryOpen(true)}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${cast.length ? "bg-(--skin-accent)/15 text-(--skin-accent)" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"}`}
                            data-testid="comic-use-cast"
                        >
                            <UserRound className="size-3.5" />
                            {cast.length ? cast.map((item) => item.name).join("、") : t("comic.library.useMine")}
                        </button>
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

                <section className="mx-auto mt-8 max-w-3xl">
                    <h2 className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-100">
                        {t("comic.slides.formatTitle")} <span className="ml-1 text-xs font-normal text-stone-400">{t("comic.slides.formatHint")}</span>
                    </h2>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setFormat("page")}
                            className={`flex gap-3 rounded-xl border-2 bg-white p-3 text-left dark:bg-stone-900 ${format === "page" ? "border-(--skin-accent)" : "border-stone-200 dark:border-stone-700"}`}
                            data-testid="comic-format-page"
                        >
                            <img src={sampleUrl("page")} alt="" className="h-24 w-16 shrink-0 rounded-md object-cover object-top" />
                            <span>
                                <b className="block text-sm text-stone-900 dark:text-stone-100">{t("comic.slides.pageName")}</b>
                                <span className="mt-1 block text-xs leading-5 text-stone-500">{t("comic.slides.pageDesc")}</span>
                            </span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setFormat("slides")}
                            className={`flex gap-3 rounded-xl border-2 bg-white p-3 text-left dark:bg-stone-900 ${format === "slides" ? "border-rose-500" : "border-stone-200 dark:border-stone-700"}`}
                            data-testid="comic-format-slides"
                        >
                            <span className="flex h-24 shrink-0 gap-0.5">
                                {[1, 2, 3].map((n) => (
                                    <img key={n} src={sampleUrl(`xhs-${n}`)} alt="" className="h-24 w-[3.4rem] rounded-md object-cover" />
                                ))}
                            </span>
                            <span>
                                <b className="flex items-center gap-1.5 text-sm text-rose-600">
                                    {t("comic.slides.name")}
                                    <span className="rounded bg-teal-600 px-1 text-[10px] leading-4 text-white">{t("comic.slides.new")}</span>
                                </b>
                                <span className="mt-1 block text-xs leading-5 text-stone-500">{t("comic.slides.desc")}</span>
                                <span
                                    role="button"
                                    tabIndex={0}
                                    className="mt-1 inline-block text-xs text-rose-600 underline-offset-2 hover:underline"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setSampleOpen(true);
                                    }}
                                    data-testid="comic-slides-sample"
                                >
                                    {t("comic.slides.sample")} ›
                                </span>
                            </span>
                        </button>
                    </div>
                    {format === "slides" ? (
                        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-xl border border-rose-200 bg-rose-50/50 px-4 py-3 text-xs text-stone-600 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-stone-300">
                            <span className="flex items-center gap-2">
                                {t("comic.slides.howMany")}
                                <Segmented
                                    size="small"
                                    value={slideCount ? "manual" : "auto"}
                                    onChange={(value) => setSlideCount(value === "auto" ? 0 : 7)}
                                    options={[
                                        { value: "auto", label: t("comic.slides.autoShort") },
                                        { value: "manual", label: t("comic.slides.manual") },
                                    ]}
                                />
                            </span>
                            {slideCount ? (
                                <span className="flex min-w-56 flex-1 items-center gap-2">
                                    <Slider className="flex-1" min={3} max={18} value={slideCount} onChange={(value) => setSlideCount(Number(value))} />
                                    <span className="w-28 text-stone-500">{t("comic.slides.estimate", { count: slideCount, minutes: Math.max(1, Math.ceil(slideCount / 2)) })}</span>
                                </span>
                            ) : (
                                <span className="text-stone-400">{t("comic.slides.autoHint")}</span>
                            )}
                            <label className="flex items-center gap-1.5">
                                <Switch size="small" checked={cta} onChange={setCta} />
                                {t("comic.slides.cta")}
                            </label>
                        </div>
                    ) : null}
                </section>

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

                <section className="mt-10">
                    <h2 className="mb-3 text-sm font-semibold text-stone-900 dark:text-stone-100">{t("comic.start.continue")}</h2>
                    <ComicSyncBar />
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {groups.map((episodes) => {
                            const latest = episodes[episodes.length - 1];
                            const cover = [...episodes]
                                .reverse()
                                .map((item) => item.pages[item.page]?.image || Object.values(item.cells || {})[0]?.versions[0]?.image)
                                .find(Boolean);
                            const title = latest.series?.title || latest.title;
                            return (
                                <div key={latest.id} className="group flex gap-3 rounded-xl border border-stone-200 bg-white p-2.5 dark:border-stone-700 dark:bg-stone-900" data-testid="comic-series-card">
                                    <button type="button" className="shrink-0" onClick={() => onOpen(latest.id)}>
                                        {cover ? (
                                            <ComicImageView image={cover} className="h-20 w-14 rounded-md object-cover" />
                                        ) : (
                                            <span className="flex h-20 w-14 items-center justify-center rounded-md bg-stone-100 text-stone-400 dark:bg-stone-800">
                                                <BookOpen className="size-4" />
                                            </span>
                                        )}
                                    </button>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start gap-1">
                                            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(latest.id)}>
                                                <span className="block truncate text-sm font-medium text-stone-900 dark:text-stone-100">{title}</span>
                                                <span className="mt-0.5 block text-xs text-stone-500">
                                                    {episodes.length > 1 ? t("comic.series.count", { count: episodes.length }) : t(`comic.steps.${latest.step}`)} · {t("comic.start.panels", { count: latest.panels.length })}
                                                </span>
                                            </button>
                                            <Popconfirm
                                                title={episodes.length > 1 ? t("comic.series.deleteConfirm", { count: episodes.length }) : t("comic.start.deleteConfirm")}
                                                okText={t("common.delete")}
                                                cancelText={t("common.cancel")}
                                                onConfirm={() => onDelete(episodes)}
                                            >
                                                <Button type="text" size="small" icon={<Trash2 className="size-4" />} className="opacity-60 group-hover:opacity-100" aria-label={t("common.delete")} />
                                            </Popconfirm>
                                        </div>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                            {episodes.length > 1
                                                ? episodes.map((item) => (
                                                      <button
                                                          key={item.id}
                                                          type="button"
                                                          onClick={() => onOpen(item.id)}
                                                          className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300"
                                                      >
                                                          {t("comic.series.episodeShort", { n: item.series?.episode || 1 })}
                                                      </button>
                                                  ))
                                                : null}
                                            <button
                                                type="button"
                                                onClick={() => onNextEpisode(latest)}
                                                className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] text-(--skin-accent) hover:bg-(--skin-accent)/10"
                                                data-testid="comic-series-next"
                                            >
                                                <Plus className="size-3" />
                                                {t("comic.series.next", { n: (latest.series?.episode || 1) + 1 })}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <button
                            type="button"
                            onClick={() => setLibraryOpen(true)}
                            className="flex min-h-24 items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-stone-300 text-sm text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:text-stone-300"
                            data-testid="comic-library-card"
                        >
                            <UserRound className="size-4" />
                            {t("comic.library.mine", { count: libraryCount })}
                        </button>
                    </div>
                </section>
            </div>

            <SlideGallery
                key={sample}
                open={sampleOpen}
                title={t(`comic.slides.samples.${SAMPLES[sample].key}`)}
                images={SAMPLES[sample].slides.map((name) => sampleUrl(name))}
                onClose={() => setSampleOpen(false)}
                footer={() => (
                    <div className="flex flex-wrap justify-center gap-2" data-testid="comic-sample-switch">
                        {SAMPLES.map((item, index) => (
                            <button key={item.key} type="button" onClick={() => setSample(index)} className={`rounded-full px-3 py-1 text-xs ${index === sample ? "bg-rose-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"}`}>
                                {t(`comic.slides.samples.${item.key}`)}
                            </button>
                        ))}
                    </div>
                )}
            />
            <LibraryPicker
                open={libraryOpen}
                picked={cast.map((item) => item.id)}
                onClose={() => setLibraryOpen(false)}
                onPick={(entries) => {
                    setCast(entries);
                    setLibraryOpen(false);
                }}
            />
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
