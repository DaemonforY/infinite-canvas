import { useEffect, useState } from "react";
import { Button, Empty, Modal, Segmented, Spin } from "antd";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

import { loadAssetImages, loadWorkbenchImages, type SiteImage } from "@/lib/site-images";

type Source = "image_workbench" | "asset";

/** Picks images made on this site (生图记录 / 我的资产), up to max, in the order clicked. */
export function SiteImagePicker({ open, max, onPick, onClose }: { open: boolean; max: number; onPick: (images: SiteImage[]) => void; onClose: () => void }) {
    const { t } = useTranslation();
    const [source, setSource] = useState<Source>("image_workbench");
    const [workbench, setWorkbench] = useState<SiteImage[] | null>(null);
    const [selected, setSelected] = useState<SiteImage[]>([]);
    const assets = open && source === "asset" ? loadAssetImages() : [];

    useEffect(() => {
        if (!open) return;
        setSelected([]);
        let cancelled = false;
        void loadWorkbenchImages().then((list) => !cancelled && setWorkbench(list));
        return () => {
            cancelled = true;
        };
    }, [open]);

    const list = source === "asset" ? assets : workbench;
    const toggle = (image: SiteImage) =>
        setSelected((current) => (current.some((s) => s.id === image.id) ? current.filter((s) => s.id !== image.id) : current.length >= max ? current : [...current, image]));

    return (
        <Modal
            open={open}
            title={t("community.publish.picker.title")}
            onCancel={onClose}
            width={760}
            destroyOnHidden
            footer={
                <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-stone-500">{t("community.publish.picker.limit", { count: max })}</span>
                    <div className="flex gap-2">
                        <Button onClick={onClose}>{t("common.cancel")}</Button>
                        <Button type="primary" disabled={!selected.length} onClick={() => onPick(selected)} data-testid="site-picker-confirm">
                            {t("community.publish.picker.confirm", { count: selected.length })}
                        </Button>
                    </div>
                </div>
            }
        >
            <Segmented
                value={source}
                onChange={(value) => setSource(value as Source)}
                options={[
                    { value: "image_workbench", label: t("community.publish.picker.workbench") },
                    { value: "asset", label: t("community.publish.picker.assets") },
                ]}
            />
            <div className="mt-3 max-h-[60vh] overflow-y-auto">
                {list === null ? (
                    <div className="flex justify-center py-10">
                        <Spin />
                    </div>
                ) : list.length ? (
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" data-testid="site-picker-grid">
                        {list.map((image) => {
                            const order = selected.findIndex((s) => s.id === image.id);
                            return (
                                <button
                                    key={image.id}
                                    type="button"
                                    title={image.prompt}
                                    onClick={() => toggle(image)}
                                    className={`relative aspect-square overflow-hidden rounded-lg border-2 bg-stone-100 dark:bg-stone-900 ${order >= 0 ? "border-violet-500" : "border-transparent hover:border-stone-300"}`}
                                    data-testid="site-picker-item"
                                >
                                    <img src={image.thumb} alt="" loading="lazy" className="size-full object-cover" />
                                    <span className={`absolute right-1 top-1 flex size-6 items-center justify-center rounded-full text-xs font-semibold ${order >= 0 ? "bg-violet-600 text-white" : "border border-white/80 bg-black/30"}`}>
                                        {order >= 0 ? order + 1 : <Check className="size-3.5 opacity-0" />}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <Empty className="py-10" description={t(source === "asset" ? "community.publish.picker.noAssets" : "community.publish.picker.noWorkbench")} />
                )}
            </div>
        </Modal>
    );
}
