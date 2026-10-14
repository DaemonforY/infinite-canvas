import { useCallback, useEffect, useRef, useState } from "react";
import { App, Button, Input, Spin } from "antd";
import { ArrowLeft, ArrowRight, Check, ChevronLeft } from "lucide-react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";

import { useCopyText } from "@/hooks/use-copy-text";
import { fallbackTitle, pagePrompt, renderLetteredPage, type ComicBubble, type ComicCharacter, type ComicPanel, type ComicProject, type ComicStep, type ComicStory } from "@/lib/comic";
import { promptAssistConfig } from "@/lib/prompt-assist";
import { uploadImage } from "@/services/image-storage";
import { useAssetStore } from "@/stores/use-asset-store";
import { modelOptionName, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { usePublishWorkStore } from "@/stores/use-publish-work-store";
import { membershipLink, useSaveImage } from "../image/use-save-image";
import { comicImageUrl, drawCharacterSheet, drawPage, letter, redrawPanel, sheetCharacters, storyOf, writeStory } from "./comic-api";
import { ComicCharactersStep } from "./comic-characters-step";
import { ComicLetterStep } from "./comic-letter-step";
import { ComicPageStep } from "./comic-page-step";
import { ComicStart, type ComicStartInput } from "./comic-start";
import { deleteComic, listComics, readComic, saveComic } from "./comic-store";
import { ComicStoryStep } from "./comic-story-step";

const STEPS: ComicStep[] = ["story", "characters", "page", "letter"];

/** Turns the model's story into project fields, keeping the design sheets of characters that stay. */
function applyStory(project: Pick<ComicProject, "characters">, story: ComicStory) {
    const characters: ComicCharacter[] = story.characters.map((item) => {
        const existing = project.characters.find((character) => character.name === item.name);
        return existing ? { ...existing, role: item.role || existing.role, look: existing.sheet >= 0 ? existing.look : item.look || existing.look } : { id: nanoid(), name: item.name, role: item.role, look: item.look, sheets: [], sheet: -1 };
    });
    const panels: ComicPanel[] = story.panels.map((panel) => ({ ...panel, id: nanoid() }));
    return { characters, panels };
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

function ComicHome() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const { effectiveConfig, readyText } = useReadyCheck();
    const [projects, setProjects] = useState<ComicProject[]>([]);
    const [busy, setBusy] = useState(false);
    const [progress, setProgress] = useState("");

    useEffect(() => {
        void listComics().then(setProjects);
    }, []);

    const start = async (input: ComicStartInput) => {
        if (!readyText()) return;
        setBusy(true);
        setProgress(t("comic.start.thinking"));
        try {
            const story = await writeStory(effectiveConfig, input, (text) => setProgress(t("comic.start.progress", { count: text.length })));
            const now = Date.now();
            const project: ComicProject = {
                id: nanoid(),
                title: story.title || fallbackTitle(input.idea),
                idea: input.idea,
                genre: input.genre,
                panelCount: story.panels.length,
                style: input.style,
                ...applyStory({ characters: [] }, story),
                pages: [],
                page: 0,
                step: "story",
                createdAt: now,
                updatedAt: now,
            };
            await saveComic(project);
            navigate(`/comic/${project.id}`);
        } catch (error) {
            message.error(error instanceof SyntaxError || (error instanceof Error && /no (json|panels)/.test(error.message)) ? t("comic.start.parseFailed") : errorText(error, t("comic.start.failed")));
        } finally {
            setBusy(false);
        }
    };

    const remove = async (project: ComicProject) => {
        await deleteComic(project);
        setProjects(await listComics());
    };

    return <ComicStart projects={projects} busy={busy} progress={progress} onStart={start} onOpen={(projectId) => navigate(`/comic/${projectId}`)} onDelete={(project) => void remove(project)} />;
}

function ComicEditor({ id }: { id: string }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const copyText = useCopyText();
    const addAsset = useAssetStore((state) => state.addAsset);
    const { save: saveImage, free, onSale, overlay } = useSaveImage();
    const { effectiveConfig, imageConfig, readyText, readyImage } = useReadyCheck();
    const [project, setProject] = useState<ComicProject | null | undefined>(undefined);
    const projectRef = useRef<ComicProject | null>(null);
    const saveTimer = useRef<number | undefined>(undefined);
    const mountedRef = useRef(true);
    const [storyBusy, setStoryBusy] = useState(false);
    const [drawing, setDrawing] = useState<Record<string, true>>({});
    const [pageBusy, setPageBusy] = useState<{ label: string; startedAt: number } | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        void readComic(id).then((value) => {
            projectRef.current = value;
            setProject(value);
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
    const page = project.pages[project.page];
    const canEnter = (step: ComicStep) => (step === "letter" ? Boolean(page) : true);
    const goStep = (step: ComicStep) => canEnter(step) && patch((current) => ({ ...current, step }));

    const rewrite = async (change: string, panelCount = project.panels.length) => {
        if (!readyText()) return;
        setStoryBusy(true);
        try {
            const story = await writeStory(effectiveConfig, { idea: project.idea, genre: project.genre, panelCount, previous: storyOf(project), change }, () => undefined);
            patch((current) => ({ ...current, ...applyStory(current, story), panelCount: story.panels.length, title: current.title || story.title }));
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

    const updateBubbles = (bubbles: ComicBubble[]) => patch((current) => ({ ...current, pages: current.pages.map((item, index) => (index === current.page ? { ...item, bubbles } : item)) }));

    const detect = async () => {
        if (!page) return;
        const fresh = await letter(project, page.image);
        const edited = new Map(page.bubbles.map((bubble) => [`${bubble.panel}:${bubble.line}`, bubble.text]));
        updateBubbles(fresh.map((bubble) => ({ ...bubble, text: edited.get(`${bubble.panel}:${bubble.line}`) ?? bubble.text })));
        message.success(t("comic.letter.detected", { count: fresh.filter((bubble) => !bubble.drawn).length }));
    };

    const lettered = async () => {
        if (!page) throw new Error("no page");
        return renderLetteredPage(await comicImageUrl(page.image), page.bubbles);
    };

    const save = async () => {
        try {
            const blob = await lettered();
            const url = URL.createObjectURL(blob);
            await saveImage({ dataUrl: url, mimeType: "image/png", width: page?.image.width, height: page?.image.height }, project.title || "comic");
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch {
            message.error(t("studio.save.failed"));
        }
    };

    const publish = async () => {
        if (!page) return;
        const stored = await uploadImage(await lettered());
        usePublishWorkStore
            .getState()
            .open({
                images: [stored.url],
                prompt: pagePrompt(project, sheetCharacters(project)),
                title: project.title,
                model: modelOptionName(imageConfig.model),
                params: { size: `${page.image.width}x${page.image.height}`, comic: true },
                source: "image_workbench",
            });
    };

    const toAssets = async () => {
        if (!page) return;
        const stored = await uploadImage(await lettered());
        addAsset({
            kind: "image",
            title: project.title,
            coverUrl: stored.url,
            tags: [t("navigation.comic")],
            source: t("navigation.comic"),
            data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
            metadata: { source: "comic", prompt: pagePrompt(project, sheetCharacters(project)) },
        });
        message.success(t("common.addedToAssets"));
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
                {project.step === "story" ? <ComicStoryStep project={project} busy={storyBusy} onChange={(panels) => patch((current) => ({ ...current, panels }))} onRewrite={(change, count) => void rewrite(change, count)} /> : null}
                {project.step === "characters" ? (
                    <ComicCharactersStep
                        project={project}
                        drawing={drawing}
                        onChange={changeCharacter}
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
                        busy={Boolean(pageBusy)}
                        busyLabel={pageBusy?.label || ""}
                        startedAt={pageBusy?.startedAt || 0}
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
                {project.step === "letter" ? (
                    <ComicLetterStep
                        project={project}
                        busy={Boolean(pageBusy)}
                        free={free}
                        onSale={onSale}
                        membershipHref={membershipLink("comic")}
                        onChange={updateBubbles}
                        onDetect={() => void detect()}
                        onSave={() => void save()}
                        onPublish={() => void publish()}
                        onAddToAssets={() => void toAssets()}
                    />
                ) : null}
            </div>
            {overlay}
        </div>
    );
}
