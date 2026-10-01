import { useEffect, useState } from "react";
import { App, Button, Modal, Spin } from "antd";
import { Copy, Download } from "lucide-react";
import { useTranslation } from "react-i18next";

import { drawSharePoster } from "@/lib/share-poster";
import { authorName, mainSiteAsset, type Work } from "@/services/api/community";

/** Generates and shows the share poster of a work (download, or long-press to save on phones). */
export function SharePosterDialog({ work, url, onClose }: { work: Work; url: string; onClose: () => void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [poster, setPoster] = useState<{ blob: Blob; src: string } | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        let cancelled = false;
        let src = "";
        (async () => {
            const cover = work.media?.[0]?.url || work.cover_url;
            // no-store: an <img> may have cached this file without CORS headers, which a CORS fetch cannot reuse.
            const res = await fetch(mainSiteAsset(cover), { mode: "cors", cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const bitmap = await createImageBitmap(await res.blob());
            const blob = await drawSharePoster({
                cover: bitmap,
                title: work.title || t("community.untitled"),
                author: `${authorName(work.author)} · @${work.author.handle}`,
                prompt: work.prompt,
                url,
                siteName: t("meta.title"),
                aiLabel: t("community.aiLabel"),
                scanHint: t("community.poster.scanHint"),
            });
            bitmap.close();
            if (cancelled) return;
            src = URL.createObjectURL(blob);
            setPoster({ blob, src });
        })().catch(() => !cancelled && setError(t("community.poster.failed")));
        return () => {
            cancelled = true;
            if (src) URL.revokeObjectURL(src);
        };
    }, [t, url, work]);

    const download = () => {
        if (!poster) return;
        const a = document.createElement("a");
        a.href = poster.src;
        a.download = `hivegpt-work-${work.id}.jpg`;
        a.click();
    };

    return (
        <Modal open title={t("community.poster.title")} onCancel={onClose} footer={null} width={460} destroyOnHidden>
            <div className="grid gap-3" data-testid="share-poster">
                <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-900">
                    {poster ? <img src={poster.src} alt={t("community.poster.title")} className="max-h-[60vh] w-full object-contain" /> : error ? <span className="p-6 text-sm text-red-500">{error}</span> : <Spin />}
                </div>
                <p className="m-0 text-xs text-stone-500">{t("community.poster.hint")}</p>
                <div className="flex justify-end gap-2">
                    <Button
                        icon={<Copy className="size-4" />}
                        onClick={() => {
                            void navigator.clipboard?.writeText(url);
                            message.success(t("community.copied"));
                        }}
                    >
                        {t("community.copyLink")}
                    </Button>
                    <Button type="primary" icon={<Download className="size-4" />} disabled={!poster} onClick={download}>
                        {t("community.poster.download")}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
