import { AlertCircle, ChevronLeft, ChevronRight, Code2, Download, Globe, History, LoaderCircle, Plus, RotateCcw, Send, Sparkles, Square, Trash2, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Drawer, Empty, Input, Modal, Popconfirm, Tag, Tooltip } from "antd";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { CanvasPublishSiteDialog } from "@/components/canvas/canvas-publish-site-dialog";
import { ModelPicker } from "@/components/model-picker";
import { useCopyText } from "@/hooks/use-copy-text";
import { animationRatios, animationScenarios, animationStyles, findRatio } from "@/lib/animation/presets";
import { buildAnimationMessages, svgBackground, svgPage, svgSize, type AnimationBrief } from "@/lib/animation/svg";
import { formatDuration } from "@/lib/image-utils";
import { readInitialPromptParam } from "@/lib/prompt-param";
import { useAnimationStore, type AnimationLog } from "@/stores/use-animation-store";
import { modelOptionLabel, useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";

const BRIEF_KEY = "infinite-canvas:animation_brief";

function readSavedBrief(): Omit<AnimationBrief, "prompt"> {
    try {
        const saved = JSON.parse(localStorage.getItem(BRIEF_KEY) || "{}");
        return { scenario: saved.scenario || "free", style: saved.style || "auto", ratio: saved.ratio || "16:9" };
    } catch {
        return { scenario: "free", style: "auto", ratio: "16:9" };
    }
}

function initialScenario(fallback: string) {
    const fromUrl = new URLSearchParams(window.location.search).get("scenario") || "";
    return animationScenarios.some((item) => item.id === fromUrl) ? fromUrl : fallback;
}

export default function AnimationPage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const copyText = useCopyText();
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const model = effectiveConfig.textModel;
    const logs = useAnimationStore((state) => state.logs);
    const startGeneration = useAnimationStore((state) => state.start);
    const cancelGeneration = useAnimationStore((state) => state.cancel);
    const updateLog = useAnimationStore((state) => state.update);
    const removeLog = useAnimationStore((state) => state.remove);
    const [searchParams, setSearchParams] = useSearchParams();

    const saved = useMemo(readSavedBrief, []);
    const [prompt, setPrompt] = useState(() => readInitialPromptParam() || "");
    const [scenario, setScenario] = useState(() => initialScenario(saved.scenario));
    const [style, setStyle] = useState(saved.style);
    const [ratio, setRatio] = useState(saved.ratio);
    const [activeId, setActiveId] = useState<string | null>(null);
    const [openFromUrl, setOpenFromUrl] = useState<string | null>(() => searchParams.get("log"));
    /** -1 follows the newest version. */
    const [versionIndex, setVersionIndex] = useState(-1);
    const [instruction, setInstruction] = useState("");
    const [starting, setStarting] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const [replayToken, setReplayToken] = useState(0);
    const [codeOpen, setCodeOpen] = useState(false);
    const [publishOpen, setPublishOpen] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);

    const active = logs.find((log) => log.id === activeId) || null;
    const versionCount = active?.versions.length || 0;
    const shownIndex = versionIndex < 0 || versionIndex >= versionCount ? versionCount - 1 : versionIndex;
    const version = active && shownIndex >= 0 ? active.versions[shownIndex] : null;
    const pending = active?.pending;
    const running = pending?.mode || null;
    const error = active?.error || "";
    const streamedChars = pending?.chars || 0;
    const elapsedMs = pending ? Math.max(0, now - pending.startedAt) : 0;
    const size = version ? svgSize(version.svg) : null;
    const pageHtml = useMemo(() => (version && active ? svgPage(version.svg, active.title, svgBackground(version.svg)) : ""), [active, version]);
    const exampleKeys = t(`animation.examples.${scenario}`, { returnObjects: true }) as unknown;
    const examples = Array.isArray(exampleKeys) ? (exampleKeys as string[]) : [];

    useEffect(() => {
        void useAnimationStore.getState().load();
    }, []);

    // Opened from a "finished" notification (?log=…): show that record once the history has it.
    useEffect(() => {
        const fromUrl = searchParams.get("log");
        if (!fromUrl) return;
        setOpenFromUrl(fromUrl);
        setSearchParams(
            (params) => {
                params.delete("log");
                return params;
            },
            { replace: true },
        );
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        const log = openFromUrl ? logs.find((item) => item.id === openFromUrl) : undefined;
        if (!log) return;
        openLog(log);
        setOpenFromUrl(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openFromUrl, logs]);

    useEffect(() => {
        localStorage.setItem(BRIEF_KEY, JSON.stringify({ scenario, style, ratio }));
    }, [scenario, style, ratio]);

    useEffect(() => {
        if (!pending) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [pending]);

    // A new version arrived for the record on screen: show it from the start.
    useEffect(() => {
        if (!versionCount) return;
        setVersionIndex(-1);
        setReplayToken((value) => value + 1);
    }, [versionCount, activeId]);

    const ensureReady = () => {
        if (!isAiConfigReady(effectiveConfig, model)) {
            message.warning(t("workbench.configFirst"));
            openConfigDialog(true);
            return false;
        }
        return true;
    };

    const generate = async () => {
        if (starting) return;
        if (!prompt.trim()) {
            message.error(t("animation.promptRequired"));
            return;
        }
        if (!ensureReady()) return;
        const brief: AnimationBrief = { prompt: prompt.trim(), scenario, style, ratio };
        setStarting(true);
        try {
            const id = await startGeneration({ brief, model, instruction: "", messages: buildAnimationMessages(brief), config: effectiveConfig });
            setActiveId(id);
            setVersionIndex(-1);
            setNow(Date.now());
        } catch (error) {
            message.error((error as Error)?.message || t("workbench.generationFailed"));
            return;
        } finally {
            setStarting(false);
        }
        // On narrow screens the preview sits below the form.
        if (window.innerWidth < 1280) window.setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    };

    const revise = async () => {
        if (starting || !active || !version || active.pending) return;
        const text = instruction.trim();
        if (!text) return;
        if (!ensureReady()) return;
        const history = active.versions.slice(1, shownIndex + 1).map((item) => item.instruction);
        setStarting(true);
        try {
            // Revising an older version branches from it: later versions are kept, the new one goes last.
            await startGeneration({ logId: active.id, brief: active.brief, model, instruction: text, messages: buildAnimationMessages(active.brief, { currentSvg: version.svg, instruction: text, history }), config: effectiveConfig });
            setInstruction("");
            setNow(Date.now());
        } finally {
            setStarting(false);
        }
    };

    const openLog = (log: AnimationLog) => {
        setActiveId(log.id);
        setVersionIndex(-1);
        setPrompt(log.brief.prompt);
        setScenario(log.brief.scenario);
        setStyle(log.brief.style);
        setRatio(log.brief.ratio);
        setLogsOpen(false);
    };

    const deleteLog = (id: string) => {
        removeLog(id);
        if (activeId === id) setActiveId(null);
    };

    const startNew = () => {
        setActiveId(null);
        setPrompt("");
        setInstruction("");
        setLogsOpen(false);
    };

    const fileName = (ext: string) => `${(active?.title || "animation").replace(/[\\/:*?"<>|…\s]+/g, "-").replace(/^-|-$/g, "") || "animation"}.${ext}`;

    const logPanel = <LogList logs={logs} activeId={activeId} onOpen={openLog} onDelete={deleteLog} onNew={startNew} />;

    return (
        <div className="flex h-full flex-col overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-3 lg:grid-cols-[260px_minmax(0,1fr)] lg:overflow-hidden">
                <aside className="thin-scrollbar hidden min-h-0 overflow-y-auto rounded-lg border border-stone-200 bg-card p-4 shadow-sm dark:border-stone-800 lg:block">{logPanel}</aside>

                <section className="grid grid-cols-1 gap-3 lg:min-h-0 lg:overflow-hidden xl:grid-cols-[400px_minmax(0,1fr)]">
                    <div className="thin-scrollbar flex flex-col rounded-lg border border-stone-200 bg-card p-4 shadow-sm dark:border-stone-800 lg:min-h-0 lg:overflow-y-auto">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h1 className="text-2xl font-semibold text-stone-950 dark:text-stone-100">{t("animation.title")}</h1>
                                <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t("animation.description")}</p>
                            </div>
                            <Button className="shrink-0 lg:!hidden" icon={<History className="size-4" />} onClick={() => setLogsOpen(true)}>
                                {t("workbench.logs")}
                            </Button>
                        </div>

                        <div className="mt-5 space-y-5">
                            <div>
                                <span className="mb-2 block text-sm font-semibold">{t("animation.scenario")}</span>
                                <div className="flex flex-wrap gap-1.5" data-testid="animation-scenarios">
                                    {animationScenarios.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => setScenario(item.id)}
                                            className={`rounded-full border px-3 py-1 text-xs transition ${scenario === item.id ? "border-primary bg-primary text-primary-foreground" : "border-stone-200 hover:border-stone-400 dark:border-stone-700"}`}
                                        >
                                            {t(`animation.scenarios.${item.id}`)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <span className="mb-2 block text-sm font-semibold">{t("animation.prompt")}</span>
                                <Input.TextArea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={5} maxLength={2000} showCount placeholder={t(`animation.placeholders.${scenario}`)} data-testid="animation-prompt" />
                                {examples.length ? (
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        <span className="text-xs text-stone-500">{t("animation.tryExample")}</span>
                                        {examples.map((example) => (
                                            <button
                                                key={example}
                                                type="button"
                                                className="max-w-full truncate rounded bg-stone-100 px-2 py-0.5 text-left text-xs text-stone-600 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                                                onClick={() => setPrompt(example)}
                                                title={example}
                                            >
                                                {example}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>

                            <div>
                                <span className="mb-2 block text-sm font-semibold">{t("animation.style")}</span>
                                <div className="grid grid-cols-5 gap-1.5">
                                    {animationStyles.map((item) => (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => setStyle(item.id)}
                                            className={`flex flex-col items-center gap-1 rounded-md border p-1.5 text-[11px] transition ${style === item.id ? "border-primary ring-1 ring-primary" : "border-stone-200 hover:border-stone-400 dark:border-stone-700"}`}
                                            data-testid={`animation-style-${item.id}`}
                                        >
                                            <span className="flex h-5 w-full overflow-hidden rounded">
                                                {item.swatch.map((color) => (
                                                    <span key={color} className="flex-1" style={{ background: color }} />
                                                ))}
                                            </span>
                                            <span className="truncate">{t(`animation.styles.${item.id}`)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <span className="mb-2 block text-sm font-semibold">{t("animation.ratio")}</span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {animationRatios.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => setRatio(item.id)}
                                                className={`rounded-md border px-2 py-1 text-xs transition ${ratio === item.id ? "border-primary bg-primary text-primary-foreground" : "border-stone-200 hover:border-stone-400 dark:border-stone-700"}`}
                                            >
                                                {item.id}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <label className="block min-w-0">
                                    <span className="mb-2 block text-sm font-semibold">{t("workbench.model")}</span>
                                    <ModelPicker config={effectiveConfig} value={model} onChange={(value) => updateConfig("textModel", value)} capability="text" fullWidth onMissingConfig={() => openConfigDialog(false)} />
                                </label>
                            </div>
                            <p className="m-0 text-xs leading-5 text-stone-500 dark:text-stone-400">{t("animation.modelHint")}</p>
                        </div>

                        <div className="mt-auto pt-6">
                            <Button type="primary" size="large" block icon={<Sparkles className="size-4" />} loading={starting} disabled={!prompt.trim()} onClick={() => void generate()} data-testid="animation-generate">
                                {active ? t("animation.generateNew") : t("animation.generate")}
                            </Button>
                        </div>
                    </div>

                    <div ref={previewRef} className="thin-scrollbar flex flex-col rounded-lg border border-stone-200 bg-card p-4 shadow-sm dark:border-stone-800 lg:min-h-0 lg:overflow-y-auto lg:p-5">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 items-center gap-2">
                                <h2 className="truncate text-xl font-semibold">{active ? active.title : t("animation.preview")}</h2>
                                {active && active.versions.length > 1 ? (
                                    <div className="flex items-center gap-0.5 text-xs text-stone-500">
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<ChevronLeft className="size-4" />}
                                            disabled={shownIndex <= 0}
                                            onClick={() => {
                                                setVersionIndex(shownIndex - 1);
                                                setReplayToken((value) => value + 1);
                                            }}
                                            aria-label={t("animation.prevVersion")}
                                        />
                                        <span data-testid="animation-version">{t("animation.version", { index: shownIndex + 1, total: active.versions.length })}</span>
                                        <Button
                                            size="small"
                                            type="text"
                                            icon={<ChevronRight className="size-4" />}
                                            disabled={shownIndex >= active.versions.length - 1}
                                            onClick={() => {
                                                setVersionIndex(shownIndex + 1);
                                                setReplayToken((value) => value + 1);
                                            }}
                                            aria-label={t("animation.nextVersion")}
                                        />
                                    </div>
                                ) : null}
                                {running ? <Tag className="m-0">{t("animation.streaming", { time: formatDuration(elapsedMs), chars: streamedChars })}</Tag> : null}
                            </div>
                            {version ? (
                                <div className="flex flex-wrap gap-1.5">
                                    <Tooltip title={t("animation.replay")}>
                                        <Button size="small" icon={<RotateCcw className="size-3.5" />} onClick={() => setReplayToken((value) => value + 1)} aria-label={t("animation.replay")} />
                                    </Tooltip>
                                    <Button size="small" icon={<Code2 className="size-3.5" />} onClick={() => setCodeOpen(true)}>
                                        {t("animation.code")}
                                    </Button>
                                    <Button size="small" icon={<Download className="size-3.5" />} onClick={() => saveAs(new Blob([version.svg], { type: "image/svg+xml;charset=utf-8" }), fileName("svg"))} data-testid="animation-download-svg">
                                        SVG
                                    </Button>
                                    <Button size="small" icon={<Download className="size-3.5" />} onClick={() => saveAs(new Blob([pageHtml], { type: "text/html;charset=utf-8" }), fileName("html"))}>
                                        HTML
                                    </Button>
                                    <Button size="small" type="primary" icon={<Globe className="size-3.5" />} onClick={() => setPublishOpen(true)} data-testid="animation-publish">
                                        {t("animation.publish")}
                                    </Button>
                                </div>
                            ) : null}
                        </div>

                        {error ? (
                            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 dark:border-red-950 dark:bg-red-950/20 dark:text-red-300" data-testid="animation-error">
                                {error}
                            </div>
                        ) : null}

                        {version ? (
                            <div className="flex min-h-[280px] flex-1 items-center justify-center rounded-lg bg-[repeating-conic-gradient(#e7e5e4_0%_25%,#fafaf9_0%_50%)] bg-[length:20px_20px] p-3 dark:bg-[repeating-conic-gradient(#292524_0%_25%,#1c1917_0%_50%)]">
                                <div
                                    className="relative w-full overflow-hidden rounded-md shadow-sm"
                                    style={{ aspectRatio: size ? `${size.width} / ${size.height}` : "16 / 9", maxHeight: "68vh", maxWidth: size && size.height > size.width ? `calc(68vh * ${size.width / size.height})` : undefined }}
                                >
                                    {/* Empty sandbox: no scripts, no same-origin, and the page's CSP blocks all network access. */}
                                    <iframe
                                        key={`${version.id}-${replayToken}`}
                                        srcDoc={pageHtml}
                                        sandbox=""
                                        title={active?.title || "animation"}
                                        referrerPolicy="no-referrer"
                                        className="absolute inset-0 block size-full border-0"
                                        data-testid="animation-frame"
                                    />
                                    {running === "revise" ? (
                                        <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-sm text-stone-700 backdrop-blur-[1px] dark:bg-black/50 dark:text-stone-200">
                                            <LoaderCircle className="mr-2 size-5 animate-spin" />
                                            {t("animation.revising")}
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        ) : running ? (
                            <div
                                className="flex min-h-[320px] flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-stone-300 px-4 text-center text-sm text-stone-500 dark:border-stone-700"
                                data-testid="animation-pending"
                            >
                                <LoaderCircle className="size-7 animate-spin" />
                                <span>{streamedChars ? t("animation.writing", { chars: streamedChars }) : t("animation.thinking")}</span>
                                <span className="text-xs">{t("animation.writingHint")}</span>
                                <span className="text-xs">{pending?.local ? t("animation.localHint") : t("animation.backgroundHint")}</span>
                                <Button size="small" danger icon={<Square className="size-3.5" />} onClick={() => active && void cancelGeneration(active.id)}>
                                    {t("animation.stop")}
                                </Button>
                            </div>
                        ) : (
                            <div className="flex min-h-[320px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-stone-300 text-center dark:border-stone-700">
                                <WandSparkles className="mb-4 size-11 text-stone-400" />
                                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("animation.empty")} />
                            </div>
                        )}

                        {active && version ? (
                            <div className="mt-3">
                                {version.instruction ? <p className="mb-2 truncate text-xs text-stone-500">{t("animation.thisVersion", { instruction: version.instruction })}</p> : null}
                                <div className="flex gap-2">
                                    <Input
                                        value={instruction}
                                        onChange={(event) => setInstruction(event.target.value)}
                                        onPressEnter={(event) => {
                                            if (!event.nativeEvent.isComposing) void revise();
                                        }}
                                        maxLength={500}
                                        placeholder={t("animation.revisePlaceholder")}
                                        disabled={Boolean(running)}
                                        data-testid="animation-revise-input"
                                    />
                                    {running === "revise" ? (
                                        <Button danger icon={<Square className="size-4" />} onClick={() => void cancelGeneration(active.id)}>
                                            {t("animation.stop")}
                                        </Button>
                                    ) : (
                                        <Button type="primary" icon={<Send className="size-4" />} disabled={!instruction.trim() || Boolean(running) || starting} onClick={() => void revise()} data-testid="animation-revise">
                                            {t("animation.revise")}
                                        </Button>
                                    )}
                                </div>
                                <p className="mt-1.5 text-xs text-stone-400">{t("animation.meta", { model: modelOptionLabel(effectiveConfig, active.model), ratio: findRatio(active.brief.ratio).id, kb: (version.svg.length / 1024).toFixed(1) })}</p>
                            </div>
                        ) : null}
                    </div>
                </section>
            </main>

            <Drawer title={t("workbench.logs")} placement="left" open={logsOpen} onClose={() => setLogsOpen(false)}>
                {logPanel}
            </Drawer>
            <Modal open={codeOpen} title={t("animation.code")} onCancel={() => setCodeOpen(false)} width={760} footer={<Button onClick={() => version && copyText(version.svg)}>{t("common.copy")}</Button>}>
                <pre className="thin-scrollbar max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded bg-stone-100 p-3 text-xs dark:bg-stone-900">{version?.svg}</pre>
            </Modal>
            {active && version ? (
                <CanvasPublishSiteDialog open={publishOpen} html={pageHtml} defaultTitle={active.title} siteId={active.siteId} onClose={() => setPublishOpen(false)} onPublished={(site) => updateLog(active.id, { siteId: site.id })} />
            ) : null}
        </div>
    );
}

function LogList({ logs, activeId, onOpen, onDelete, onNew }: { logs: AnimationLog[]; activeId: string | null; onOpen: (log: AnimationLog) => void; onDelete: (id: string) => void; onNew: () => void }) {
    const { t } = useTranslation();
    return (
        <>
            <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold">{t("workbench.logs")}</h2>
                <Tag className="m-0">{logs.length}</Tag>
            </div>
            <Button size="small" block icon={<Plus className="size-3.5" />} onClick={onNew} className="mb-3">
                {t("workbench.new")}
            </Button>
            {logs.length ? (
                <div className="grid gap-2">
                    {logs.map((log) => {
                        const latest = log.versions[log.versions.length - 1];
                        const status = log.pending ? t("animation.generatingShort") : log.error && !latest ? t("animation.failedShort") : "";
                        return (
                            <div key={log.id} className={`group relative overflow-hidden rounded-lg border transition ${log.id === activeId ? "border-primary" : "border-stone-200 hover:border-stone-400 dark:border-stone-800"}`}>
                                <button type="button" className="block w-full text-left" onClick={() => onOpen(log)}>
                                    {/* A data: URL in <img> renders the SVG without running anything, animation included. */}
                                    {latest ? (
                                        <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(latest.svg)}`} alt="" className="aspect-video w-full bg-stone-100 object-contain dark:bg-stone-900" loading="lazy" />
                                    ) : (
                                        <div className="flex aspect-video w-full items-center justify-center bg-stone-100 text-stone-400 dark:bg-stone-900">
                                            {log.pending ? <LoaderCircle className="size-6 animate-spin" /> : <AlertCircle className="size-6" />}
                                        </div>
                                    )}
                                    <div className="px-2 py-1.5">
                                        <div className="truncate text-sm font-medium">{log.title}</div>
                                        <div className="text-xs text-stone-500">
                                            {new Date(log.createdAt).toLocaleString()} · {t(`animation.scenarios.${log.brief.scenario}`)}
                                            {log.versions.length > 1 ? ` · ${t("animation.versions", { count: log.versions.length })}` : ""}
                                            {status ? <span className={log.pending ? "text-primary" : "text-red-500"}> · {status}</span> : null}
                                        </div>
                                    </div>
                                </button>
                                <Popconfirm title={t("animation.deleteConfirm")} okText={t("common.delete")} cancelText={t("common.cancel")} okButtonProps={{ danger: true }} onConfirm={() => onDelete(log.id)}>
                                    <button type="button" className="absolute right-1.5 top-1.5 hidden size-6 items-center justify-center rounded-full bg-black/55 text-white hover:bg-red-600 group-hover:flex" aria-label={t("common.delete")}>
                                        <Trash2 className="size-3.5" />
                                    </button>
                                </Popconfirm>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <p className="py-6 text-center text-sm text-stone-500">{t("workbench.noLogs")}</p>
            )}
        </>
    );
}
