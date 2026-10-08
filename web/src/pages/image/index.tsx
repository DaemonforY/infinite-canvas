import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { App, Button, Checkbox, Drawer, Modal } from "antd";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { ListChecks, Plus } from "lucide-react";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import { CanvasNodeMaskEditDialog, type CanvasImageMaskEditPayload } from "@/components/canvas/canvas-node-mask-edit-dialog";
import { CanvasNodeOutpaintDialog, type CanvasImageOutpaintPayload } from "@/components/canvas/canvas-node-outpaint-dialog";
import { CanvasNodeSuperResolveDialog } from "@/components/canvas/canvas-node-super-resolve-dialog";
import { ImageEditorDialog, type ImageEditorResult } from "@/components/image-editor/image-editor-dialog";
import { DEFAULT_AI_TOOL_SETTINGS, runAiTool, useImageToolsQuota } from "@/components/image-tools/ai-image-tools";
import { createReferenceImage, useReferenceImageTool } from "@/components/image-tools/reference-image-tool";
import { AccountSyncBadge } from "@/components/layout/account-sync-badge";
import { usePromptActions } from "@/components/prompts/use-prompt-actions";
import { useCopyText } from "@/hooks/use-copy-text";
import { restoreDraftReferences, useWorkbenchDraft } from "@/hooks/use-workbench-draft";
import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { isImageFile } from "@/lib/image-tools";
import { readInitialPromptParam } from "@/lib/prompt-param";
import { NEW_SESSION_KEY } from "@/lib/workbench-drafts";
import type { Prompt } from "@/services/api/prompts";
import { requestEdit, requestGeneration } from "@/services/api/image";
import { deleteStoredImages, getImagePreviewRevision, previewUrlFor, subscribeImagePreviews, uploadImage } from "@/services/image-storage";
import { modelOptionName, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { useAssetStore } from "@/stores/use-asset-store";
import { useContestSubmitStore } from "@/stores/use-contest-submit-store";
import { useMyPromptEditorStore } from "@/stores/use-my-prompt-editor-store";
import { usePublishWorkStore } from "@/stores/use-publish-work-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { readWorkbenchDraft, useWorkbenchDraftStore } from "@/stores/use-workbench-draft-store";
import type { ReferenceImage } from "@/types/image";
import { buildLog, logStore, readStoredLogs, saveStoredLog, type GeneratedImage, type GenerationLog, type GenerationResult } from "./generation-log";
import { ImageDetailViewer } from "./image-detail-viewer";
import { PromptInspiration } from "./prompt-inspiration";
import { useSaveImage } from "./use-save-image";
import { WorkbenchComposer } from "./workbench-composer";
import { FeedBatchView, type FeedBatch } from "./workbench-feed";

/** A request ready to run: the prompt sent to the model, the config (image model in `model`) and references. */
type Snapshot = { text: string; label?: string; config: AiConfig; references: ReferenceImage[]; count: number };

type ActiveBatch = { id: string; snapshot: Snapshot; results: GenerationResult[]; startedAt: number };

const PAGE_SIZE = 20;

function toReference(image: { url: string; mimeType?: string; storageKey?: string }, name: string): ReferenceImage {
    return { id: nanoid(), name, type: image.mimeType || "image/png", dataUrl: image.url, ...(image.storageKey ? { storageKey: image.storageKey } : {}) };
}

export default function ImagePage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    useSyncExternalStore(subscribeImagePreviews, getImagePreviewRevision);
    const config = useConfigStore((state) => state.config);
    const effectiveConfig = useEffectiveConfig();
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const addAsset = useAssetStore((state) => state.addAsset);
    const openContestSubmit = useContestSubmitStore((state) => state.open);
    const openMyPromptEditor = useMyPromptEditorStore((state) => state.open);
    const promptActions = usePromptActions();
    const copyText = useCopyText();
    const { save, free, overlay: saveOverlay } = useSaveImage();
    const { apiKey: toolsApiKey } = useImageToolsQuota();

    const textareaRef = useRef<TextAreaRef>(null);
    const feedRef = useRef<HTMLDivElement>(null);
    const stickToBottomRef = useRef(true);
    // ?prompt= lets the main site deep-link here with a prompt pre-filled; falls back to the saved draft.
    const [prompt, setPrompt] = useState(() => readInitialPromptParam() || readWorkbenchDraft("image")?.prompt || "");
    const [references, setReferences] = useState<ReferenceImage[]>([]);
    const referenceTool = useReferenceImageTool(setReferences);
    const [logs, setLogs] = useState<GenerationLog[]>([]);
    const [logsLoaded, setLogsLoaded] = useState(false);
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    const [active, setActive] = useState<ActiveBatch | null>(null);
    const [cellErrors, setCellErrors] = useState<Record<string, string[]>>({});
    const [retrying, setRetrying] = useState<Record<string, true>>({});
    const [elapsedMs, setElapsedMs] = useState(0);
    const [detail, setDetail] = useState<{ batchId: string; index: number } | null>(null);
    const [editing, setEditing] = useState<GeneratedImage | null>(null);
    const [maskTarget, setMaskTarget] = useState<GeneratedImage | null>(null);
    const [outpaintTarget, setOutpaintTarget] = useState<GeneratedImage | null>(null);
    const [upscaleTarget, setUpscaleTarget] = useState<{ image: GeneratedImage; batch: FeedBatch } | null>(null);
    const [inspirationOpen, setInspirationOpen] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [autoRunToken, setAutoRunToken] = useState(0);
    const running = Boolean(active);

    const imageCommand = useWorkbenchAgentStore((state) => state.imageCommand);
    const clearImageCommand = useWorkbenchAgentStore((state) => state.clearImageCommand);
    const updateAgentTask = useWorkbenchAgentStore((state) => state.updateTask);
    const processedCommandRef = useRef(0);
    const agentTaskIdRef = useRef<string | undefined>(undefined);
    const draftStore = useWorkbenchDraft({ kind: "image", sessionKey: NEW_SESSION_KEY, prompt, references });
    const remoteDraftRevision = useWorkbenchDraftStore((state) => state.remoteRevision.image);

    const model = effectiveConfig.imageModel || effectiveConfig.model;
    const generationCount = Math.max(1, Math.min(10, Number(config.count) || 1));

    // A newer draft arrived from another device (account sync).
    useEffect(() => {
        if (!remoteDraftRevision) return;
        const remote = readWorkbenchDraft<ReferenceImage>("image");
        setPrompt(remote?.prompt || "");
        void restoreDraftReferences(remote).then(setReferences);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remoteDraftRevision]);

    // Bring back the draft's reference images once, then start saving.
    useEffect(() => {
        let cancelled = false;
        void restoreDraftReferences(readWorkbenchDraft<ReferenceImage>("image"))
            .then((restored) => {
                if (!cancelled && restored.length) setReferences((current) => (current.length ? current : restored));
            })
            .finally(() => {
                if (!cancelled) draftStore.markHydrated();
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const refreshLogs = useCallback(async () => {
        setLogs(await readStoredLogs());
        setLogsLoaded(true);
    }, []);

    useEffect(() => {
        void refreshLogs();
    }, [refreshLogs]);

    useEffect(() => {
        if (!active) return;
        const timer = window.setInterval(() => setElapsedMs(performance.now() - active.startedAt), 1000);
        return () => window.clearInterval(timer);
    }, [active]);

    const focusComposer = (cursor: "end" | "all" = "end") => window.setTimeout(() => textareaRef.current?.focus({ cursor }), 0);

    const ensureReady = (snapshotConfig: AiConfig) => {
        if (isAiConfigReady(snapshotConfig, snapshotConfig.model)) return true;
        message.warning(t("workbench.configFirst"));
        openConfigDialog(true);
        return false;
    };

    const imageConfig = (overrides: Partial<AiConfig> = {}): AiConfig => ({ ...effectiveConfig, model, ...overrides });

    /** The request a saved log was made with, so it can run again regardless of the composer. */
    const logSnapshot = (log: GenerationLog, count: number): Snapshot => {
        const logModel = log.config.imageModel || log.model || model;
        return {
            text: log.prompt,
            label: log.label,
            config: imageConfig({ imageModel: logModel, model: logModel, size: log.config.size || effectiveConfig.size, quality: log.config.quality || effectiveConfig.quality }),
            references: log.references,
            count,
        };
    };

    const runSlot = async (snapshot: Snapshot) => {
        const startedAt = performance.now();
        const config = { ...snapshot.config, count: "1" };
        const result = snapshot.references.length ? await requestEdit(config, snapshot.text, snapshot.references) : await requestGeneration(config, snapshot.text);
        const generated = result[0];
        if (!generated) throw new Error(t("imageWorkbench.missingResult"));
        const stored = await uploadImage(generated.dataUrl);
        const image: GeneratedImage = {
            id: generated.id,
            dataUrl: stored.url,
            ...(stored.storageKey ? { storageKey: stored.storageKey } : {}),
            durationMs: performance.now() - startedAt,
            width: stored.width,
            height: stored.height,
            bytes: stored.bytes,
            mimeType: stored.mimeType,
        };
        return image;
    };

    /** Runs one batch at the bottom of the feed and files it as a log when it ends. */
    const runBatch = async (snapshot: Snapshot) => {
        if (active) {
            message.warning(t("imageWorkbench.busy"));
            return null;
        }
        if (!ensureReady(snapshot.config)) return null;
        const id = nanoid();
        const startedAt = performance.now();
        stickToBottomRef.current = true;
        setElapsedMs(0);
        setActive({ id, snapshot, startedAt, results: Array.from({ length: snapshot.count }, () => ({ id: nanoid(), status: "pending" })) });
        const update = (index: number, next: Partial<GenerationResult>) => setActive((value) => (value && value.id === id ? { ...value, results: value.results.map((item, i) => (i === index ? { ...item, ...next } : item)) } : value));
        const settled = await Promise.allSettled(
            Array.from({ length: snapshot.count }, async (_, index) => {
                try {
                    const image = await runSlot(snapshot);
                    update(index, { status: "success", image });
                    return image;
                } catch (error) {
                    update(index, { status: "failed", error: error instanceof Error ? error.message : t("workbench.generationFailed") });
                    throw error;
                }
            }),
        );
        const images = settled.filter((item): item is PromiseFulfilledResult<GeneratedImage> => item.status === "fulfilled").map((item) => item.value);
        const errors = settled.filter((item): item is PromiseRejectedResult => item.status === "rejected").map((item) => (item.reason instanceof Error ? item.reason.message : t("workbench.generationFailed")));
        const log = buildLog({
            id,
            prompt: snapshot.text,
            label: snapshot.label,
            model: snapshot.config.model,
            config: { ...snapshot.config, count: String(snapshot.count) },
            references: snapshot.references,
            durationMs: performance.now() - startedAt,
            successCount: images.length,
            failCount: errors.length,
            images,
        });
        try {
            await saveStoredLog(log);
            if (errors.length) setCellErrors((value) => ({ ...value, [id]: errors }));
            await refreshLogs();
        } finally {
            setActive(null);
        }
        if (images.length) message.success(t("imageWorkbench.generated"));
        else message.error(errors[0] || t("workbench.generationFailed"));
        return { successCount: images.length, failCount: errors.length, error: errors[0] };
    };

    const generate = async () => {
        const agentTaskId = agentTaskIdRef.current;
        agentTaskIdRef.current = undefined;
        const text = prompt.trim();
        if (!text) {
            message.error(t("imageWorkbench.promptRequired"));
            if (agentTaskId) updateAgentTask(agentTaskId, { status: "failed", error: t("imageWorkbench.promptRequired") });
            return;
        }
        const snapshot: Snapshot = { text, config: imageConfig(), references: [...references], count: generationCount };
        if (agentTaskId) updateAgentTask(agentTaskId, { status: "running", error: undefined });
        const result = await runBatch(snapshot);
        if (!agentTaskId) return;
        if (!result) updateAgentTask(agentTaskId, { status: "failed", error: active ? t("imageWorkbench.busy") : t("imageWorkbench.configIncomplete") });
        else updateAgentTask(agentTaskId, { status: result.successCount ? "succeeded" : "failed", successCount: result.successCount, failCount: result.failCount, error: result.successCount ? undefined : result.error });
    };

    // Image commands from the Agent panel and 「用这个画」 in the prompt library: fill the prompt, maybe run.
    useEffect(() => {
        if (!imageCommand || imageCommand.nonce === processedCommandRef.current) return;
        processedCommandRef.current = imageCommand.nonce;
        clearImageCommand();
        if (typeof imageCommand.prompt === "string") setPrompt(imageCommand.prompt);
        if (imageCommand.run && running) {
            if (imageCommand.taskId) updateAgentTask(imageCommand.taskId, { status: "failed", error: t("imageWorkbench.busy") });
            return;
        }
        if (imageCommand.run) {
            agentTaskIdRef.current = imageCommand.taskId;
            setAutoRunToken((value) => value + 1);
        } else focusComposer();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageCommand, clearImageCommand, running, updateAgentTask]);

    useEffect(() => {
        if (!autoRunToken) return;
        void generate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoRunToken]);

    const addFiles = async (files: FileList | File[] | null | undefined) => {
        const imageFiles = Array.from(files || []).filter(isImageFile);
        if (!imageFiles.length) return;
        const next = await Promise.all(imageFiles.map((file) => createReferenceImage(file, file.name)));
        setReferences((value) => [...value, ...next]);
    };

    /** 「改这张」: the image becomes 图1 and the cursor goes to the prompt. */
    const editThis = async (image: GeneratedImage) => {
        const stored = await uploadImage(image.dataUrl);
        setReferences([toReference(stored, "result.png")]);
        setDetail(null);
        message.success(t("studio.feed.editThisDone"));
        focusComposer("all");
    };

    const applyLogConfig = (log: GenerationLog) => {
        if (log.config.imageModel || log.model) updateConfig("imageModel", log.config.imageModel || log.model);
        if (log.config.quality) updateConfig("quality", log.config.quality);
        if (log.config.size) updateConfig("size", log.config.size);
        if (log.config.count) updateConfig("count", log.config.count);
    };

    const reuseBatch = (batch: FeedBatch) => {
        if (!batch.log) return;
        setPrompt(batch.log.prompt);
        setReferences(batch.log.references);
        applyLogConfig(batch.log);
        focusComposer();
    };

    const rerunBatch = (batch: FeedBatch) => {
        if (!batch.log) return;
        setDetail(null);
        void runBatch(logSnapshot(batch.log, Math.max(1, batch.log.imageCount || batch.cells.length)));
    };

    /** Retries one failed image of a saved round; a success is added to that round. */
    const retryCell = async (batch: FeedBatch, cellIndex: number) => {
        const log = batch.log;
        if (!log) return;
        const failIndex = cellIndex - log.images.length;
        const key = `${log.id}:${failIndex}`;
        const snapshot = logSnapshot(log, 1);
        if (!ensureReady(snapshot.config) || retrying[key]) return;
        setRetrying((value) => ({ ...value, [key]: true }));
        try {
            const image = await runSlot(snapshot);
            await saveStoredLog({ ...log, images: [...log.images, image], successCount: log.successCount + 1, failCount: Math.max(0, log.failCount - 1), status: "success" });
            setCellErrors((value) => ({ ...value, [log.id]: (value[log.id] || []).filter((_, i) => i !== failIndex) }));
            await refreshLogs();
            message.success(t("workbench.retrySuccess"));
        } catch (error) {
            const text = error instanceof Error ? error.message : t("workbench.generationFailed");
            setCellErrors((value) => {
                const list = [...(value[log.id] || [])];
                list[failIndex] = text;
                return { ...value, [log.id]: list };
            });
        } finally {
            setRetrying((value) => {
                const next = { ...value };
                delete next[key];
                return next;
            });
        }
    };

    /** A local result (editor, 变清晰, 抠图) filed as its own one-image round. */
    const addDerivedImage = async (blob: Blob, label: string, base: { prompt: string }) => {
        const stored = await uploadImage(blob);
        const image: GeneratedImage = { id: nanoid(), dataUrl: stored.url, ...(stored.storageKey ? { storageKey: stored.storageKey } : {}), durationMs: 0, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
        stickToBottomRef.current = true;
        await saveStoredLog(buildLog({ prompt: base.prompt, label, model: "", config: { ...effectiveConfig, model, count: "1" }, references: [], durationMs: 0, successCount: 1, failCount: 0, images: [image] }));
        await refreshLogs();
    };

    const sourceReference = async (image: GeneratedImage) => toReference(await uploadImage(image.dataUrl), "source.png");

    const runMaskEdit = async (image: GeneratedImage, payload: CanvasImageMaskEditPayload) => {
        setMaskTarget(null);
        if (!payload.generate) {
            message.info(t("studio.detail.maskGenerateOnly"));
            return;
        }
        const userPrompt = payload.prompt.trim();
        const text = payload.erase
            ? t("canvas.projectPage.erasePrompt", { source: imageReferenceLabel(0), mask: imageReferenceLabel(1) })
            : t("canvas.projectPage.maskPrompt", { source: imageReferenceLabel(0), mask: imageReferenceLabel(1), prompt: userPrompt });
        const [source, mask] = await Promise.all([sourceReference(image), uploadImage(payload.maskDataUrl).then((stored) => toReference(stored, "mask.png"))]);
        setDetail(null);
        void runBatch({ text, label: payload.erase ? t("studio.labels.erase") : t("studio.labels.mask", { prompt: userPrompt }), config: imageConfig({ size: "auto" }), references: [source, mask], count: 1 });
    };

    const runOutpaint = async (payload: CanvasImageOutpaintPayload) => {
        setOutpaintTarget(null);
        const text = t("canvas.projectPage.outpaintPrompt", { source: imageReferenceLabel(0), extra: payload.prompt ? t("canvas.projectPage.outpaintExtra", { prompt: payload.prompt }) : "" }).trim();
        const layout = toReference(await uploadImage(payload.layoutDataUrl), "outpaint.png");
        setDetail(null);
        void runBatch({ text, label: payload.prompt ? t("studio.labels.outpaintWith", { prompt: payload.prompt }) : t("studio.labels.outpaint"), config: imageConfig({ size: payload.size }), references: [layout], count: 1 });
    };

    const removeBackground = async (image: GeneratedImage, batch: FeedBatch) => {
        if (!toolsApiKey) {
            message.warning(t("studio.detail.needConnect"));
            openConfigDialog(true);
            return;
        }
        const hide = message.loading(t("studio.detail.removingBg"), 0);
        try {
            const source = await (await fetch(image.dataUrl)).blob();
            const result = await runAiTool(toolsApiKey, "removeBg", DEFAULT_AI_TOOL_SETTINGS, source, "image.png");
            await addDerivedImage(result.blob, t("studio.labels.removeBg"), { prompt: batch.prompt });
            setDetail(null);
            message.success(t("toolbox.ai.done"));
        } catch (error) {
            message.error(error instanceof Error ? error.message : t("toolbox.failed"));
        } finally {
            hide();
        }
    };

    // Image editor: 保存 files the edited copy; 让 AI 修改 runs the instruction on it.
    const saveEditedImage = async ({ blob }: ImageEditorResult) => {
        await addDerivedImage(blob, t("studio.labels.edited"), { prompt: t("imageEditor.untitled") });
        setEditing(null);
        setDetail(null);
        message.success(t("imageEditor.saved"));
    };

    const aiEditImage = async ({ instruction, image }: { instruction: string; image: ImageEditorResult }) => {
        if (running) {
            message.warning(t("imageWorkbench.busy"));
            return;
        }
        const stored = await uploadImage(image.blob);
        setReferences([toReference(stored, "edit-source.png")]);
        setPrompt(instruction);
        setEditing(null);
        setDetail(null);
        setAutoRunToken((value) => value + 1);
    };

    const saveToAssets = async (image: GeneratedImage, batch: FeedBatch) => {
        const stored = await uploadImage(image.dataUrl);
        addAsset({
            kind: "image",
            title: (batch.label || batch.prompt).slice(0, 24) || t("imageWorkbench.resultTitle", { count: 1 }),
            coverUrl: stored.url,
            tags: [],
            source: t("imageWorkbench.source"),
            data: { dataUrl: stored.url, storageKey: stored.storageKey, width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType },
            metadata: { source: "image-page", prompt: batch.prompt },
        });
        message.success(t("common.addedToAssets"));
    };

    const publish = (image: GeneratedImage, batch: FeedBatch) => {
        const config = batch.log?.config;
        usePublishWorkStore.getState().open({
            images: [image.dataUrl],
            prompt: batch.prompt,
            model: modelOptionName(config?.imageModel || batch.model || model),
            params: { ...(config?.size ? { size: config.size } : {}), ...(config?.quality ? { quality: config.quality } : {}) },
            source: "image_workbench",
        });
    };

    const deleteSelectedLogs = () => {
        const imageKeys = logs.filter((log) => selectedLogIds.includes(log.id)).flatMap((log) => log.images.map((image) => image.storageKey).filter((key): key is string => Boolean(key)));
        void Promise.all([deleteStoredImages(imageKeys), ...selectedLogIds.map((id) => logStore.removeItem(id))]).then(refreshLogs);
        setSelectedLogIds([]);
        setDeleteConfirmOpen(false);
    };

    const startNew = () => {
        draftStore.discard(NEW_SESSION_KEY);
        setPrompt("");
        setReferences([]);
        setLogsOpen(false);
        focusComposer();
    };

    const drawFromLibrary = (item: Prompt) => {
        promptActions.draw(item);
        setInspirationOpen(false);
    };

    // ---- feed ----
    const feed = useMemo<FeedBatch[]>(() => {
        const toBatch = (log: GenerationLog): FeedBatch => {
            const errors = cellErrors[log.id] || [];
            const failed: GenerationResult[] = Array.from({ length: log.failCount }, (_, i) => (retrying[`${log.id}:${i}`] ? { id: `${log.id}-f${i}`, status: "pending" } : { id: `${log.id}-f${i}`, status: "failed", error: errors[i] }));
            return {
                id: log.id,
                prompt: log.prompt,
                label: log.label,
                references: log.references,
                size: log.config.size || log.size,
                quality: log.quality,
                model: log.config.imageModel || log.model,
                time: log.time,
                cells: [...log.images.map((image): GenerationResult => ({ id: image.id, status: "success", image })), ...failed],
                log,
            };
        };
        const batches = logs
            .slice(0, visibleCount)
            .filter((log) => log.id !== active?.id)
            .reverse()
            .map(toBatch);
        if (active)
            batches.push({
                id: active.id,
                prompt: active.snapshot.text,
                label: active.snapshot.label,
                references: active.snapshot.references,
                size: active.snapshot.config.size,
                quality: active.snapshot.config.quality,
                model: active.snapshot.config.model,
                time: "",
                cells: active.results,
                running: true,
                elapsedMs,
            });
        return batches;
    }, [logs, visibleCount, active, cellErrors, retrying, elapsedMs]);

    const detailBatch = detail ? feed.find((batch) => batch.id === detail.batchId) : undefined;
    const empty = logsLoaded && !feed.length;

    // Keep the newest round in view when something is added at the bottom.
    useLayoutEffect(() => {
        const element = feedRef.current;
        if (!element || !stickToBottomRef.current) return;
        element.scrollTop = element.scrollHeight;
    }, [feed.length, active?.id, logsLoaded]);

    const jumpTo = (logId: string) => {
        const index = logs.findIndex((log) => log.id === logId);
        if (index >= visibleCount) setVisibleCount(index + 1);
        setLogsOpen(false);
        stickToBottomRef.current = false;
        window.setTimeout(() => document.getElementById(`batch-${logId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    };

    const handlers = {
        onOpenImage: (batch: FeedBatch, index: number) => setDetail({ batchId: batch.id, index }),
        onEditImage: (image: GeneratedImage) => void editThis(image),
        onSaveImage: (image: GeneratedImage, name: string) => void save(image, name),
        onRetry: (batch: FeedBatch, index: number) => void retryCell(batch, index),
        onReuse: reuseBatch,
        onRerun: rerunBatch,
        onCopy: (batch: FeedBatch) => copyText(batch.prompt, t("common.promptCopied")),
    };

    const logList = <LogManager logs={logs} selected={selectedLogIds} onSelectedChange={setSelectedLogIds} onOpen={jumpTo} onNew={startNew} onDelete={() => setDeleteConfirmOpen(true)} />;

    return (
        <div className="flex h-full overflow-hidden bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
            <HistoryRail logs={logs} onOpen={jumpTo} onNew={startNew} onManage={() => setLogsOpen(true)} />
            <main className="flex min-w-0 flex-1 flex-col">
                <div
                    ref={feedRef}
                    className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-5 sm:px-6"
                    onScroll={(event) => {
                        const element = event.currentTarget;
                        stickToBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
                    }}
                    data-testid="workbench-feed"
                >
                    {empty ? (
                        <div className="mx-auto max-w-6xl">
                            <h1 className="text-center text-2xl font-semibold sm:text-[28px]">{t("studio.empty.title")}</h1>
                            <p className="mx-auto mt-2 max-w-xl text-center text-sm text-stone-500">{t("studio.empty.lead")}</p>
                            <PromptInspiration className="mt-6" onDraw={drawFromLibrary} />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-8">
                            {logs.length > visibleCount ? (
                                <Button className="self-center" onClick={() => ((stickToBottomRef.current = false), setVisibleCount((value) => value + PAGE_SIZE))}>
                                    {t("studio.feed.older")}
                                </Button>
                            ) : null}
                            {feed.map((batch) => (
                                <FeedBatchView key={batch.id} batch={batch} watermark={!free} handlers={handlers} />
                            ))}
                        </div>
                    )}
                </div>
                <div className="shrink-0 px-2 pb-3 pt-1 sm:px-6 sm:pb-4">
                    <WorkbenchComposer
                        textareaRef={textareaRef}
                        prompt={prompt}
                        onPromptChange={setPrompt}
                        references={references}
                        setReferences={setReferences}
                        onAddFiles={(files) => void addFiles(files)}
                        onOpenReferenceTool={(item) => void referenceTool.open(item)}
                        config={effectiveConfig}
                        model={model}
                        updateConfig={updateConfig}
                        openConfigDialog={openConfigDialog}
                        running={running}
                        elapsedMs={elapsedMs}
                        onGenerate={() => void generate()}
                        onOpenInspiration={() => setInspirationOpen(true)}
                        onOpenLogs={() => setLogsOpen(true)}
                    />
                </div>
            </main>

            {detailBatch && detail ? (
                <ImageDetailViewer
                    batch={detailBatch}
                    index={detail.index}
                    onIndexChange={(index) => setDetail({ batchId: detailBatch.id, index })}
                    onClose={() => setDetail(null)}
                    watermark={!free}
                    actions={{
                        onSay: (image) => void editThis(image),
                        onMask: setMaskTarget,
                        onOutpaint: setOutpaintTarget,
                        onUpscale: (image) => setUpscaleTarget({ image, batch: detailBatch }),
                        onRemoveBg: (image) => void removeBackground(image, detailBatch),
                        onRerun: rerunBatch,
                        onCopyPrompt: (batch) => copyText(batch.prompt, t("common.promptCopied")),
                        onSaveMine: (image, batch) => openMyPromptEditor({ imageUrl: image.dataUrl, prompt: batch.prompt, kind: "image" }),
                        onSave: (image, name) => void save(image, name),
                        onSaveAsset: (image, batch) => void saveToAssets(image, batch),
                        onPublish: publish,
                        onContest: (image, batch) => openContestSubmit({ imageUrl: image.dataUrl, prompt: batch.prompt }),
                        onOpenEditor: setEditing,
                    }}
                />
            ) : null}

            <Drawer title={t("studio.composer.library")} placement="right" size={Math.min(980, typeof window === "undefined" ? 980 : window.innerWidth)} open={inspirationOpen} onClose={() => setInspirationOpen(false)} destroyOnHidden>
                <PromptInspiration onDraw={drawFromLibrary} />
            </Drawer>
            <Drawer title={t("workbench.logs")} placement="left" size={340} open={logsOpen} onClose={() => setLogsOpen(false)} extra={<AccountSyncBadge />}>
                {logList}
            </Drawer>
            <Modal title={t("workbench.deleteLogs")} open={deleteConfirmOpen} onCancel={() => setDeleteConfirmOpen(false)} onOk={deleteSelectedLogs} okText={t("common.delete")} okButtonProps={{ danger: true }} cancelText={t("common.cancel")}>
                {t("workbench.deleteLogsConfirm", { count: selectedLogIds.length })}
            </Modal>

            {referenceTool.dialog}
            <ImageEditorDialog open={Boolean(editing)} src={editing?.dataUrl || ""} onClose={() => setEditing(null)} onSave={saveEditedImage} onAiEdit={aiEditImage} onMaskEdit={editing ? () => (setMaskTarget(editing), setEditing(null)) : undefined} />
            {maskTarget ? <CanvasNodeMaskEditDialog dataUrl={maskTarget.dataUrl} open onClose={() => setMaskTarget(null)} onConfirm={(payload) => void runMaskEdit(maskTarget, payload)} /> : null}
            {outpaintTarget ? <CanvasNodeOutpaintDialog dataUrl={outpaintTarget.dataUrl} open onClose={() => setOutpaintTarget(null)} onConfirm={(payload) => void runOutpaint(payload)} /> : null}
            {upscaleTarget ? (
                <CanvasNodeSuperResolveDialog
                    dataUrl={upscaleTarget.image.dataUrl}
                    open
                    onClose={() => setUpscaleTarget(null)}
                    onDone={async (blob) => {
                        await addDerivedImage(blob, t("studio.labels.upscale"), { prompt: upscaleTarget.batch.prompt });
                        setUpscaleTarget(null);
                        setDetail(null);
                    }}
                />
            ) : null}
            {saveOverlay}
        </div>
    );
}

/** Desktop: a slim column of thumbnails, one per round, newest first. */
function HistoryRail({ logs, onOpen, onNew, onManage }: { logs: GenerationLog[]; onOpen: (id: string) => void; onNew: () => void; onManage: () => void }) {
    const { t } = useTranslation();
    return (
        <aside className="thin-scrollbar hidden w-[76px] shrink-0 flex-col items-center gap-2 overflow-y-auto border-r border-stone-200 py-3 dark:border-stone-800 lg:flex" data-testid="history-rail">
            <button
                type="button"
                title={t("workbench.new")}
                onClick={onNew}
                className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-dashed border-stone-300 text-stone-500 transition hover:border-stone-400 hover:text-stone-900 dark:border-stone-700 dark:hover:text-stone-100"
            >
                <Plus className="size-5" />
            </button>
            {logs.map((log) => {
                const image = log.images[0];
                return (
                    <button
                        key={log.id}
                        type="button"
                        title={log.label || log.prompt}
                        onClick={() => onOpen(log.id)}
                        className="size-12 shrink-0 overflow-hidden rounded-lg bg-stone-200 transition hover:ring-2 hover:ring-(--skin-accent) dark:bg-stone-800"
                    >
                        {image ? (
                            <img src={previewUrlFor(image.storageKey) || image.dataUrl} alt="" className="size-full object-cover" />
                        ) : (
                            <span className="flex size-full items-center justify-center text-[10px] text-red-500">{t("workbench.failed")}</span>
                        )}
                    </button>
                );
            })}
            {logs.length ? (
                <button type="button" title={t("studio.rail.manage")} onClick={onManage} className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800">
                    <ListChecks className="size-4" />
                </button>
            ) : null}
        </aside>
    );
}

function LogManager({ logs, selected, onSelectedChange, onOpen, onNew, onDelete }: { logs: GenerationLog[]; selected: string[]; onSelectedChange: (ids: string[]) => void; onOpen: (id: string) => void; onNew: () => void; onDelete: () => void }) {
    const { t } = useTranslation();
    const allSelected = Boolean(logs.length) && selected.length === logs.length;
    return (
        <div>
            <div className="mb-3 flex flex-wrap gap-2">
                <Button size="small" icon={<Plus className="size-3.5" />} onClick={onNew}>
                    {t("workbench.new")}
                </Button>
                <Button size="small" disabled={!logs.length} onClick={() => onSelectedChange(allSelected ? [] : logs.map((log) => log.id))}>
                    {allSelected ? t("common.cancel") : t("workbench.selectAll")}
                </Button>
                <Button size="small" danger disabled={!selected.length} onClick={onDelete}>
                    {t("common.delete")}
                </Button>
            </div>
            <div className="space-y-2">
                {logs.map((log) => (
                    <div key={log.id} className="flex items-center gap-2.5 rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                        <Checkbox checked={selected.includes(log.id)} onChange={(event) => onSelectedChange(event.target.checked ? [...selected, log.id] : selected.filter((id) => id !== log.id))} />
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 text-left" onClick={() => onOpen(log.id)}>
                            <span className="flex shrink-0 gap-1">
                                {log.images.slice(0, 2).map((image) => (
                                    <img key={image.id} src={previewUrlFor(image.storageKey) || image.dataUrl} alt="" className="size-9 rounded-md object-cover" />
                                ))}
                            </span>
                            <span className="min-w-0">
                                <span className="block truncate text-sm">{log.label || log.prompt || log.title}</span>
                                <span className="block text-xs text-stone-400">
                                    {log.time} · {t("workbench.successCount", { count: log.successCount })}
                                    {log.failCount ? ` · ${t("workbench.failCount", { count: log.failCount })}` : ""}
                                </span>
                            </span>
                        </button>
                    </div>
                ))}
                {!logs.length ? <div className="py-10 text-center text-sm text-stone-500">{t("workbench.noLogs")}</div> : null}
            </div>
        </div>
    );
}
