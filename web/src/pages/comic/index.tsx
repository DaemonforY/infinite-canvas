import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Input, Spin } from "antd";
import { ArrowLeft, ArrowRight, Check, ChevronLeft } from "lucide-react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { saveAs } from "file-saver";

import { useCopyText } from "@/hooks/use-copy-text";
import { episodeSummary, fallbackTitle, pagePrompt, type ComicBubble, type ComicCellVersion, type ComicCharacter, type ComicLayoutId, type ComicMode, type ComicPanel, type ComicProject, type ComicStep, type ComicStory } from "@/lib/comic";
import { placeCellBubbles, placeSlideBubbles, renderScene, SLIDE_HEIGHT, SLIDE_WIDTH } from "@/lib/comic-layout";
import { createZip } from "@/lib/zip";
import { promptAssistConfig } from "@/lib/prompt-assist";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { modelOptionName, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { usePublishWorkStore } from "@/stores/use-publish-work-store";
import { isWeChatBrowser, membershipLink, useSaveImage } from "../image/use-save-image";
import { drawCell, drawCharacterSheet, drawPage, editCell, letter, panelPrompt, redrawPanel, sceneSource, sheetCharacters, slideBubbles, slideSource, storyOf, writeInsertedSlide, writeNote, writeStory } from "./comic-api";
import { resolveScene } from "./comic-lettering";
import { SlideGallery } from "./comic-slide-gallery";
import { ComicSlidesLetterStep } from "./comic-slides-letter";
import { ComicCharactersStep } from "./comic-characters-step";
import { ComicLetterStep } from "./comic-letter-step";
import { ComicPageStep } from "./comic-page-step";
import { ComicStart, type ComicStartInput } from "./comic-start";
import { COMICS_SYNCED_EVENT, deleteComic, listComics, readComic, saveComic, seriesEpisodes } from "./comic-store";
import { fromLibrary, mergeCast, saveToLibrary, type LibraryCharacter } from "./comic-library";
import { LibraryPicker, NextEpisodeModal } from "./comic-series";
import { ComicStoryStep } from "./comic-story-step";

const STEPS: ComicStep[] = ["story", "characters", "page", "letter"];

/** Turns the model's story into project fields, keeping the design sheets of characters that stay. */
function applyStory(project: Pick<ComicProject, "characters"> & { panels?: ComicPanel[] }, story: ComicStory) {
    const characters: ComicCharacter[] = story.characters.map((item) => {
        const existing = project.characters.find((character) => character.name === item.name);
        return existing ? { ...existing, role: item.role || existing.role, look: existing.sheet >= 0 ? existing.look : item.look || existing.look } : { id: nanoid(), name: item.name, role: item.role, look: item.look, sheets: [], sheet: -1 };
    });
    // Panel ids stay by position, so panels already drawn one by one (逐格) keep their art.
    const panels: ComicPanel[] = story.panels.map((panel, index) => ({ ...panel, id: project.panels?.[index]?.id || nanoid() }));
    return { characters, panels };
}

/** A new 小红书多图 project: drawn slide by slide (逐格) with the model's cover titles. */
function slideFields(story: ComicStory, cta: boolean): Partial<ComicProject> {
    return { format: "slides", mode: "cells", cta, coverTitles: story.coverTitles || [], coverTitle: story.coverTitles?.[0] || story.title };
}

export default function ComicPage() {
    const { id } = useParams();
    return id ? <ComicEditor key={id} id={id} /> : <ComicHome />;
}

function useReadyCheck() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const imageConfig: AiConfig = { ...effectiveConfig, model };
    const ready = (config: AiConfig) => {
        if (isAiConfigReady(config, config.model)) return true;
        message.warning(t("workbench.configFirst"));
        openConfigDialog(true);
        return false;
    };
    return { effectiveConfig, imageConfig, readyText: () => ready(promptAssistConfig(effectiveConfig)), readyImage: () => ready(imageConfig) };
}

function errorText(error: unknown, fallback: string) {
    return error instanceof Error && error.message ? error.message : fallback;
}

/** Writing a story starts a project: a new comic from the start page, or the next episode of a series. */
function useStoryStarter() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { effectiveConfig, readyText } = useReadyCheck();
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState("");

    const run = async (task: (onDelta: (text: string) => void) => Promise<ComicProject>) => {
        if (!readyText()) return false;
        setBusy(true);
        setProgress(t("comic.start.thinking"));
        try {
            const project = await task((text) => setProgress(t("comic.start.progress", { count: text.length })));
            await saveComic(project);
            navigate(`/comic/${project.id}`);
            return true;
        } catch (error) {
            message.error(error instanceof SyntaxError || (error instanceof Error && /no (json|panels)/.test(error.message)) ? t("comic.start.parseFailed") : errorText(error, t("comic.start.failed")));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const start = (input: ComicStartInput) =>
        run(async (onDelta) => {
            const cast = input.cast.map(fromLibrary);
            const story = await writeStory(effectiveConfig, { ...input, cast }, onDelta);
            const now = Date.now();
            return {
                id: nanoid(),
                title: story.title || fallbackTitle(input.idea),
                idea: input.idea,
                genre: input.genre,
                panelCount: story.panels.length,
                style: input.style,
                ...applyStory({ characters: cast }, story),
                ...(input.format === "slides" ? slideFields(story, input.cta) : {}),
                pages: [],
                page: 0,
                step: "story",
                createdAt: now,
                updatedAt: now,
            };
        });

    /** 画第 N 话: same cast (with their sheets), style, genre and panel count; the story continues the earlier ones. */
    const nextEpisode = (base: ComicProject, idea: string) =>
        run(async (onDelta) => {
            const episodes = seriesEpisodes(base, await listComics());
            const series = base.series || { id: base.id, title: base.title, episode: 1 };
            if (!base.series) await saveComic({ ...base, series });
            const episode = Math.max(...episodes.map((item) => item.series?.episode || 1), 1) + 1;
            const story = await writeStory(
                effectiveConfig,
                {
                    idea,
                    genre: base.genre,
                    panelCount: base.format === "slides" ? 0 : base.panels.length,
                    cast: base.characters,
                    episode,
                    previously: episodes.slice(-3).map((item) => episodeSummary(item.series ? item : { ...item, series })),
                    format: base.format,
                    cta: base.cta,
                },
                onDelta,
            );
            const now = Date.now();
            return {
                id: nanoid(),
                title: story.title || t("comic.series.episodeTitle", { title: series.title, n: episode }),
                idea: idea || t("comic.series.episodeTitle", { title: series.title, n: episode }),
                genre: base.genre,
                panelCount: story.panels.length,
                style: base.style,
                mode: base.mode,
                layout: base.layout,
                ...applyStory({ characters: base.characters }, story),
                ...(base.format === "slides" ? { ...slideFields(story, Boolean(base.cta)), pageNumbers: base.pageNumbers } : {}),
                pages: [],
                page: 0,
                step: "story",
                series: { id: series.id, title: series.title, episode },
                createdAt: now,
                updatedAt: now,
            };
        });

    return { busy, progress, start, nextEpisode };
}

function ComicHome() {
    const navigate = useNavigate();
    const starter = useStoryStarter();
    const [projects, setProjects] = useState<ComicProject[]>([]);
    const [nextOf, setNextOf] = useState<ComicProject | null>(null);

    useEffect(() => {
        const load = () => void listComics().then(setProjects);
        load();
        // Cloud sync replaced the comics on this device: show the merged list.
        window.addEventListener(COMICS_SYNCED_EVENT, load);
        return () => window.removeEventListener(COMICS_SYNCED_EVENT, load);
    }, []);

    const remove = async (items: ComicProject[]) => {
        for (const item of items) await deleteComic(item);
        setProjects(await listComics());
    };

    return (
        <>
            <ComicStart
                projects={projects}
                busy={starter.busy}
                progress={starter.progress}
                onStart={(input) => void starter.start(input)}
                onOpen={(projectId) => navigate(`/comic/${projectId}`)}
                onDelete={(items) => void remove(items)}
                onNextEpisode={setNextOf}
            />
            <NextEpisodeModal
                open={Boolean(nextOf)}
                seriesTitle={nextOf?.series?.title || nextOf?.title || ""}
                episode={nextOf ? seriesEpisodes(nextOf, projects).length + 1 : 2}
                busy={starter.busy}
                progress={starter.progress}
                onClose={() => setNextOf(null)}
                onStart={(idea) => nextOf && void starter.nextEpisode(nextOf, idea)}
            />
        </>
    );
}

function ComicEditor({ id }: { id: string }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const copyText = useCopyText();
    const addAsset = useAssetStore((state) => state.addAsset);
    const { save: saveImage, prepare, free, onSale, overlay } = useSaveImage();
    const { effectiveConfig, imageConfig, readyText, readyImage } = useReadyCheck();
    const [project, setProject] = useState<ComicProject | null | undefined>(undefined);
    const projectRef = useRef<ComicProject | null>(null);
    const saveTimer = useRef<number | undefined>(undefined);
    const mountedRef = useRef(true);
    const [storyBusy, setStoryBusy] = useState(false);
    const [drawing, setDrawing] = useState<Record<string, true>>({});
    const [pageBusy, setPageBusy] = useState<{ label: string; startedAt: number } | null>(null);
    const [cellBusy, setCellBusy] = useState<Record<string, number>>({});
    /** Panels waiting for a free drawing slot (two draw at a time). */
    const [cellQueued, setCellQueued] = useState<Record<string, true>>({});
    const starter = useStoryStarter();
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [nextOpen, setNextOpen] = useState(false);
    const [episodes, setEpisodes] = useState<ComicProject[]>([]);
    const [seriesPublishing, setSeriesPublishing] = useState(false);
    const [inserting, setInserting] = useState<number | null>(null);
    const [noteBusy, setNoteBusy] = useState(false);
    const [slidesBusy, setSlidesBusy] = useState(false);
    const [gallery, setGallery] = useState<{ urls: string[]; index: number; saving: boolean } | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        void readComic(id).then(async (value) => {
            projectRef.current = value;
            setProject(value);
            if (value) setEpisodes(seriesEpisodes(value, await listComics()));
        });
        // Leaving the page saves at once; a drawing still running files its result when it ends.
        return () => {
            window.clearTimeout(saveTimer.current);
            if (projectRef.current) void saveComic(projectRef.current);
        };
    }, [id]);

    /** Applies a change to the latest project (async results may land after other edits) and saves it soon. */
    const patch = useCallback((change: (current: ComicProject) => ComicProject) => {
        const current = projectRef.current;
        if (!current) return;
        const next = { ...change(current), updatedAt: Date.now() };
        projectRef.current = next;
        setProject(next);
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => void saveComic(next), 400);
        if (!mountedRef.current) void saveComic(next);
    }, []);

    if (project === undefined)
        return (
            <div className="flex h-full items-center justify-center">
                <Spin />
            </div>
        );
    if (project === null)
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-stone-500">
                {t("comic.notFound")}
                <Button onClick={() => navigate("/comic")}>{t("comic.backHome")}</Button>
            </div>
        );

    const stepIndex = STEPS.indexOf(project.step);
    const mode: ComicMode = project.mode || "page";
    const page = project.pages[project.page];
    const hasArt = mode === "page" ? Boolean(page) : project.panels.some((panel) => project.cells?.[panel.id]?.versions.length);
    const canEnter = (step: ComicStep) => (step === "letter" ? hasArt : true);
    // 逐格 lettering starts from the story's lines in default places, made once so the ids stay put.
    const goStep = (step: ComicStep) =>
        canEnter(step) &&
        patch((current) => ({
            ...current,
            step,
            ...(step === "letter" && (current.mode || "page") === "cells" && !current.cellBubbles
                ? { cellBubbles: current.format === "slides" ? placeSlideBubbles(current.panels, current.coverTitle || current.title, nanoid) : placeCellBubbles(current.panels, nanoid) }
                : {}),
        }));

    const rewrite = async (change: string, panelCount = project.panels.length) => {
        if (!readyText()) return;
        setStoryBusy(true);
        try {
            const story = await writeStory(effectiveConfig, { idea: project.idea, genre: project.genre, panelCount, previous: storyOf(project), change, format: project.format, cta: project.cta }, () => undefined);
            patch((current) => ({
                ...current,
                ...applyStory(current, story),
                panelCount: story.panels.length,
                title: current.title || story.title,
                cellBubbles: undefined,
                ...(current.format === "slides" && story.coverTitles?.length ? { coverTitles: story.coverTitles, coverTitle: story.coverTitles.includes(current.coverTitle || "") ? current.coverTitle : story.coverTitles[0] } : {}),
            }));
            message.success(t("comic.story.rewritten"));
        } catch (error) {
            message.error(error instanceof SyntaxError ? t("comic.start.parseFailed") : errorText(error, t("comic.start.failed")));
        } finally {
            setStoryBusy(false);
        }
    };

    const changeCharacter = (character: ComicCharacter) =>
        patch((current) => {
            const before = current.characters.find((item) => item.id === character.id);
            const renamed = before && before.name !== character.name ? { from: before.name, to: character.name } : null;
            return {
                ...current,
                characters: current.characters.map((item) => (item.id === character.id ? character : item)),
                panels: renamed
                    ? current.panels.map((panel) => ({
                          ...panel,
                          characters: panel.characters.map((name) => (name === renamed.from ? renamed.to : name)),
                          lines: panel.lines.map((line) => (line.speaker === renamed.from ? { ...line, speaker: renamed.to } : line)),
                      }))
                    : current.panels,
            };
        });

    const drawSheet = async (character: ComicCharacter) => {
        if (!readyImage()) return;
        setDrawing((value) => ({ ...value, [character.id]: true }));
        try {
            const sheet = await drawCharacterSheet(imageConfig, character, project.style);
            patch((current) => ({ ...current, characters: current.characters.map((item) => (item.id === character.id ? { ...item, sheets: [...item.sheets, sheet], sheet: item.sheets.length } : item)) }));
        } catch (error) {
            message.error(errorText(error, t("workbench.generationFailed")));
        } finally {
            setDrawing((value) => {
                const next = { ...value };
                delete next[character.id];
                return next;
            });
        }
    };

    const takePhoto = async (character: ComicCharacter, file: File) => {
        const stored = await uploadImage(file);
        const photo = { url: stored.url, ...(stored.storageKey ? { storageKey: stored.storageKey } : {}), width: stored.width, height: stored.height, mimeType: stored.mimeType };
        const next = { ...character, photo };
        changeCharacter(next);
        void drawSheet(next);
    };

    const runPage = async (label: string, task: () => Promise<ComicProject["pages"][number]>) => {
        if (!readyImage() || pageBusy) return;
        setPageBusy({ label, startedAt: Date.now() });
        try {
            const next = await task();
            patch((current) => ({ ...current, pages: [...current.pages, next], page: current.pages.length }));
            message.success(t("comic.page.done"));
        } catch (error) {
            message.error(errorText(error, t("workbench.generationFailed")));
        } finally {
            setPageBusy(null);
        }
    };

    /** 逐格: draws panels, two at a time (each takes a minute or two); each result becomes that panel's newest version. */
    const drawCells = async (indices: number[]) => {
        if (!readyImage()) return;
        const queue = indices.map((index) => project.panels[index]).filter((panel) => panel && !cellBusy[panel.id] && !cellQueued[panel.id]);
        setCellQueued((value) => ({ ...value, ...Object.fromEntries(queue.map((panel) => [panel.id, true as const])) }));
        const run = async (panel: ComicPanel) => {
            const current = projectRef.current!;
            const index = current.panels.findIndex((item) => item.id === panel.id);
            try {
                setCellQueued((value) => {
                    const next = { ...value };
                    delete next[panel.id];
                    return next;
                });
                if (index < 0) return;
                setCellBusy((value) => ({ ...value, [panel.id]: Date.now() }));
                addCellVersion(panel.id, await drawCell(imageConfig, current, index));
            } catch (error) {
                message.error(`${t("comic.panelN", { n: index + 1 })}：${errorText(error, t("workbench.generationFailed"))}`);
            } finally {
                setCellBusy((value) => {
                    const next = { ...value };
                    delete next[panel.id];
                    return next;
                });
            }
        };
        const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
            for (let item = queue.shift(); item; item = queue.shift()) await run(item);
        });
        await Promise.all(workers);
    };

    const addCellVersion = (panelId: string, version: ComicCellVersion) =>
        patch((current) => {
            const cell = current.cells?.[panelId];
            const versions = [...(cell?.versions || []), version];
            return { ...current, cells: { ...current.cells, [panelId]: { versions, version: versions.length - 1, focus: cell?.focus || { x: 0.5, y: 0.5 } } } };
        });

    const changeCell = async (index: number, instruction: string) => {
        const panel = project.panels[index];
        const cell = project.cells?.[panel.id];
        const base = cell?.versions[cell.version]?.image;
        if (!base || !readyImage() || cellBusy[panel.id]) return;
        setCellBusy((value) => ({ ...value, [panel.id]: Date.now() }));
        try {
            addCellVersion(panel.id, await editCell(imageConfig, projectRef.current!, index, base, instruction));
            message.success(t("comic.page.done"));
        } catch (error) {
            message.error(errorText(error, t("workbench.generationFailed")));
        } finally {
            setCellBusy((value) => {
                const next = { ...value };
                delete next[panel.id];
                return next;
            });
        }
    };

    const updateBubbles = (bubbles: ComicBubble[]) =>
        patch((current) => ((current.mode || "page") === "cells" ? { ...current, cellBubbles: bubbles } : { ...current, pages: current.pages.map((item, index) => (index === current.page ? { ...item, bubbles } : item)) }));

    const detect = async () => {
        if (!page) return;
        const fresh = await letter(project, page.image);
        const edited = new Map(page.bubbles.map((bubble) => [`${bubble.panel}:${bubble.line}`, bubble.text]));
        updateBubbles(fresh.map((bubble) => ({ ...bubble, text: edited.get(`${bubble.panel}:${bubble.line}`) ?? bubble.text })));
        message.success(t("comic.letter.detected", { count: fresh.filter((bubble) => !bubble.drawn).length }));
    };

    const source = sceneSource(project);

    const lettered = async () => {
        if (!source) throw new Error("no page");
        return renderScene(await resolveScene(source));
    };

    /** The prompt published with the comic: the page prompt, or every panel's prompt in order. */
    const comicPrompt = () =>
        mode === "page" ? pagePrompt(project, sheetCharacters(project)) : project.panels.map((_, index) => `【${t(project.format === "slides" ? "comic.slides.slideN" : "comic.panelN", { n: index + 1 })}】${panelPrompt(project, index)}`).join("\n\n");

    /** 小红书多图: every slide with its lettering, as PNG blobs. */
    const slideBlobs = async () => {
        const current = projectRef.current!;
        const bubbles = slideBubbles(current);
        const blobs: Blob[] = [];
        for (let i = 0; i < current.panels.length; i++) blobs.push(await renderScene(await resolveScene(slideSource(current, i, bubbles))));
        return blobs;
    };

    const preview = async (index: number) => {
        setSlidesBusy(true);
        try {
            setGallery({ urls: (await slideBlobs()).map((blob) => URL.createObjectURL(blob)), index, saving: false });
        } catch (error) {
            message.error(errorText(error, t("studio.save.failed")));
        } finally {
            setSlidesBusy(false);
        }
    };

    /** Saves every slide: watermarked unless 创作会员; a zip on a computer, one long-press at a time on phones / WeChat. */
    const saveAll = async () => {
        setSlidesBusy(true);
        try {
            const blobs = await slideBlobs();
            const ready: Blob[] = [];
            for (const blob of blobs) {
                const url = URL.createObjectURL(blob);
                ready.push(await prepare({ dataUrl: url, mimeType: "image/png", width: SLIDE_WIDTH, height: SLIDE_HEIGHT }));
                URL.revokeObjectURL(url);
            }
            const name = (project.coverTitle || project.title || "comic").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 30);
            if (isWeChatBrowser() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                setGallery({ urls: ready.map((blob) => URL.createObjectURL(blob)), index: 0, saving: true });
                return;
            }
            const ext = (blob: Blob) => (blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png");
            saveAs(await createZip(ready.map((blob, i) => ({ name: `${String(i + 1).padStart(2, "0")}.${ext(blob)}`, data: blob }))), `${name}.zip`);
            message.success(t("comic.slides.savedZip", { count: ready.length }));
        } catch (error) {
            message.error(errorText(error, t("studio.save.failed")));
        } finally {
            setSlidesBusy(false);
        }
    };

    const closeGallery = () =>
        setGallery((value) => {
            value?.urls.forEach((url) => URL.revokeObjectURL(url));
            return null;
        });

    const publishSlides = async () => {
        setSlidesBusy(true);
        try {
            const images: string[] = [];
            for (const blob of (await slideBlobs()).slice(0, 9)) images.push((await uploadImage(blob)).url);
            usePublishWorkStore.getState().open({
                images,
                prompt: comicPrompt(),
                title: project.coverTitle || project.title,
                model: modelOptionName(imageConfig.model),
                params: { size: `${SLIDE_WIDTH}x${SLIDE_HEIGHT}`, comic: "slides", slides: project.panels.length },
                source: "image_workbench",
                ...(project.series ? { collectionTitle: project.series.title } : {}),
            });
        } catch (error) {
            message.error(errorText(error, t("community.publish.failed")));
        } finally {
            setSlidesBusy(false);
        }
    };

    const writeNoteNow = async () => {
        if (!readyText()) return;
        setNoteBusy(true);
        try {
            const note = await writeNote(effectiveConfig, projectRef.current!);
            patch((current) => ({ ...current, note }));
        } catch (error) {
            message.error(error instanceof SyntaxError ? t("comic.start.parseFailed") : errorText(error, t("comic.start.failed")));
        } finally {
            setNoteBusy(false);
        }
    };

    const insertSlide = async (index: number) => {
        if (!readyText()) return;
        setInserting(index);
        try {
            const slide = await writeInsertedSlide(effectiveConfig, projectRef.current!, index);
            patch((current) => {
                const panels = [...current.panels];
                panels.splice(index + 1, 0, { ...slide, id: nanoid() });
                return { ...current, panels, cellBubbles: undefined };
            });
        } catch (error) {
            message.error(error instanceof SyntaxError ? t("comic.start.parseFailed") : errorText(error, t("comic.start.failed")));
        } finally {
            setInserting(null);
        }
    };

    const save = async () => {
        try {
            const blob = await lettered();
            const url = URL.createObjectURL(blob);
            await saveImage({ dataUrl: url, mimeType: "image/png", width: source?.width, height: source?.height }, project.title || "comic");
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch {
            message.error(t("studio.save.failed"));
        }
    };

    const publish = async () => {
        if (!source) return;
        const stored = await uploadImage(await lettered());
        usePublishWorkStore.getState().open({
            images: [stored.url],
            prompt: comicPrompt(),
            title: project.title,
            model: modelOptionName(imageConfig.model),
            params: { size: `${Math.round(source.width)}x${Math.round(source.height)}`, comic: mode },
            source: "image_workbench",
            ...(project.series ? { collectionTitle: project.series.title } : {}),
        });
    };

    const toAssets = async () => {
        if (!source) return;
        const stored = await uploadImage(await lettered());
        addAsset({
            kind: "image",
            title: project.title,
            coverUrl: stored.url,
            tags: [t("navigation.comic")],
            source: t("navigation.comic"),
            data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
            metadata: { source: "comic", prompt: comicPrompt() },
        });
        message.success(t("common.addedToAssets"));
    };

    const pickFromLibrary = (entries: LibraryCharacter[]) => {
        setLibraryOpen(false);
        if (entries.length) patch((current) => ({ ...current, characters: mergeCast(current.characters, entries) }));
    };

    const keepCharacter = async (character: ComicCharacter) => {
        try {
            const libraryId = await saveToLibrary(character, project.style.name);
            patch((current) => ({ ...current, characters: current.characters.map((item) => (item.id === character.id ? { ...item, libraryId } : item)) }));
            message.success(t("comic.library.saved", { name: character.name }));
        } catch {
            message.error(t("comic.library.needSheet"));
        }
    };

    const keepCast = async () => {
        const withSheets = project.characters.filter((character) => character.sheet >= 0);
        for (const character of withSheets) {
            const libraryId = await saveToLibrary(character, project.style.name);
            patch((current) => ({ ...current, characters: current.characters.map((item) => (item.id === character.id ? { ...item, libraryId } : item)) }));
        }
        message.success(withSheets.length ? t("comic.library.savedAll", { count: withSheets.length }) : t("comic.library.needSheet"));
    };

    const seriesTitle = project.series?.title || project.title;

    /** 发布整个系列: every episode with art (up to 9) as one work, in the series' collection. */
    const publishSeries = async () => {
        setSeriesPublishing(true);
        try {
            const all = seriesEpisodes(projectRef.current!, await listComics()).map((item) => (item.id === projectRef.current!.id ? projectRef.current! : item));
            const sources = all
                .map((item) => sceneSource(item))
                .filter((item): item is NonNullable<typeof item> => Boolean(item))
                .slice(0, 9);
            const images: string[] = [];
            for (const item of sources) images.push((await uploadImage(await renderScene(await resolveScene(item)))).url);
            usePublishWorkStore.getState().open({ images, title: seriesTitle, prompt: "", model: modelOptionName(imageConfig.model), params: { comic: "series", episodes: images.length }, source: "image_workbench", collectionTitle: seriesTitle });
        } catch (error) {
            message.error(errorText(error, t("community.publish.failed")));
        } finally {
            setSeriesPublishing(false);
        }
    };

    const next = STEPS[stepIndex + 1];
    const prev = STEPS[stepIndex - 1];

    return (
        <div className="flex h-full min-h-0 flex-col bg-stone-50 dark:bg-stone-950">
            <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-200 bg-white px-3 py-2 sm:px-5 dark:border-stone-800 dark:bg-stone-900">
                <Button type="text" size="small" icon={<ChevronLeft className="size-4" />} onClick={() => navigate("/comic")} aria-label={t("comic.backHome")} />
                <Input variant="borderless" value={project.title} onChange={(event) => patch((current) => ({ ...current, title: event.target.value.slice(0, 20) }))} className="!w-40 !px-0 font-semibold" />
                <nav className="order-last flex w-full items-center gap-1 overflow-x-auto sm:order-none sm:w-auto">
                    {STEPS.map((step, index) => {
                        const done = index < stepIndex;
                        const on = index === stepIndex;
                        return (
                            <div key={step} className="flex shrink-0 items-center">
                                {index ? <span className="mx-1 h-px w-5 bg-stone-300 dark:bg-stone-700" /> : null}
                                <button
                                    type="button"
                                    disabled={!canEnter(step)}
                                    onClick={() => goStep(step)}
                                    className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${on ? "font-semibold text-stone-950 dark:text-stone-50" : "text-stone-500"}`}
                                    data-testid={`comic-step-${step}`}
                                >
                                    <span
                                        className={`flex size-5 items-center justify-center rounded-full border text-[11px] ${done ? "border-(--skin-accent) bg-(--skin-accent) text-white" : on ? "border-(--skin-accent) text-(--skin-accent)" : "border-stone-300 dark:border-stone-600"}`}
                                    >
                                        {done ? <Check className="size-3" /> : index + 1}
                                    </span>
                                    {t(`comic.steps.${step}`)}
                                </button>
                            </div>
                        );
                    })}
                </nav>
                <span className="flex-1" />
                {prev ? (
                    <Button size="small" icon={<ArrowLeft className="size-3.5" />} onClick={() => goStep(prev)}>
                        <span className="max-sm:hidden">{t(`comic.steps.${prev}`)}</span>
                    </Button>
                ) : null}
                {next ? (
                    <Button size="small" type="primary" disabled={!canEnter(next) || storyBusy} onClick={() => goStep(next)} data-testid="comic-next">
                        {t("comic.nextStep", { step: t(`comic.steps.${next}`) })}
                        <ArrowRight className="size-3.5" />
                    </Button>
                ) : null}
            </div>

            <div className="min-h-0 flex-1">
                {project.step === "story" ? (
                    <ComicStoryStep
                        project={project}
                        busy={storyBusy}
                        // Lettering of slides is keyed by position: moving or removing slides starts it afresh.
                        onChange={(panels) => patch((current) => ({ ...current, panels, ...(panels.map((item) => item.id).join() !== current.panels.map((item) => item.id).join() ? { cellBubbles: undefined } : {}) }))}
                        onRewrite={(change, count) => void rewrite(change, count)}
                        onCoverTitle={(title) => patch((current) => ({ ...current, coverTitle: title, cellBubbles: current.cellBubbles?.map((bubble) => (bubble.panel === 0 && bubble.kind === "title" ? { ...bubble, text: title } : bubble)) }))}
                        onInsert={(index) => void insertSlide(index)}
                        inserting={inserting}
                    />
                ) : null}
                {project.step === "characters" ? (
                    <ComicCharactersStep
                        project={project}
                        drawing={drawing}
                        onChange={changeCharacter}
                        onOpenLibrary={() => setLibraryOpen(true)}
                        onKeep={(character) => void keepCharacter(character)}
                        onDraw={(character) => void drawSheet(character)}
                        onPhoto={(character, file) => void takePhoto(character, file)}
                        onAdd={() =>
                            patch((current) => ({
                                ...current,
                                characters: [...current.characters, { id: nanoid(), name: t("comic.cast.newName", { n: current.characters.length + 1 }), role: t("comic.cast.roleDefault"), look: "", sheets: [], sheet: -1 }],
                            }))
                        }
                        onRemove={(character) =>
                            patch((current) => ({
                                ...current,
                                characters: current.characters.filter((item) => item.id !== character.id),
                                panels: current.panels.map((panel) => ({ ...panel, characters: panel.characters.filter((name) => name !== character.name) })),
                            }))
                        }
                    />
                ) : null}
                {project.step === "page" ? (
                    <ComicPageStep
                        project={project}
                        pageBusy={pageBusy}
                        cellBusy={cellBusy}
                        cellQueued={cellQueued}
                        onMode={(value) => patch((current) => ({ ...current, mode: value }))}
                        onLayout={(value: ComicLayoutId) => patch((current) => ({ ...current, layout: value }))}
                        onDrawCells={(indices) => void drawCells(indices)}
                        onEditCell={(index, instruction) => void changeCell(index, instruction)}
                        onPickCellVersion={(index, version) =>
                            patch((current) => {
                                const id = current.panels[index].id;
                                const cell = current.cells?.[id];
                                return cell ? { ...current, cells: { ...current.cells, [id]: { ...cell, version } } } : current;
                            })
                        }
                        onDraw={() => void runPage(t("comic.page.drawing"), () => drawPage(imageConfig, projectRef.current!))}
                        onRedrawPanel={(index, instruction) => {
                            const current = projectRef.current!;
                            const base = current.pages[current.page];
                            if (base) void runPage(t("comic.page.redrawing", { n: index + 1 }), () => redrawPanel(imageConfig, current, base, index, instruction));
                        }}
                        onPickVersion={(index) => patch((current) => ({ ...current, page: index }))}
                        onCopy={(text) => copyText(text)}
                        onOpenInWorkbench={(text) => navigate(`/image?prompt=${encodeURIComponent(text.slice(0, 4000))}`)}
                    />
                ) : null}
                {project.step === "letter" && project.format === "slides" ? (
                    <ComicSlidesLetterStep
                        project={project}
                        bubbles={slideBubbles(project)}
                        busy={Boolean(pageBusy)}
                        free={free}
                        onSale={onSale}
                        membershipHref={membershipLink("comic-slides")}
                        noteBusy={noteBusy}
                        saving={slidesBusy}
                        onChange={updateBubbles}
                        onFocus={(panel, focus) =>
                            patch((current) => {
                                const id = current.panels[panel].id;
                                const cell = current.cells?.[id];
                                return cell ? { ...current, cells: { ...current.cells, [id]: { ...cell, focus } } } : current;
                            })
                        }
                        onPageNumbers={(on) => patch((current) => ({ ...current, pageNumbers: on }))}
                        onReset={() => updateBubbles(placeSlideBubbles(project.panels, project.coverTitle || project.title, nanoid))}
                        onPreview={(index) => void preview(index)}
                        onWriteNote={() => void writeNoteNow()}
                        onCopy={(text) => copyText(text)}
                        onSaveAll={() => void saveAll()}
                        onPublish={() => void publishSlides()}
                        onNextEpisode={() => setNextOpen(true)}
                    />
                ) : project.step === "letter" && source ? (
                    <ComicLetterStep
                        project={project}
                        source={source}
                        busy={Boolean(pageBusy)}
                        free={free}
                        onSale={onSale}
                        membershipHref={membershipLink("comic")}
                        onChange={updateBubbles}
                        onFocus={(panel, focus) =>
                            patch((current) => {
                                const id = current.panels[panel].id;
                                const cell = current.cells?.[id];
                                return cell ? { ...current, cells: { ...current.cells, [id]: { ...cell, focus } } } : current;
                            })
                        }
                        onLayout={(value) => patch((current) => ({ ...current, layout: value }))}
                        onReset={() => (mode === "cells" ? updateBubbles(placeCellBubbles(project.panels, nanoid)) : void detect())}
                        onSave={() => void save()}
                        onPublish={() => void publish()}
                        onAddToAssets={() => void toAssets()}
                        series={{ title: seriesTitle, episode: project.series?.episode || 1, count: episodes.length, publishing: seriesPublishing }}
                        onNextEpisode={() => setNextOpen(true)}
                        onKeepCast={() => void keepCast()}
                        onPublishSeries={() => void publishSeries()}
                    />
                ) : null}
            </div>
            {overlay}
            <SlideGallery
                open={Boolean(gallery)}
                images={gallery?.urls || []}
                startIndex={gallery?.index || 0}
                title={project.coverTitle || project.title}
                hint={gallery?.saving ? t("comic.slides.longPress") : undefined}
                onClose={closeGallery}
                footer={
                    gallery?.saving
                        ? (index, go) =>
                              index < (gallery?.urls.length || 0) - 1 ? (
                                  <Button type="primary" onClick={() => go(index + 1)}>
                                      {t("comic.slides.savedNext", { n: index + 1, count: gallery?.urls.length || 0 })}
                                  </Button>
                              ) : (
                                  <div className="flex flex-col items-center gap-2 text-center text-sm">
                                      <span>{t("comic.slides.allSaved", { count: gallery?.urls.length || 0 })}</span>
                                      {project.note ? <Button onClick={() => copyText(`${project.note!.title}\n\n${project.note!.body}\n\n${project.note!.tags.map((tag) => `#${tag}`).join(" ")}`)}>{t("comic.slides.copyNote")}</Button> : null}
                                  </div>
                              )
                        : undefined
                }
            />
            <LibraryPicker open={libraryOpen} onClose={() => setLibraryOpen(false)} onPick={pickFromLibrary} />
            <NextEpisodeModal
                open={nextOpen}
                seriesTitle={seriesTitle}
                episode={Math.max(project.series?.episode || 1, ...episodes.map((item) => item.series?.episode || 1)) + 1}
                busy={starter.busy}
                progress={starter.progress}
                onClose={() => setNextOpen(false)}
                onStart={(idea) => void starter.nextEpisode(projectRef.current!, idea)}
            />
        </div>
    );
}
