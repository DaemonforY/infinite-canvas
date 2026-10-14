import { useEffect, useState } from "react";
import { Button, Input, Tooltip } from "antd";
import { Copy, Grid2x2, ImagePlus, Layers, Lightbulb, LoaderCircle, RefreshCw, Sparkles, WandSparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { formatDuration } from "@/lib/image-utils";
import { cellPrompt, pagePrompt, panelSegments, type ComicLayoutId, type ComicMode, type ComicProject, type PromptSegmentKind } from "@/lib/comic";
import { COMIC_LAYOUTS, layoutPage } from "@/lib/comic-layout";
import { cellRatio, chosenSheet, panelPrompt, panelSheetCharacters, sceneSource, scenePanelRects, sheetCharacters } from "./comic-api";
import { ComicImageView, ComicSceneView } from "./comic-lettering";
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

/** Elapsed time of a running job, refreshed every second. */
function useElapsed(startedAt: number | undefined) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!startedAt) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [startedAt]);
    return startedAt ? Math.max(0, now - startedAt) : 0;
}

function Progress({ label, startedAt }: { label: string; startedAt: number }) {
    const elapsed = useElapsed(startedAt);
    return (
        <div className="flex items-center gap-2 text-sm text-stone-600 dark:text-stone-300">
            <LoaderCircle className="size-4 animate-spin text-(--skin-accent)" />
            {label} · {formatDuration(elapsed)}
        </div>
    );
}

export type ComicPageStepProps = {
    project: ComicProject;
    /** 整页: the running page job. */
    pageBusy: { label: string; startedAt: number } | null;
    /** 逐格: panels being drawn, by panel id (start time). */
    cellBusy: Record<string, number>;
    /** 逐格 / slides waiting for a free drawing slot. */
    cellQueued?: Record<string, true>;
    onMode: (mode: ComicMode) => void;
    onLayout: (layout: ComicLayoutId) => void;
    onDraw: () => void;
    onRedrawPanel: (index: number, instruction: string) => void;
    onPickVersion: (index: number) => void;
    onDrawCells: (indices: number[]) => void;
    onEditCell: (index: number, instruction: string) => void;
    onPickCellVersion: (index: number, version: number) => void;
    onCopy: (text: string) => void;
    onOpenInWorkbench: (text: string) => void;
};

/** Step 3: the whole page in one image, or every panel on its own; each panel's prompt explained. */
export function ComicPageStep(props: ComicPageStepProps) {
    const { t } = useTranslation();
    const { project } = props;
    const mode = project.mode || "page";
    const busy = Boolean(props.pageBusy) || Object.keys(props.cellBusy).length > 0;
    if (project.format === "slides") return <SlidesMode {...props} />;
    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="grid shrink-0 grid-cols-2 gap-2 px-4 pt-3 lg:px-6">
                {(["page", "cells"] as ComicMode[]).map((item) => (
                    <button
                        key={item}
                        type="button"
                        disabled={busy && item !== mode}
                        onClick={() => props.onMode(item)}
                        className={`flex items-start gap-2 rounded-xl border-[1.5px] px-3 py-2 text-left transition disabled:opacity-50 ${mode === item ? "border-(--skin-accent) bg-(--skin-accent)/10" : "border-stone-200 bg-white hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900"}`}
                        data-testid={`comic-mode-${item}`}
                    >
                        {item === "page" ? <Layers className="mt-0.5 size-4 shrink-0 text-(--skin-accent)" /> : <Grid2x2 className="mt-0.5 size-4 shrink-0 text-(--skin-accent)" />}
                        <span className="min-w-0">
                            <b className="block text-sm text-stone-900 dark:text-stone-100">
                                {t(`comic.page.modes.${item}.name`)}
                                {item === "page" ? <span className="ml-1.5 rounded bg-(--skin-accent)/15 px-1 text-[11px] font-medium text-(--skin-accent)">{t("comic.page.recommended")}</span> : null}
                            </b>
                            <span className="block text-xs leading-5 text-stone-500 max-sm:hidden">{t(`comic.page.modes.${item}.desc`)}</span>
                        </span>
                    </button>
                ))}
            </div>
            <div className="min-h-0 flex-1">{mode === "page" ? <PageMode {...props} /> : <CellsMode {...props} />}</div>
        </div>
    );
}

function PageMode({ project, pageBusy, onDraw, onRedrawPanel, onPickVersion, onCopy, onOpenInWorkbench }: ComicPageStepProps) {
    const { t } = useTranslation();
    const [selected, setSelected] = useState(0);
    const [instruction, setInstruction] = useState("");
    const page = project.pages[project.page];
    const source = sceneSource({ ...project, mode: "page" });
    const missingSheets = project.characters.filter((character) => !chosenSheet(character));
    const busy = Boolean(pageBusy);

    if (!page || !source) {
        return (
            <div className="flex h-full items-center justify-center overflow-y-auto p-6">
                <div className="w-full max-w-xl rounded-2xl border border-stone-200 bg-white p-6 text-center dark:border-stone-700 dark:bg-stone-900">
                    <Layers className="mx-auto size-8 text-(--skin-accent)" />
                    <h2 className="mt-3 text-lg font-semibold text-stone-950 dark:text-stone-50">{t("comic.page.readyTitle")}</h2>
                    <p className="mt-2 text-sm leading-6 text-stone-500">{t("comic.page.readyDesc", { count: project.panels.length })}</p>
                    <SheetStrip project={project} />
                    {missingSheets.length ? <p className="mt-3 text-xs text-amber-600">{t("comic.page.missingSheets", { names: missingSheets.map((character) => character.name).join("、") })}</p> : null}
                    <div className="mt-5 flex flex-col items-center gap-2">
                        {pageBusy ? (
                            <Progress label={pageBusy.label} startedAt={pageBusy.startedAt} />
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
                <ComicSceneView
                    source={source}
                    className="w-full max-w-md shadow-lg lg:h-full lg:w-auto lg:max-w-none"
                    panelRects={scenePanelRects(project, source)}
                    selectedPanel={selected}
                    onSelectPanel={setSelected}
                    panelBadge={(index) => (index === selected ? <PanelBadge n={index + 1} /> : null)}
                />
                {pageBusy ? (
                    <div className="absolute inset-0 flex items-center justify-center rounded-md bg-white/70 dark:bg-stone-900/70">
                        <Progress label={pageBusy.label} startedAt={pageBusy.startedAt} />
                    </div>
                ) : null}
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
                <PromptLesson project={project} index={selected} mode="page" fullPrompt={fullPrompt} copyLabel={t("comic.page.copyPrompt")} onCopy={onCopy} onOpenInWorkbench={onOpenInWorkbench} />
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

function CellsMode({ project, cellBusy, cellQueued = {}, onLayout, onDrawCells, onEditCell, onPickCellVersion, onCopy, onOpenInWorkbench }: ComicPageStepProps) {
    const { t } = useTranslation();
    const [selected, setSelected] = useState(0);
    const [instruction, setInstruction] = useState("");
    const source = sceneSource({ ...project, mode: "cells" })!;
    const rects = scenePanelRects(project, source);
    const index = Math.min(selected, project.panels.length - 1);
    const panel = project.panels[index];
    const cell = project.cells?.[panel.id];
    const current = cell?.versions[cell.version];
    const missing = project.panels.map((item, i) => (project.cells?.[item.id]?.versions.length || cellBusy[item.id] || cellQueued[item.id] ? -1 : i)).filter((i) => i >= 0);
    const drawnCount = project.panels.filter((item) => project.cells?.[item.id]?.versions.length).length;
    const panelBusy = Boolean(cellBusy[panel.id]);
    const anyBusy = Object.keys(cellBusy).length > 0;
    const prompt = cellPrompt(project, index, panelSheetCharacters(project, index), cellRatio(project, index));

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 lg:flex-row lg:overflow-hidden lg:p-6">
            <div className="flex shrink-0 justify-center lg:h-full lg:min-h-0">
                <ComicSceneView
                    source={source}
                    className="w-full max-w-md shadow-lg lg:h-full lg:w-auto lg:max-w-none"
                    panelRects={rects}
                    selectedPanel={index}
                    onSelectPanel={setSelected}
                    panelBadge={(i) => (i === index ? <PanelBadge n={i + 1} /> : null)}
                    panelOverlay={(i) => {
                        const id = project.panels[i].id;
                        if (cellBusy[id])
                            return (
                                <div className="absolute inset-0 flex items-center justify-center bg-white/75 dark:bg-stone-900/75">
                                    <Progress label={t("comic.page.cellDrawing")} startedAt={cellBusy[id]} />
                                </div>
                            );
                        if (!project.cells?.[id]?.versions.length) return <div className="absolute inset-0 flex items-center justify-center text-xs text-stone-400">{t("comic.page.cellEmpty", { n: i + 1 })}</div>;
                        return null;
                    }}
                />
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3 lg:overflow-y-auto">
                <LayoutPicker value={project.layout || "manga"} count={project.panels.length} disabled={anyBusy} onChange={onLayout} />
                <div className="flex flex-wrap items-center gap-2">
                    {missing.length ? (
                        <Button type="primary" icon={<Sparkles className="size-4" />} onClick={() => onDrawCells(missing)} data-testid="comic-draw-cells">
                            {drawnCount ? t("comic.page.drawRest", { count: missing.length }) : t("comic.page.drawAll", { count: missing.length })}
                        </Button>
                    ) : null}
                    <span className="text-xs text-stone-400">{t("comic.page.cellCost")}</span>
                </div>

                <div className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <BeatTag beat={panel.beat} />
                        <b className="text-sm text-stone-900 dark:text-stone-100">{t("comic.panelN", { n: index + 1 })}</b>
                        {cell && cell.versions.length > 1
                            ? cell.versions.map((version, v) => (
                                  <Tooltip key={version.createdAt} title={version.label || t("comic.page.versionN", { n: v + 1 })}>
                                      <button
                                          type="button"
                                          disabled={panelBusy}
                                          onClick={() => onPickCellVersion(index, v)}
                                          className={`h-8 w-11 overflow-hidden rounded border-2 ${v === cell.version ? "border-(--skin-accent)" : "border-stone-200 dark:border-stone-700"}`}
                                      >
                                          <ComicImageView image={version.image} className="size-full object-cover" />
                                      </button>
                                  </Tooltip>
                              ))
                            : null}
                        <span className="flex-1" />
                        <Button size="small" icon={current ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />} disabled={panelBusy} onClick={() => onDrawCells([index])}>
                            {current ? t("comic.page.redrawCell") : t("comic.page.drawCell")}
                        </Button>
                    </div>
                    {current ? (
                        <div className="flex gap-2">
                            <Input
                                value={instruction}
                                onChange={(event) => setInstruction(event.target.value)}
                                placeholder={t("comic.page.changePlaceholder", { n: index + 1 })}
                                onPressEnter={() => instruction.trim() && !panelBusy && onEditCell(index, instruction)}
                                disabled={panelBusy}
                            />
                            <Button type="primary" icon={<WandSparkles className="size-4" />} disabled={panelBusy || !instruction.trim()} onClick={() => onEditCell(index, instruction)}>
                                {t("comic.page.change")}
                            </Button>
                        </div>
                    ) : null}
                    <div className="mt-2 text-xs text-stone-400">{t("comic.page.cellHint")}</div>
                </div>

                <PromptLesson project={project} index={index} mode="cells" fullPrompt={prompt} copyLabel={t("comic.page.copyCellPrompt")} onCopy={onCopy} onOpenInWorkbench={onOpenInWorkbench} />
            </div>
        </div>
    );
}

/** 小红书多图: every slide is drawn on its own (like 逐格); a grid of slides and the selected one up close. */
function SlidesMode({ project, cellBusy, cellQueued = {}, onDrawCells, onEditCell, onPickCellVersion, onCopy, onOpenInWorkbench }: ComicPageStepProps) {
    const { t } = useTranslation();
    const [selected, setSelected] = useState(0);
    const [instruction, setInstruction] = useState("");
    const index = Math.min(selected, project.panels.length - 1);
    const panel = project.panels[index];
    const cell = project.cells?.[panel.id];
    const current = cell?.versions[cell.version];
    const panelBusy = Boolean(cellBusy[panel.id]);
    const missing = project.panels.map((item, i) => (project.cells?.[item.id]?.versions.length || cellBusy[item.id] || cellQueued[item.id] ? -1 : i)).filter((i) => i >= 0);
    const drawn = project.panels.filter((item) => project.cells?.[item.id]?.versions.length).length;

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 lg:flex-row lg:overflow-hidden lg:p-6">
            <div className="relative mx-auto aspect-[3/4] w-full max-w-sm shrink-0 overflow-hidden rounded-xl bg-stone-100 shadow-lg lg:mx-0 lg:h-full lg:w-auto lg:max-w-none dark:bg-stone-800">
                {current ? <ComicImageView image={current.image} className="absolute inset-0 size-full object-cover" /> : null}
                {panelBusy ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-stone-900/70">
                        <Progress label={t("comic.page.cellDrawing")} startedAt={cellBusy[panel.id]} />
                    </div>
                ) : !current ? (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-400">{cellQueued[panel.id] ? t("comic.slides.queued") : t("comic.slides.notDrawn", { n: index + 1 })}</div>
                ) : null}
                <span className="absolute left-2 top-2">
                    <BeatTag beat={panel.beat} />
                </span>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3 lg:overflow-y-auto">
                <div className="flex flex-wrap items-center gap-2">
                    {missing.length ? (
                        <Button type="primary" icon={<Sparkles className="size-4" />} onClick={() => onDrawCells(missing)} data-testid="comic-draw-slides">
                            {drawn ? t("comic.slides.drawRest", { count: missing.length }) : t("comic.slides.drawAll", { count: missing.length })}
                        </Button>
                    ) : null}
                    <span className="text-xs text-stone-400">{t("comic.slides.drawCost", { drawn, count: project.panels.length })}</span>
                </div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-7">
                    {project.panels.map((item, i) => {
                        const itemCell = project.cells?.[item.id];
                        const image = itemCell?.versions[itemCell.version]?.image;
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => setSelected(i)}
                                className={`relative aspect-[3/4] overflow-hidden rounded-lg border-2 bg-stone-100 dark:bg-stone-800 ${i === index ? "border-(--skin-accent)" : "border-transparent"}`}
                                data-testid="comic-slide-thumb"
                            >
                                {image ? <ComicImageView image={image} className="absolute inset-0 size-full object-cover" /> : null}
                                {cellBusy[item.id] ? (
                                    <span className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-stone-900/60">
                                        <LoaderCircle className="size-4 animate-spin text-(--skin-accent)" />
                                    </span>
                                ) : cellQueued[item.id] ? (
                                    <span className="absolute inset-0 flex items-center justify-center bg-white/60 text-[10px] text-stone-500 dark:bg-stone-900/60">{t("comic.slides.queued")}</span>
                                ) : null}
                                <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[10px] text-white">{i + 1}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="rounded-2xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-900">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <BeatTag beat={panel.beat} />
                        <b className="text-sm text-stone-900 dark:text-stone-100">{t("comic.slides.slideN", { n: index + 1 })}</b>
                        {cell && cell.versions.length > 1
                            ? cell.versions.map((version, v) => (
                                  <Tooltip key={version.createdAt} title={version.label || t("comic.page.versionN", { n: v + 1 })}>
                                      <button
                                          type="button"
                                          disabled={panelBusy}
                                          onClick={() => onPickCellVersion(index, v)}
                                          className={`h-10 w-8 overflow-hidden rounded border-2 ${v === cell.version ? "border-(--skin-accent)" : "border-stone-200 dark:border-stone-700"}`}
                                      >
                                          <ComicImageView image={version.image} className="size-full object-cover" />
                                      </button>
                                  </Tooltip>
                              ))
                            : null}
                        <span className="flex-1" />
                        <Button size="small" icon={current ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />} disabled={panelBusy} onClick={() => onDrawCells([index])}>
                            {current ? t("comic.slides.redraw") : t("comic.slides.draw")}
                        </Button>
                    </div>
                    {current ? (
                        <div className="flex gap-2">
                            <Input
                                value={instruction}
                                onChange={(event) => setInstruction(event.target.value)}
                                placeholder={t("comic.slides.changePlaceholder")}
                                onPressEnter={() => instruction.trim() && !panelBusy && onEditCell(index, instruction)}
                                disabled={panelBusy}
                            />
                            <Button type="primary" icon={<WandSparkles className="size-4" />} disabled={panelBusy || !instruction.trim()} onClick={() => onEditCell(index, instruction)}>
                                {t("comic.page.change")}
                            </Button>
                        </div>
                    ) : null}
                    <div className="mt-2 text-xs text-stone-400">{t("comic.page.cellHint")}</div>
                </div>

                <PromptLesson
                    project={project}
                    index={index}
                    mode="cells"
                    title={t("comic.slides.lessonTitle", { n: index + 1 })}
                    fullPrompt={panelPrompt(project, index)}
                    copyLabel={t("comic.page.copyCellPrompt")}
                    onCopy={onCopy}
                    onOpenInWorkbench={onOpenInWorkbench}
                />
            </div>
        </div>
    );
}

export function LayoutPicker({ value, count, disabled, onChange }: { value: ComicLayoutId; count: number; disabled?: boolean; onChange: (layout: ComicLayoutId) => void }) {
    const { t } = useTranslation();
    return (
        <div>
            <div className="mb-1.5 text-xs text-stone-500">{t("comic.layouts.title")}</div>
            <div className="flex flex-wrap gap-2">
                {COMIC_LAYOUTS.map((layout) => {
                    const page = layoutPage(layout, count);
                    const scale = 56 / page.height;
                    return (
                        <button
                            key={layout}
                            type="button"
                            disabled={disabled}
                            onClick={() => onChange(layout)}
                            className={`flex items-center gap-2 rounded-xl border-[1.5px] px-2.5 py-1.5 text-xs disabled:opacity-50 ${value === layout ? "border-(--skin-accent) bg-(--skin-accent)/10 text-stone-900 dark:text-stone-100" : "border-stone-200 text-stone-600 dark:border-stone-700 dark:text-stone-300"}`}
                            data-testid={`comic-layout-${layout}`}
                        >
                            <svg width={Math.round(page.width * scale)} height={56} viewBox={`0 0 ${page.width} ${page.height}`} className="shrink-0 rounded-sm bg-white">
                                {page.cells.map((rect, i) => (
                                    <rect key={i} x={rect.x} y={rect.y} width={rect.w} height={rect.h} className={value === layout ? "fill-violet-300" : "fill-stone-300"} />
                                ))}
                            </svg>
                            <span className="text-left">
                                <b className="block font-medium">{t(`comic.layouts.${layout}.name`)}</b>
                                <span className="text-[11px] text-stone-400">{t(`comic.layouts.${layout}.desc`)}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function PanelBadge({ n }: { n: number }) {
    return <span className="absolute left-2 top-2 flex size-6 items-center justify-center rounded-full bg-(--skin-accent) text-xs font-semibold text-white">{n}</span>;
}

function SheetStrip({ project }: { project: ComicProject }) {
    if (!project.characters.some((character) => chosenSheet(character))) return null;
    return (
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
    );
}

/** The prompt of one panel split into coloured parts, with why it is written that way — the prompt lesson. */
function PromptLesson({
    project,
    index,
    mode,
    title,
    fullPrompt,
    copyLabel,
    onCopy,
    onOpenInWorkbench,
}: {
    project: ComicProject;
    index: number;
    mode: ComicMode;
    title?: string;
    fullPrompt: string;
    copyLabel: string;
    onCopy: (text: string) => void;
    onOpenInWorkbench: (text: string) => void;
}) {
    const { t } = useTranslation();
    const panel = project.panels[index];
    if (!panel) return null;
    const segments = panelSegments(panel, project.characters, project.style, mode);
    return (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900" data-testid="comic-prompt-lesson">
            <div className="mb-2 flex flex-wrap items-center gap-2">
                <BeatTag beat={panel.beat} />
                <b className="text-sm text-stone-900 dark:text-stone-100">{title || t("comic.page.lessonTitle", { n: index + 1 })}</b>
                <span className="ml-auto text-xs text-stone-400">{t("comic.page.pickPanel")}</span>
            </div>
            <div className="text-sm leading-8">
                {segments.map((segment, i) => (
                    <span key={i}>
                        <span className={`rounded px-1 py-0.5 ${SEGMENT_CLASS[segment.kind]}`}>{segment.text}</span>
                        {i < segments.length - 1 ? "，" : ""}
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
                    {copyLabel}
                </Button>
                <Button size="small" type="text" icon={<ImagePlus className="size-3.5" />} onClick={() => onOpenInWorkbench(fullPrompt)}>
                    {t("comic.page.openInWorkbench")}
                </Button>
            </div>
        </div>
    );
}
