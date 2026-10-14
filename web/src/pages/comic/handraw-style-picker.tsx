import { useEffect, useState } from "react";
import { Empty, Input, Modal, Spin } from "antd";
import { useTranslation } from "react-i18next";

import type { ComicStyleChoice } from "@/lib/comic";
import { fetchPrompts, type Prompt } from "@/services/api/prompts";

// The 手绘风格图鉴 source of the prompt library (yang0/handraw-style): its prompts are
// 「【画面主题：…】\n\n画风：<name>，手绘插画。\n风格特征：<traits>」; the lines after the subject become the comic style.
const SOURCE_ID = "handraw-style";

export function handrawStyle(item: Prompt): ComicStyleChoice | null {
    const body = item.prompt.replace(/^【[^】]*】\s*/, "").trim();
    if (!body.includes("画风")) return null;
    const name = (item.title.split("·").pop() || item.title).trim();
    return { id: `handraw:${item.id}`, name, prompt: body.replace(/\s*\n+\s*/g, "，").replace(/[。，]+$/, ""), cover: item.coverUrl };
}

export function HandrawStylePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (style: ComicStyleChoice) => void }) {
    const { t } = useTranslation();
    const [keyword, setKeyword] = useState("");
    const [items, setItems] = useState<Prompt[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        const timer = window.setTimeout(() => {
            void fetchPrompts({ category: SOURCE_ID, keyword, pageSize: 60, sort: "recommended" })
                .then((res) => {
                    if (!cancelled) setItems(res.items.filter((item) => item.sourceId === SOURCE_ID || item.title.startsWith("手绘")));
                })
                .catch(() => {
                    if (!cancelled) setItems([]);
                })
                .finally(() => {
                    if (!cancelled) setLoading(false);
                });
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [open, keyword]);

    return (
        <Modal open={open} onCancel={onClose} footer={null} width={860} title={t("comic.start.handrawTitle")}>
            <Input.Search allowClear placeholder={t("comic.start.handrawSearch")} value={keyword} onChange={(event) => setKeyword(event.target.value)} className="mb-3" />
            <div className="max-h-[60vh] overflow-y-auto">
                {loading ? (
                    <div className="flex h-40 items-center justify-center">
                        <Spin />
                    </div>
                ) : items.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {items.map((item) => {
                            const style = handrawStyle(item);
                            if (!style) return null;
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => onPick(style)}
                                    className="overflow-hidden rounded-xl border border-stone-200 bg-white text-left transition hover:border-(--skin-accent) dark:border-stone-700 dark:bg-stone-900"
                                >
                                    {item.coverUrl ? <img src={item.coverUrl} alt="" loading="lazy" className="h-28 w-full object-cover" /> : <span className="block h-28 bg-stone-100 dark:bg-stone-800" />}
                                    <span className="line-clamp-2 block px-2 py-1.5 text-xs text-stone-800 dark:text-stone-200">{style.name}</span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("comic.start.handrawEmpty")} />
                )}
            </div>
        </Modal>
    );
}
