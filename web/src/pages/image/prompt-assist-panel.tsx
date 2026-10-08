import { useEffect, useRef, useState } from "react";
import { Button } from "antd";
import { Check, ImageUp, LoaderCircle, RotateCcw, ScanText, Wand2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { createReferenceImage } from "@/components/image-tools/reference-image-tool";
import { isImageFile } from "@/lib/image-tools";
import { describeImage, promptAssistConfig, writePrompt, type RewriteStyle } from "@/lib/prompt-assist";
import { previewUrlFor } from "@/services/image-storage";
import { useConfigStore, useEffectiveConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

export type PromptAssistMode = "write" | "describe";

const STYLES: RewriteStyle[] = ["rewrite", "shorter", "photo", "xiaohongshu"];

/** 「帮我写」 and 「解析图片」: a card above the composer that streams a prompt and lets the user take it. */
export function PromptAssistPanel({
    mode,
    idea,
    references,
    onApply,
    onClose,
}: {
    mode: PromptAssistMode;
    idea: string;
    references: ReferenceImage[];
    /** `reference` is set when the user also wants the analysed image as a reference. */
    onApply: (prompt: string, reference?: ReferenceImage) => void;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const effectiveConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const [text, setText] = useState("");
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const [image, setImage] = useState<ReferenceImage | null>(null);
    const [dragging, setDragging] = useState(false);

    const ready = () => {
        const config = promptAssistConfig(effectiveConfig);
        if (isAiConfigReady(config, config.model)) return true;
        openConfigDialog(true);
        return false;
    };

    const run = async (task: (signal: AbortSignal) => Promise<string>) => {
        if (!ready()) return;
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setRunning(true);
        setError("");
        try {
            const result = await task(controller.signal);
            if (!controller.signal.aborted) setText(result);
        } catch (err) {
            if (!controller.signal.aborted) setError(err instanceof Error ? err.message : t("studio.assist.failed"));
        } finally {
            if (controllerRef.current === controller) {
                controllerRef.current = null;
                setRunning(false);
            }
        }
    };

    const write = (style?: RewriteStyle) => {
        const previous = text;
        setText("");
        void run((signal) => writePrompt(effectiveConfig, { idea, references, previous, style }, setText, signal));
    };

    const describe = (source: ReferenceImage) => {
        setText("");
        void run((signal) => describeImage(effectiveConfig, source, setText, signal));
    };

    const pickImage = async (files?: FileList | null) => {
        const file = Array.from(files || []).find(isImageFile);
        if (!file) return;
        const reference = await createReferenceImage(file, file.name);
        setImage(reference);
        describe(reference);
    };

    // 帮我写 starts as soon as it opens; 解析图片 waits for an image.
    useEffect(() => {
        if (mode === "write" && idea.trim()) write();
        return () => controllerRef.current?.abort();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const title = mode === "write" ? t("studio.assist.writeTitle") : t("studio.assist.describeTitle");
    const Icon = mode === "write" ? Wand2 : ScanText;

    return (
        <div className="rounded-2xl border border-stone-200 bg-card p-4 shadow-xl dark:border-stone-700" data-testid={`assist-${mode}`}>
            <div className="flex items-center gap-2">
                <Icon className="size-4 text-(--skin-accent)" />
                <span className="font-medium">{title}</span>
                {mode === "write" && idea.trim() ? <span className="min-w-0 truncate text-xs text-stone-500">{t("studio.assist.youWrote", { idea: idea.trim() })}</span> : null}
                <button type="button" className="ml-auto flex size-7 items-center justify-center rounded-md text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" onClick={onClose} aria-label={t("common.cancel")}>
                    <X className="size-4" />
                </button>
            </div>

            {mode === "write" && !idea.trim() ? <p className="mt-3 text-sm text-stone-500">{t("studio.assist.writeEmpty")}</p> : null}

            {mode === "describe" && !image ? (
                <button
                    type="button"
                    className={`mt-3 flex h-36 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-stone-500 transition ${dragging ? "border-(--skin-accent) bg-(--skin-accent)/5" : "border-stone-300 hover:border-stone-400 dark:border-stone-700"}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                        event.preventDefault();
                        setDragging(false);
                        void pickImage(event.dataTransfer.files);
                    }}
                >
                    <ImageUp className="size-6" />
                    <span>{t("studio.assist.describeDrop")}</span>
                    <span className="text-xs text-stone-400">{t("studio.assist.describeHint")}</span>
                </button>
            ) : null}

            {(mode === "write" && idea.trim()) || image ? (
                <div className="mt-3 flex gap-3">
                    {image ? <img src={previewUrlFor(image.storageKey) || image.dataUrl} alt="" className="size-24 shrink-0 rounded-lg object-cover" /> : null}
                    <div className="min-h-24 min-w-0 flex-1 whitespace-pre-wrap rounded-xl bg-stone-50 px-3 py-2.5 text-sm leading-relaxed dark:bg-stone-900" data-testid="assist-text">
                        {text ||
                            (running ? (
                                <span className="flex items-center gap-2 text-stone-500">
                                    <LoaderCircle className="size-4 animate-spin" />
                                    {mode === "write" ? t("studio.assist.writing") : t("studio.assist.describing")}
                                </span>
                            ) : null)}
                        {error ? <span className="text-red-500">{error}</span> : null}
                    </div>
                </div>
            ) : null}

            {mode === "write" && idea.trim() && text && !running ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="mr-1 text-xs text-stone-500">{t("studio.assist.tweak")}</span>
                    {STYLES.map((style) => (
                        <Button key={style} size="small" onClick={() => write(style)}>
                            {t(`studio.assist.styles.${style}`)}
                        </Button>
                    ))}
                </div>
            ) : null}

            {(text || error) && !running ? (
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <span className="mr-auto text-xs text-stone-500">{t("studio.assist.billing")}</span>
                    {mode === "describe" && image ? (
                        <Button icon={<RotateCcw className="size-3.5" />} onClick={() => describe(image)}>
                            {t("studio.assist.again")}
                        </Button>
                    ) : null}
                    {mode === "write" ? <Button onClick={onClose}>{t("studio.assist.keepMine")}</Button> : null}
                    {mode === "describe" && image && text ? <Button onClick={() => onApply(text, image)}>{t("studio.assist.useWithImage")}</Button> : null}
                    {text ? (
                        <Button type="primary" icon={<Check className="size-3.5" />} onClick={() => onApply(text)} data-testid="assist-apply">
                            {t("studio.assist.use")}
                        </Button>
                    ) : null}
                </div>
            ) : null}

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                    void pickImage(event.target.files);
                    event.target.value = "";
                }}
            />
        </div>
    );
}
