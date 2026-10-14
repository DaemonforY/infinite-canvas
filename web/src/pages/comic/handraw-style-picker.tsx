import { useEffect, useState } from "react";
import { Empty, Input, Modal, Spin } from "antd";
import { useTranslation } from "react-i18next";

import type { ComicStyleChoice } from "@/lib/comic";
import { fetchPrompts, type Prompt } from "@/services/api/prompts";

// The 手绘风格图鉴 source of the prompt library (yang0/handraw-style): its prompts are
// 「【画面主题：…】\n\n画风：<name>，手绘插画。\n风格特征：<traits>」; the lines after the subject become the comic style.
const SOURCE_ID = "handraw-style";

// Styles named after an artist or author (Jimmy Liao, Mucha, Van Gogh…), a work or a studio (One Piece, Naruto, Ghibli,
// South Park, Spider-Verse, 天书奇谭…), and the propaganda poster: not offered for comics, which users publish. The
// prompt library still lists them.
const EXCLUDED = new Set([
    "FA-038",
    "FB-031",
    "FB-035",
    "FB-036",
    "FB-037",
    "FB-038",
    "FB-039",
    "FB-040",
    "FB-041",
    "FB-042",
    "FB-043",
    "FB-044",
    "FB-045",
    "FB-046",
    "FB-047",
    "FB-048",
    "FB-049",
    "FB-050",
    "FB-051",
    "FB-052",
    "FB-053",
    "FB-054",
    "FB-055",
    "FB-056",
    "FB-057",
    "FB-058",
    "FB-059",
    "FB-060",
    "FB-061",
    "FB-062",
    "FB-063",
    "FB-064",
    "FB-065",
    "FB-066",
    "FC-032",
    "FE-058",
    "FE-060",
    "FE-062",
    "FE-066",
    "FE-067",
    "FF-017",
    "FG-007",
    "FG-008",
    "FG-009",
    "FG-010",
    "FG-012",
    "FG-013",
    "FG-014",
    "FG-015",
    "FG-016",
    "FG-017",
    "FG-018",
    "FG-022",
    "FH-042",
]);

function styleCode(item: Prompt) {
    return item.title.match(/F[A-Z]-\d{3}/)?.[0] || "";
}

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
                    if (!cancelled) setItems(res.items.filter((item) => (item.sourceId === SOURCE_ID || item.title.startsWith("手绘")) && !EXCLUDED.has(styleCode(item))));
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
