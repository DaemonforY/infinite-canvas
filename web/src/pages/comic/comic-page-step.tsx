import { useEffect, useState } from "react";
import { Button, Input, Tooltip } from "antd";
import { Copy, ImagePlus, Layers, Lightbulb, LoaderCircle, RefreshCw, Sparkles, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatDuration } from "@/lib/image-utils";
import { pagePrompt, panelRects, panelSegments, type ComicProject, type PromptSegmentKind } from "@/lib/comic";
import { chosenSheet, sheetCharacters } from "./comic-api";
import { ComicImageView, LetteredPage } from "./comic-lettering";
import { BeatTag } from "./comic-story-step";

const SEGMENT_CLASS: Record<PromptSegmentKind, string> = {
    shot: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
    who: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
    action: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
    place: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
    style: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
    space: "bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
};
const SEGMENT_ORDER: PromptSegmentKind[] = ["shot", "who", "action", "place", "style", "space"];

/** Step 3: the whole page in one image, the prompt of each panel explained, and one-panel changes. */
export function ComicPageStep({
    project,
    busy,
    busyLabel,
    startedAt,
    onDraw,
    onRedrawPanel,
    onPickVersion,
    onCopy,
    onOpenInWorkbench,
}: {
    project: ComicProject;
    busy: boolean;
    busyLabel: string;
    startedAt: number;
    onDraw: () => void;
    onRedrawPanel: (index: number, instruction: string) => void;
    onPickVersion: (index: number) => void;
    onCopy: (text: string) => void;
    onOpenInWorkbench: (text: string) => void;
}) {
    const { t } = useTranslation();
    const [selected, setSelected] = useState(0);
    const [instruction, setInstruction] = useState("");
    const [elapsed, setElapsed] = useState(0);
    const page = project.pages[project.page];
    const rects = panelRects(project.panels.length);
    const panel = project.panels[Math.min(selected, project.panels.length - 1)];
    const segments = panel ? panelSegments(panel, project.characters, project.style) : [];
    const missingSheets = project.characters.filter((character) => !chosenSheet(character));

    useEffect(() => {
        if (!busy) return;
        const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [busy, startedAt]);

    const progress = busy ? (
        <div className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
            <LoaderCircle className="size-4 animate-spin text-(--skin-accent)" />
            {busyLabel} · {formatDuration(elapsed)}
        </div>
    ) : null;

    if (!page) {
        return (
            <div className="flex h-full items-center justify-center overflow-y-auto p-6">
                <div className="w-full max-w-xl rounded-2xl border border-stone-200 bg-white p-6 text-center dark:border-stone-700 dark:bg-stone-900">
                    <Layers className="mx-auto size-8 text-(--skin-accent)" />
                    <h2 className="mt-3 text-lg font-semibold text-stone-950 dark:text-stone-50">{t("comic.page.readyTitle")}</h2>
                    <p className="mt-2 text-sm leading-6 text-stone-500">{t("comic.page.readyDesc", { count: project.panels.length })}</p>
                    {project.characters.some((character) => chosenSheet(character)) ? (
                        <div className="mt-4 flex justify-center gap-2">
                            {project.characters.map((character) => {
                                const sheet = chosenSheet(character);
                                return sheet ? (
                                    <div key={character.id} className="text-xs text-stone-500">
                                        <ComicImageView image={sheet} className="mb-1 h-16 w-24 rounded-lg border border-stone-200 object-cover dark:border-stone-700" />
                                        {character.name}
                                    </div>
                                ) : null;
                            })}
                        </div>
                    ) : null}
                    {missingSheets.length ? <p className="mt-3 text-xs text-amber-600">{t("comic.page.missingSheets", { names: missingSheets.map((character) => character.name).join("、") })}</p> : null}
                    <div className="mt-5 flex flex-col items-center gap-2">
                        {busy ? (
                            progress
                        ) : (
                            <Button type="primary" size="large" icon={<Sparkles className="size-4" />} onClick={onDraw} data-testid="comic-draw-page">
                                {t("comic.page.draw")}
                            </Button>
                        )}
                        <span className="text-xs text-stone-400">{t("comic.page.cost")}</span>
                    </div>
                </div>
            </div>
        );
    }

    // The page prompt as it stands (a version made by a panel edit was drawn from an edit instruction).
    const fullPrompt = pagePrompt(project, sheetCharacters(project));

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 lg:flex-row lg:overflow-hidden lg:p-6">
            <div className="relative flex shrink-0 justify-center lg:h-full lg:min-h-0">
                <LetteredPage
                    image={page.image}
                    bubbles={page.bubbles}
                    className="w-full max-w-md shadow-lg lg:h-full lg:w-auto lg:max-w-none"
                    panelRects={rects}
                    selectedPanel={selected}
                    onSelectPanel={setSelected}
                    panelBadge={(index) => (index === selected ? <span className="absolute left-2 top-2 flex size-6 items-center justify-center rounded-full bg-(--skin-accent) text-xs font-semibold text-white">{index + 1}</span> : null)}
                />
                {busy ? <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white/70 dark:bg-stone-900/70">{progress}</div> : null}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3 lg:overflow-y-auto">
                <div className="flex flex-wrap items-center gap-2">
                    <Button icon={<RefreshCw className="size-4" />} disabled={busy} onClick={onDraw}>
                        {t("comic.page.again")}
                    </Button>
                    {project.pages.length > 1 ? (
                        <>
                            <span className="text-xs text-stone-400">{t("comic.page.versions")}</span>
                            {project.pages.map((item, index) => (
                                <Tooltip key={item.id} title={item.label || t("comic.page.versionN", { n: index + 1 })}>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => onPickVersion(index)}
                                        className={`h-12 w-8 overflow-hidden rounded border-2 ${index === project.page ? "border-(--skin-accent)" : "border-stone-200 dark:border-stone-700"}`}
                                    >
                                        <ComicImageView image={item.image} className="size-full object-cover" />
                                    </button>
                                </Tooltip>
                            ))}
                        </>
                    ) : null}
                    <span className="text-xs text-stone-400">{t("comic.page.cost")}</span>
                </div>

                {panel ? (
                    <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900" data-testid="comic-prompt-lesson">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                            <BeatTag beat={panel.beat} />
                            <b className="text-sm text-stone-900 dark:text-stone-100">{t("comic.page.lessonTitle", { n: selected + 1 })}</b>
                            <span className="ml-auto text-xs text-stone-400">{t("comic.page.pickPanel")}</span>
                        </div>
                        <div className="text-sm leading-8">
                            {segments.map((segment, index) => (
                                <span key={index}>
                                    <span className={`rounded px-1 py-0.5 ${SEGMENT_CLASS[segment.kind]}`}>{segment.text}</span>
                                    {index < segments.length - 1 ? "，" : ""}
                                </span>
                            ))}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
                            {SEGMENT_ORDER.map((kind) => (
                                <span key={kind} className="inline-flex items-center gap-1">
                                    <i className={`inline-block size-2.5 rounded-sm ${SEGMENT_CLASS[kind]}`} />
                                    {t(`comic.page.segments.${kind}`)}
                                </span>
                            ))}
                        </div>
                        <div className="mt-3 flex gap-2 rounded-lg bg-stone-50 p-2.5 text-xs leading-5 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-(--skin-accent)" />
                            <span>
                                <b className="text-stone-900 dark:text-stone-100">{t("comic.page.why")}</b>
                                {panel.note || t("comic.page.whyFallback")}
                            </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <Button size="small" icon={<Copy className="size-3.5" />} onClick={() => onCopy(fullPrompt)}>
                                {t("comic.page.copyPrompt")}
                            </Button>
                            <Button size="small" type="text" icon={<ImagePlus className="size-3.5" />} onClick={() => onOpenInWorkbench(fullPrompt)}>
                                {t("comic.page.openInWorkbench")}
                            </Button>
                        </div>
                    </div>
                ) : null}

                <div className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                    <div className="flex gap-2">
                        <Input
                            value={instruction}
                            onChange={(event) => setInstruction(event.target.value)}
                            placeholder={t("comic.page.changePlaceholder", { n: selected + 1 })}
                            onPressEnter={() => instruction.trim() && !busy && onRedrawPanel(selected, instruction)}
                            disabled={busy}
                        />
                        <Button type="primary" icon={<WandSparkles className="size-4" />} disabled={busy || !instruction.trim()} onClick={() => onRedrawPanel(selected, instruction)}>
                            {t("comic.page.change")}
                        </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-400">
                        {t("comic.page.changeHint")}
                        <Button size="small" type="link" className="!px-0" disabled={busy} onClick={() => onRedrawPanel(selected, t("comic.page.redrawAsk"))}>
                            {t("comic.page.redrawPanel", { n: selected + 1 })}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
