import { useEffect, useState } from "react";
import { Button, Empty, Modal, Segmented, Spin } from "antd";
import { useTranslation } from "react-i18next";

import { formatClipDuration, loadAssetVideos, loadWorkbenchVideos, type SiteVideo } from "@/lib/site-videos";

type Source = "video_workbench" | "asset";

/** Picks one video made on this site (视频记录 / 我的资产) for a video work. */
export function SiteVideoPicker({ open, onPick, onClose }: { open: boolean; onPick: (video: SiteVideo) => void; onClose: () => void }) {
    const { t } = useTranslation();
    const [source, setSource] = useState<Source>("video_workbench");
    const [workbench, setWorkbench] = useState<SiteVideo[] | null>(null);
    const [selected, setSelected] = useState<SiteVideo | null>(null);
    const assets = open && source === "asset" ? loadAssetVideos() : [];

    useEffect(() => {
        if (!open) return;
        setSelected(null);
        let cancelled = false;
        void loadWorkbenchVideos().then((list) => !cancelled && setWorkbench(list));
        return () => {
            cancelled = true;
        };
    }, [open]);

    const list = source === "asset" ? assets : workbench;

    return (
        <Modal
            open={open}
            title={t("community.publish.video.pickerTitle")}
            onCancel={onClose}
            width={760}
            destroyOnHidden
            footer={
                <div className="flex justify-end gap-2">
                    <Button onClick={onClose}>{t("common.cancel")}</Button>
                    <Button type="primary" disabled={!selected} onClick={() => selected && onPick(selected)} data-testid="video-picker-confirm">
                        {t("community.publish.video.confirm")}
                    </Button>
                </div>
            }
        >
            <Segmented
                value={source}
                onChange={(value) => setSource(value as Source)}
                options={[
                    { value: "video_workbench", label: t("community.publish.video.workbench") },
                    { value: "asset", label: t("community.publish.video.assets") },
                ]}
            />
            <div className="mt-3 max-h-[60vh] overflow-y-auto">
                {list === null ? (
                    <div className="flex justify-center py-10">
                        <Spin />
                    </div>
                ) : list.length ? (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="video-picker-grid">
                        {list.map((video) => {
                            const on = selected?.id === video.id;
                            return (
                                <button
                                    key={video.id}
                                    type="button"
                                    title={video.prompt}
                                    onClick={() => setSelected(on ? null : video)}
                                    className={`relative aspect-video overflow-hidden rounded-lg border-2 bg-black ${on ? "border-violet-500" : "border-transparent hover:border-stone-300"}`}
                                    data-testid="video-picker-item"
                                >
                                    {/* #t=0.1 shows a frame instead of a black box before playing. */}
                                    <video src={`${video.src}#t=0.1`} muted playsInline preload="metadata" className="pointer-events-none size-full object-cover" />
                                    {video.durationMs ? <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1 text-[11px] text-white">{formatClipDuration(video.durationMs)}</span> : null}
                                    {on ? <span className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-violet-600 text-xs text-white">✓</span> : null}
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <Empty className="py-10" description={t(source === "asset" ? "community.publish.video.noAssets" : "community.publish.video.noWorkbench")} />
                )}
            </div>
        </Modal>
    );
}
