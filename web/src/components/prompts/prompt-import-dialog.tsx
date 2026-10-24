import { useEffect, useRef, useState } from "react";
import { Alert, App, Button, Checkbox, Input, Modal, Progress, Select } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileUp, Sparkles, Trash2, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { dedupeDrafts, fileTextToDrafts, IMPORT_FILE_ACCEPT, IMPORT_MAX_DRAFTS, splitPromptText, type ImportDraft } from "@/lib/prompt-import";
import { splitPromptsWithAI } from "@/lib/prompt-assist";
import { createPromptFolder, importMyPrompts, type PromptFolder } from "@/services/api/main-site-prompts";
import { useConfigStore } from "@/stores/use-config-store";
import { MY_PROMPTS_QUERY_KEY, PROMPT_FOLDERS_QUERY_KEY } from "./use-prompt-list";

type Row = ImportDraft & { key: number; checked: boolean };

const NEW_FOLDER = -1;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * 批量导入: paste a note (or drop txt / md / csv / json), split it into prompts — by its layout, or by
 * the text model for messy notes — check the list, then save them all into one folder.
 */
export function PromptImportDialog({ open, onClose, apiKey, folders, folderId }: { open: boolean; onClose: () => void; apiKey: string; folders: PromptFolder[]; folderId: number }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const config = useConfigStore((state) => state.config);
    const [text, setText] = useState("");
    const [rows, setRows] = useState<Row[] | null>(null);
    const [target, setTarget] = useState(folderId);
    const [newFolder, setNewFolder] = useState("");
    const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);
    const [importing, setImporting] = useState<number | null>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const abort = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!open) return;
        setText("");
        setRows(null);
        setTarget(folderId);
        setNewFolder("");
        setAiProgress(null);
        setImporting(null);
    }, [open, folderId]);

    const toRows = (drafts: ImportDraft[]) => {
        if (!drafts.length) {
            message.warning(t("myPrompts.import.nothingFound"));
            return;
        }
        if (drafts.length >= IMPORT_MAX_DRAFTS) message.info(t("myPrompts.import.capped", { count: IMPORT_MAX_DRAFTS }));
        setRows(drafts.map((draft, key) => ({ ...draft, key, checked: true })));
    };

    const readFiles = async (files: FileList | File[] | null) => {
        const list = [...(files || [])];
        if (!list.length) return;
        const drafts: ImportDraft[] = [];
        for (const file of list) {
            if (file.size > MAX_FILE_BYTES) {
                message.error(t("myPrompts.import.fileTooLarge", { name: file.name }));
                continue;
            }
            drafts.push(...fileTextToDrafts(file.name, await file.text()));
        }
        toRows(dedupeDrafts(drafts).slice(0, IMPORT_MAX_DRAFTS));
    };

    const splitWithAI = async () => {
        if (!text.trim()) return;
        abort.current = new AbortController();
        setAiProgress({ done: 0, total: 1 });
        try {
            const drafts = await splitPromptsWithAI(config, text, (done, total) => setAiProgress({ done, total }), abort.current.signal);
            toRows(dedupeDrafts(drafts).slice(0, IMPORT_MAX_DRAFTS));
        } catch (error) {
            if (!abort.current?.signal.aborted) message.error(t("myPrompts.import.aiFailed", { error: error instanceof Error ? error.message : String(error) }), 6);
        } finally {
            setAiProgress(null);
            abort.current = null;
        }
    };

    const selected = rows?.filter((row) => row.checked && row.prompt.trim()) || [];

    const save = async () => {
        if (!selected.length) return;
        setImporting(0);
        try {
            let folder = target;
            if (target === NEW_FOLDER) {
                if (!newFolder.trim()) {
                    message.warning(t("myPrompts.folders.nameRequired"));
                    setImporting(null);
                    return;
                }
                folder = (await createPromptFolder(apiKey, newFolder.trim())).id;
            }
            const res = await importMyPrompts(
                apiKey,
                selected.map((row) => ({ title: row.title.trim(), prompt: row.prompt.trim(), tags: row.tags })),
                folder,
                setImporting,
            );
            void queryClient.invalidateQueries({ queryKey: [MY_PROMPTS_QUERY_KEY] });
            void queryClient.invalidateQueries({ queryKey: [PROMPT_FOLDERS_QUERY_KEY] });
            message.success(res.duplicates ? t("myPrompts.import.doneWithDuplicates", { created: res.created, duplicates: res.duplicates }) : t("myPrompts.import.done", { created: res.created }), 5);
            onClose();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error), 6);
            void queryClient.invalidateQueries({ queryKey: [MY_PROMPTS_QUERY_KEY] });
            void queryClient.invalidateQueries({ queryKey: [PROMPT_FOLDERS_QUERY_KEY] });
        } finally {
            setImporting(null);
        }
    };

    const update = (key: number, patch: Partial<Row>) => setRows((current) => current?.map((row) => (row.key === key ? { ...row, ...patch } : row)) || null);
    const busy = aiProgress !== null || importing !== null;

    return (
        <Modal
            open={open}
            onCancel={() => {
                abort.current?.abort();
                onClose();
            }}
            width={760}
            destroyOnHidden
            mask={{ closable: !busy }}
            title={t("myPrompts.import.title")}
            footer={
                rows ? (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <Select
                            className="min-w-40"
                            value={target}
                            onChange={setTarget}
                            data-testid="prompt-import-folder"
                            options={[
                                { value: 0, label: t("myPrompts.unfiled") },
                                ...folders.map((folder) => ({ value: folder.id, label: folder.name })),
                                { value: NEW_FOLDER, label: t("myPrompts.folders.newOption") },
                            ]}
                        />
                        {target === NEW_FOLDER ? <Input className="!w-40" maxLength={20} value={newFolder} onChange={(event) => setNewFolder(event.target.value)} placeholder={t("myPrompts.folders.namePlaceholder")} /> : null}
                        <Button type="primary" loading={importing !== null} disabled={!selected.length} onClick={() => void save()} data-testid="prompt-import-save">
                            {importing !== null ? t("myPrompts.import.saving", { done: importing, total: selected.length }) : t("myPrompts.import.save", { count: selected.length })}
                        </Button>
                    </div>
                ) : null
            }
        >
            {!rows ? (
                <div
                    className="space-y-3"
                    data-testid="prompt-import-input"
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                        event.preventDefault();
                        void readFiles(event.dataTransfer.files);
                    }}
                >
                    <p className="text-sm text-stone-500 dark:text-stone-400">{t("myPrompts.import.intro")}</p>
                    <Input.TextArea
                        autoFocus
                        rows={12}
                        value={text}
                        onChange={(event) => setText(event.target.value)}
                        placeholder={t("myPrompts.import.placeholder")}
                        data-testid="prompt-import-text"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <Button type="primary" icon={<Wand2 className="size-4" />} disabled={!text.trim() || busy} onClick={() => toRows(splitPromptText(text))} data-testid="prompt-import-split">
                            {t("myPrompts.import.split")}
                        </Button>
                        <Button icon={<Sparkles className="size-4" />} disabled={!text.trim() || busy} loading={aiProgress !== null} onClick={() => void splitWithAI()} data-testid="prompt-import-ai">
                            {aiProgress && aiProgress.total > 1 ? t("myPrompts.import.aiProgress", { done: aiProgress.done, total: aiProgress.total }) : t("myPrompts.import.ai")}
                        </Button>
                        <span className="flex-1" />
                        <Button icon={<FileUp className="size-4" />} disabled={busy} onClick={() => fileInput.current?.click()}>
                            {t("myPrompts.import.file")}
                        </Button>
                        <input
                            ref={fileInput}
                            type="file"
                            multiple
                            accept={IMPORT_FILE_ACCEPT}
                            className="hidden"
                            onChange={(event) => {
                                void readFiles(event.target.files);
                                event.target.value = "";
                            }}
                        />
                    </div>
                    <p className="text-xs text-stone-400">{t("myPrompts.import.tips")}</p>
                </div>
            ) : (
                <div className="space-y-3" data-testid="prompt-import-review">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <Button type="text" size="small" icon={<ArrowLeft className="size-4" />} onClick={() => setRows(null)} disabled={busy}>
                            {t("myPrompts.import.back")}
                        </Button>
                        <span className="text-stone-500 dark:text-stone-400">{t("myPrompts.import.found", { count: rows.length, selected: selected.length })}</span>
                        <span className="flex-1" />
                        <Checkbox
                            checked={selected.length === rows.length}
                            indeterminate={selected.length > 0 && selected.length < rows.length}
                            onChange={(event) => setRows(rows.map((row) => ({ ...row, checked: event.target.checked })))}
                        >
                            {t("myPrompts.import.selectAll")}
                        </Checkbox>
                    </div>
                    {importing !== null ? <Progress percent={Math.round((importing / Math.max(1, selected.length)) * 100)} size="small" /> : null}
                    <Alert type="info" showIcon title={t("myPrompts.import.reviewHint")} className="!py-1.5 !text-xs" />
                    <div className="thin-scrollbar max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                        {rows.map((row, index) => (
                            <div key={row.key} className={`flex gap-2 rounded-lg border p-2.5 ${row.checked ? "border-stone-200 dark:border-stone-700" : "border-dashed border-stone-200 opacity-55 dark:border-stone-800"}`} data-testid="prompt-import-row">
                                <Checkbox checked={row.checked} onChange={(event) => update(row.key, { checked: event.target.checked })} className="mt-1" />
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <Input size="small" value={row.title} maxLength={60} placeholder={t("myPrompts.import.titlePlaceholder", { index: index + 1 })} onChange={(event) => update(row.key, { title: event.target.value })} />
                                    <Input.TextArea value={row.prompt} autoSize={{ minRows: 1, maxRows: 5 }} maxLength={8000} onChange={(event) => update(row.key, { prompt: event.target.value })} />
                                    {row.tags.length ? <div className="text-[11px] text-stone-400">#{row.tags.join(" #")}</div> : null}
                                </div>
                                <Button type="text" size="small" danger icon={<Trash2 className="size-3.5" />} aria-label={t("common.delete")} onClick={() => setRows(rows.filter((r) => r.key !== row.key))} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </Modal>
    );
}
