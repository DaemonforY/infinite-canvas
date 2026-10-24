import { useEffect, useMemo, useRef, useState } from "react";
import { App, Button, Dropdown, Empty, Input, Modal, Select, Spin, type MenuProps } from "antd";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { saveAs } from "file-saver";
import { CheckSquare, Download, FolderInput, FolderPlus, Import, MoreHorizontal, Pin, PinOff, Plus, Store, Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { promptsToCsv, promptsToMarkdown, type ExportablePrompt } from "@/lib/prompt-export";
import { cn } from "@/lib/utils";
import {
    batchMyPrompts,
    createPromptFolder,
    deletePromptFolder,
    listMyPrompts,
    listPromptFolders,
    renamePromptFolder,
    type MyPromptBatchAction,
    type MyPromptSort,
    type PromptFolder,
} from "@/services/api/main-site-prompts";
import { promptKey, serverPromptToPrompt, type Prompt } from "@/services/api/prompts";
import { useMyPromptEditorStore } from "@/stores/use-my-prompt-editor-store";
import { useSellDialogStore } from "@/stores/use-sell-dialog-store";
import { PromptCard } from "./prompt-card";
import { PromptImportDialog } from "./prompt-import-dialog";
import { usePromptActions } from "./use-prompt-actions";
import { FOR_YOU_QUERY_KEY, MY_PROMPTS_QUERY_KEY, PROMPT_FOLDERS_QUERY_KEY } from "./use-prompt-list";

const PAGE_SIZE = 60;
/** "all" | "unfiled" | folder id */
type FolderView = "all" | "unfiled" | number;

function folderParam(view: FolderView) {
    return view === "all" ? undefined : view;
}

/**
 * 「我的提示词」: the user's own library on the main site — folders, pins, sort by their own use,
 * bulk import from notes and files, multi-select (move / pin / export / delete) and export.
 */
export function MyPromptsPanel({ apiKey, keyword, scene, onOpen }: { apiKey: string; keyword: string; scene: string; onOpen: (item: Prompt) => void }) {
    const { t } = useTranslation();
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const actions = usePromptActions();
    const openEditor = useMyPromptEditorStore((state) => state.open);
    const openSell = useSellDialogStore((state) => state.open);
    const [view, setView] = useState<FolderView>("all");
    const [sort, setSort] = useState<MyPromptSort>("latest");
    const [selecting, setSelecting] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [importOpen, setImportOpen] = useState(false);
    const [folderEdit, setFolderEdit] = useState<{ folder?: PromptFolder; name: string } | null>(null);
    const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);
    const sentinel = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedKeyword(keyword.trim()), 300);
        return () => clearTimeout(timer);
    }, [keyword]);

    const folders = useQuery({ queryKey: [PROMPT_FOLDERS_QUERY_KEY, apiKey], queryFn: ({ signal }) => listPromptFolders(apiKey, signal), staleTime: 30_000 });
    const folderList = folders.data?.folders || [];
    const folderNames = useMemo(() => new Map(folderList.map((folder) => [folder.id, folder.name])), [folderList]);
    const viewFolderId = typeof view === "number" ? view : 0;

    // A folder deleted elsewhere: fall back to 全部.
    useEffect(() => {
        if (typeof view === "number" && folders.data && !folderNames.has(view)) setView("all");
    }, [view, folders.data, folderNames]);

    const sceneFilter = scene === "all" ? undefined : scene;
    const list = useInfiniteQuery({
        queryKey: [MY_PROMPTS_QUERY_KEY, apiKey, "panel", view, sort, debouncedKeyword, sceneFilter],
        queryFn: ({ pageParam, signal }) => listMyPrompts(apiKey, { folder: folderParam(view), sort, q: debouncedKeyword, scene: sceneFilter, page: pageParam, page_size: PAGE_SIZE }, signal),
        initialPageParam: 1,
        getNextPageParam: (lastPage, pages) => (pages.reduce((total, page) => total + page.items.length, 0) < lastPage.total ? pages.length + 1 : undefined),
    });
    const items = useMemo(() => list.data?.pages.flatMap((page) => page.items.map(serverPromptToPrompt)) || [], [list.data?.pages]);
    const total = list.data?.pages[0]?.total ?? 0;

    useEffect(() => {
        const node = sentinel.current;
        if (!node) return;
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting) && list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [list]);

    useEffect(() => setSelected(new Set()), [view, sort, debouncedKeyword, sceneFilter]);

    const refresh = () => {
        void queryClient.invalidateQueries({ queryKey: [MY_PROMPTS_QUERY_KEY] });
        void queryClient.invalidateQueries({ queryKey: [PROMPT_FOLDERS_QUERY_KEY] });
        void queryClient.invalidateQueries({ queryKey: [FOR_YOU_QUERY_KEY] });
    };

    const runBatch = async (ids: number[], op: MyPromptBatchAction, done: string) => {
        if (!ids.length) return;
        try {
            const n = await batchMyPrompts(apiKey, ids, op);
            message.success(t(done, { count: n }));
            setSelected(new Set());
            refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    };

    const confirmDelete = (ids: number[]) =>
        modal.confirm({
            title: t("myPrompts.batch.deleteTitle", { count: ids.length }),
            content: t("myPrompts.batch.deleteConfirm"),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: () => runBatch(ids, { action: "delete" }, "myPrompts.batch.deleted"),
        });

    const moveItems = (ids: number[]): MenuProps["items"] => [
        { key: "move-0", label: t("myPrompts.unfiled"), onClick: () => void runBatch(ids, { action: "move", folder_id: 0 }, "myPrompts.batch.moved") },
        ...folderList.map((folder) => ({ key: `move-${folder.id}`, label: folder.name, onClick: () => void runBatch(ids, { action: "move", folder_id: folder.id }, "myPrompts.batch.moved") })),
    ];

    /** Every prompt of the current view (all pages), or just the given ones. */
    const exportAs = async (format: "md" | "csv", only?: Prompt[]) => {
        try {
            let source = only;
            if (!source) {
                source = [];
                for (let page = 1; ; page++) {
                    const res = await listMyPrompts(apiKey, { folder: folderParam(view), sort, q: debouncedKeyword, scene: sceneFilter, page, page_size: PAGE_SIZE });
                    source.push(...res.items.map(serverPromptToPrompt));
                    if (source.length >= res.total || !res.items.length) break;
                }
            }
            if (!source.length) return;
            const rows: ExportablePrompt[] = source.map((item) => ({ title: item.title, prompt: item.prompt, tags: item.curatedTags || [], folder: item.folderId ? folderNames.get(item.folderId) : undefined }));
            const name = `${t("myPrompts.exportName")}-${typeof view === "number" ? folderNames.get(view) || "" : view === "unfiled" ? t("myPrompts.unfiled") : t("myPrompts.all")}`;
            if (format === "md") saveAs(new Blob([promptsToMarkdown(rows)], { type: "text/markdown;charset=utf-8" }), `${name}.md`);
            else saveAs(new Blob([promptsToCsv(rows)], { type: "text/csv;charset=utf-8" }), `${name}.csv`);
            message.success(t("myPrompts.exported", { count: rows.length }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    };

    const exportMenu = (only?: Prompt[]): MenuProps["items"] => [
        { key: "md", label: t("myPrompts.exportMd"), onClick: () => void exportAs("md", only) },
        { key: "csv", label: t("myPrompts.exportCsv"), onClick: () => void exportAs("csv", only) },
    ];

    const saveFolder = async () => {
        if (!folderEdit) return;
        const name = folderEdit.name.trim();
        if (!name) {
            message.warning(t("myPrompts.folders.nameRequired"));
            return;
        }
        try {
            if (folderEdit.folder) await renamePromptFolder(apiKey, folderEdit.folder, name);
            else setView((await createPromptFolder(apiKey, name)).id);
            setFolderEdit(null);
            void queryClient.invalidateQueries({ queryKey: [PROMPT_FOLDERS_QUERY_KEY] });
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        }
    };

    const removeFolder = (folder: PromptFolder, withItems: boolean) =>
        modal.confirm({
            title: withItems ? t("myPrompts.folders.deleteWithItemsTitle", { name: folder.name }) : t("myPrompts.folders.deleteTitle", { name: folder.name }),
            content: withItems ? t("myPrompts.folders.deleteWithItemsConfirm", { count: folder.count }) : t("myPrompts.folders.deleteConfirm"),
            okText: t("common.delete"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: async () => {
                try {
                    await deletePromptFolder(apiKey, folder.id, withItems);
                    if (view === folder.id) setView("all");
                    refresh();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : String(error));
                }
            },
        });

    const selectedItems = items.filter((item) => item.serverId && selected.has(item.serverId));
    const selectedIds = selectedItems.map((item) => item.serverId!);
    const toggle = (id: number) =>
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const chip = (key: FolderView, label: string, count: number | undefined, menu?: MenuProps["items"]) => {
        const active = view === key;
        return (
            <div key={String(key)} className={cn("flex shrink-0 items-center rounded-full border text-sm transition", active ? "border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900" : "border-stone-200 text-stone-600 hover:border-stone-400 dark:border-stone-700 dark:text-stone-300")}>
                <button type="button" className="py-1 pl-3 pr-2" onClick={() => setView(key)} data-testid={`prompt-folder-${key}`}>
                    {label}
                    {count !== undefined ? <span className={cn("ml-1 text-xs", active ? "opacity-70" : "text-stone-400")}>{count}</span> : null}
                </button>
                {menu ? (
                    <Dropdown trigger={["click"]} menu={{ items: menu }}>
                        <button type="button" className="py-1 pr-2" aria-label={t("myPrompts.folders.manage")}>
                            <MoreHorizontal className="size-3.5" />
                        </button>
                    </Dropdown>
                ) : (
                    <span className="w-1" />
                )}
            </div>
        );
    };

    const empty = !list.isLoading && items.length === 0;
    const nothingSaved = empty && (folders.data?.total ?? 0) === 0 && !debouncedKeyword && !sceneFilter;

    return (
        <div className="mt-2 space-y-3" data-testid="my-prompts-panel">
            <div className="thin-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
                {chip("all", t("myPrompts.all"), folders.data?.total)}
                {chip("unfiled", t("myPrompts.unfiled"), folders.data?.unfiled)}
                {folderList.map((folder) =>
                    chip(folder.id, folder.name, folder.count, [
                        { key: "rename", label: t("myPrompts.folders.rename"), onClick: () => setFolderEdit({ folder, name: folder.name }) },
                        { key: "delete", label: t("myPrompts.folders.delete"), onClick: () => removeFolder(folder, false) },
                        { key: "delete-all", danger: true, label: t("myPrompts.folders.deleteWithItems"), onClick: () => removeFolder(folder, true) },
                    ]),
                )}
                <Button size="small" type="text" icon={<FolderPlus className="size-4" />} onClick={() => setFolderEdit({ name: "" })} data-testid="prompt-folder-create">
                    {t("myPrompts.folders.create")}
                </Button>
            </div>

            {selecting ? (
                <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50/95 px-3 py-2 text-sm backdrop-blur dark:border-sky-900 dark:bg-sky-950/90" data-testid="prompt-batch-bar">
                    <span className="font-medium">{t("myPrompts.batch.selected", { count: selectedIds.length })}</span>
                    <Button size="small" type="link" onClick={() => setSelected(new Set(items.map((item) => item.serverId!).filter(Boolean)))}>
                        {t("myPrompts.batch.selectLoaded", { count: items.length })}
                    </Button>
                    <span className="flex-1" />
                    <Dropdown trigger={["click"]} disabled={!selectedIds.length} menu={{ items: moveItems(selectedIds) }}>
                        <Button size="small" icon={<FolderInput className="size-3.5" />} disabled={!selectedIds.length}>
                            {t("myPrompts.batch.move")}
                        </Button>
                    </Dropdown>
                    <Button size="small" icon={<Pin className="size-3.5" />} disabled={!selectedIds.length} onClick={() => void runBatch(selectedIds, { action: "pin" }, "myPrompts.batch.pinned")}>
                        {t("myPrompts.pin")}
                    </Button>
                    <Button size="small" icon={<PinOff className="size-3.5" />} disabled={!selectedIds.length} onClick={() => void runBatch(selectedIds, { action: "unpin" }, "myPrompts.batch.unpinned")}>
                        {t("myPrompts.unpin")}
                    </Button>
                    <Dropdown trigger={["click"]} disabled={!selectedIds.length} menu={{ items: exportMenu(selectedItems) }}>
                        <Button size="small" icon={<Download className="size-3.5" />} disabled={!selectedIds.length}>
                            {t("myPrompts.export")}
                        </Button>
                    </Dropdown>
                    <Button
                        size="small"
                        icon={<Store className="size-3.5" />}
                        disabled={!selectedIds.length || selectedIds.length > 50}
                        onClick={() => openSell({ picks: selectedItems.map((item) => ({ id: item.serverId!, title: item.title, prompt: item.prompt, coverUrl: item.coverPath })) })}
                        data-testid="prompt-batch-sell"
                    >
                        {t("market.sellSelected")}
                    </Button>
                    <Button size="small" danger icon={<Trash2 className="size-3.5" />} disabled={!selectedIds.length} onClick={() => confirmDelete(selectedIds)} data-testid="prompt-batch-delete">
                        {t("common.delete")}
                    </Button>
                    <Button
                        size="small"
                        type="text"
                        icon={<X className="size-4" />}
                        onClick={() => {
                            setSelecting(false);
                            setSelected(new Set());
                        }}
                    >
                        {t("myPrompts.batch.done")}
                    </Button>
                </div>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    <Select<MyPromptSort>
                        size="middle"
                        value={sort}
                        onChange={setSort}
                        className="w-32"
                        data-testid="my-prompt-sort"
                        options={[
                            { value: "latest", label: t("myPrompts.sort.latest") },
                            { value: "used", label: t("myPrompts.sort.used") },
                            { value: "most_used", label: t("myPrompts.sort.mostUsed") },
                        ]}
                    />
                    <span className="text-xs text-stone-400">{t("prompts.total", { count: total })}</span>
                    <span className="flex-1" />
                    <Button icon={<CheckSquare className="size-4" />} disabled={!items.length} onClick={() => setSelecting(true)} data-testid="prompt-batch-start">
                        {t("myPrompts.batch.start")}
                    </Button>
                    <Dropdown trigger={["click"]} disabled={!items.length} menu={{ items: exportMenu() }}>
                        <Button icon={<Download className="size-4" />} disabled={!items.length}>
                            {t("myPrompts.export")}
                        </Button>
                    </Dropdown>
                    <Button icon={<Import className="size-4" />} onClick={() => setImportOpen(true)} data-testid="prompt-import-open">
                        {t("myPrompts.import.open")}
                    </Button>
                    <Button type="primary" icon={<Plus className="size-4" />} onClick={() => openEditor({ folderId: viewFolderId || undefined })} data-testid="my-prompt-create">
                        {t("myPrompts.create")}
                    </Button>
                </div>
            )}

            {list.isLoading ? (
                <div className="flex h-60 items-center justify-center">
                    <Spin />
                </div>
            ) : nothingSaved ? (
                <div className="rounded-2xl border border-dashed border-stone-300 px-6 py-12 text-center dark:border-stone-700" data-testid="my-prompts-onboarding">
                    <h3 className="text-lg font-semibold text-stone-900 dark:text-stone-100">{t("myPrompts.onboarding.title")}</h3>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-stone-500 dark:text-stone-400">{t("myPrompts.onboarding.body")}</p>
                    <div className="mt-5 flex justify-center gap-2">
                        <Button type="primary" size="large" icon={<Import className="size-4" />} onClick={() => setImportOpen(true)}>
                            {t("myPrompts.import.open")}
                        </Button>
                        <Button size="large" icon={<Plus className="size-4" />} onClick={() => openEditor({})}>
                            {t("myPrompts.create")}
                        </Button>
                    </div>
                    <p className="mt-4 text-xs text-stone-400">{t("myPrompts.onboarding.templateHint")}</p>
                </div>
            ) : empty ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} className="py-16" description={debouncedKeyword || sceneFilter ? t("prompts.empty") : t("myPrompts.folderEmpty")} />
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="prompt-grid">
                    {items.map((item) => {
                        const id = item.serverId!;
                        return (
                            <PromptCard
                                key={promptKey(item)}
                                item={item}
                                onOpen={() => onOpen(item)}
                                onDraw={() => actions.draw(item)}
                                onCopy={() => actions.copy(item)}
                                onEdit={() => actions.saveMine(item)}
                                onDelete={() => actions.deleteMine(item)}
                                selection={selecting ? { selected: selected.has(id), onToggle: () => toggle(id) } : undefined}
                                extra={
                                    <Dropdown
                                        trigger={["click"]}
                                        menu={{
                                            items: [
                                                item.pinned
                                                    ? { key: "unpin", icon: <PinOff className="size-3.5" />, label: t("myPrompts.unpin"), onClick: () => void runBatch([id], { action: "unpin" }, "myPrompts.batch.unpinned") }
                                                    : { key: "pin", icon: <Pin className="size-3.5" />, label: t("myPrompts.pin"), onClick: () => void runBatch([id], { action: "pin" }, "myPrompts.batch.pinned") },
                                                { key: "move", icon: <FolderInput className="size-3.5" />, label: t("myPrompts.batch.move"), children: moveItems([id]) },
                                            ],
                                        }}
                                    >
                                        <Button type="text" size="small" icon={<MoreHorizontal className="size-3.5" />} aria-label={t("myPrompts.more")} data-testid="prompt-mine-more" />
                                    </Dropdown>
                                }
                            />
                        );
                    })}
                </div>
            )}
            <div ref={sentinel} className="py-4 text-center text-xs text-stone-400">
                {list.isFetchingNextPage ? t("prompts.loading") : list.hasNextPage ? t("prompts.loadMore") : items.length ? t("prompts.end") : null}
            </div>

            <PromptImportDialog open={importOpen} onClose={() => setImportOpen(false)} apiKey={apiKey} folders={folderList} folderId={viewFolderId} />
            <Modal
                open={Boolean(folderEdit)}
                onCancel={() => setFolderEdit(null)}
                onOk={() => void saveFolder()}
                destroyOnHidden
                width={380}
                title={folderEdit?.folder ? t("myPrompts.folders.renameTitle") : t("myPrompts.folders.createTitle")}
                okText={t("common.save")}
                cancelText={t("common.cancel")}
            >
                <Input
                    autoFocus
                    maxLength={20}
                    value={folderEdit?.name || ""}
                    placeholder={t("myPrompts.folders.namePlaceholder")}
                    onChange={(event) => setFolderEdit((current) => (current ? { ...current, name: event.target.value } : current))}
                    onPressEnter={() => void saveFolder()}
                    data-testid="prompt-folder-name"
                />
            </Modal>
        </div>
    );
}
