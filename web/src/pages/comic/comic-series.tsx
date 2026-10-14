import { useEffect, useState } from "react";
import { Button, Empty, Input, Modal, Popconfirm } from "antd";
import { Check, LoaderCircle, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { listLibrary, removeFromLibrary, type LibraryCharacter } from "./comic-library";
import { ComicImageView } from "./comic-lettering";

/** 我的角色: pick saved characters (several at once) or remove them. */
export function LibraryPicker({ open, onClose, onPick, picked = [] }: { open: boolean; onClose: () => void; onPick: (entries: LibraryCharacter[]) => void; picked?: string[] }) {
    const { t } = useTranslation();
    const [items, setItems] = useState<LibraryCharacter[] | null>(null);
    const [selected, setSelected] = useState<string[]>(picked);

    useEffect(() => {
        if (!open) return;
        setSelected(picked);
        void listLibrary().then(setItems);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const toggle = (id: string) => setSelected((value) => (value.includes(id) ? value.filter((item) => item !== id) : [...value, id]));

    return (
        <Modal
            open={open}
            onCancel={onClose}
            width={760}
            title={t("comic.library.title")}
            okText={selected.length ? t("comic.library.use", { count: selected.length }) : t("comic.library.useNone")}
            cancelText={t("common.cancel")}
            okButtonProps={{ disabled: !items?.length }}
            onOk={() => onPick((items || []).filter((item) => selected.includes(item.id)))}
        >
            <p className="mb-3 text-xs text-stone-500">{t("comic.library.hint")}</p>
            {items && !items.length ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("comic.library.empty")} />
            ) : (
                <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                    {(items || []).map((item) => {
                        const on = selected.includes(item.id);
                        return (
                            <div key={item.id} className={`group relative overflow-hidden rounded-xl border-2 bg-white dark:bg-stone-900 ${on ? "border-(--skin-accent)" : "border-stone-200 dark:border-stone-700"}`}>
                                <button type="button" className="block w-full text-left" onClick={() => toggle(item.id)} data-testid="comic-library-item">
                                    <ComicImageView image={item.sheet} className="h-28 w-full bg-[#fbfaf6] object-contain" />
                                    <span className="block px-2.5 pb-2 pt-1.5">
                                        <b className="block text-sm text-stone-900 dark:text-stone-100">{item.name}</b>
                                        <span className="line-clamp-2 text-[11px] leading-4 text-stone-500">{item.look}</span>
                                        <span className="mt-0.5 block text-[11px] text-stone-400">{item.styleName}</span>
                                    </span>
                                </button>
                                {on ? (
                                    <span className="absolute left-2 top-2 flex size-6 items-center justify-center rounded-full bg-(--skin-accent) text-white">
                                        <Check className="size-3.5" />
                                    </span>
                                ) : null}
                                <Popconfirm
                                    title={t("comic.library.removeConfirm", { name: item.name })}
                                    okText={t("common.delete")}
                                    cancelText={t("common.cancel")}
                                    onConfirm={async () => {
                                        await removeFromLibrary(item.id);
                                        setItems((value) => (value || []).filter((entry) => entry.id !== item.id));
                                        setSelected((value) => value.filter((id) => id !== item.id));
                                    }}
                                >
                                    <Button type="text" size="small" className="!absolute right-1 top-1 opacity-0 group-hover:opacity-100 max-sm:opacity-100" icon={<Trash2 className="size-3.5" />} aria-label={t("common.delete")} />
                                </Popconfirm>
                            </div>
                        );
                    })}
                </div>
            )}
        </Modal>
    );
}

/** 画第 N 话: an optional idea; the story continues from the episodes before with the same cast and style. */
export function NextEpisodeModal({ open, seriesTitle, episode, busy, progress, onClose, onStart }: { open: boolean; seriesTitle: string; episode: number; busy: boolean; progress: string; onClose: () => void; onStart: (idea: string) => void }) {
    const { t } = useTranslation();
    const [idea, setIdea] = useState("");
    useEffect(() => {
        if (open) setIdea("");
    }, [open]);
    return (
        <Modal open={open} onCancel={busy ? undefined : onClose} closable={!busy} maskClosable={!busy} footer={null} title={t("comic.series.nextTitle", { title: seriesTitle, n: episode })}>
            <p className="mb-2 text-sm text-stone-600 dark:text-stone-300">{t("comic.series.nextDesc")}</p>
            <Input.TextArea value={idea} onChange={(event) => setIdea(event.target.value.slice(0, 300))} rows={3} placeholder={t("comic.series.nextPlaceholder")} disabled={busy} data-testid="comic-next-idea" />
            <div className="mt-3 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs text-stone-400">{busy ? progress : t("comic.series.nextHint")}</span>
                <Button type="primary" icon={busy ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} disabled={busy} onClick={() => onStart(idea)} data-testid="comic-next-write">
                    {t("comic.start.write")}
                </Button>
            </div>
        </Modal>
    );
}
