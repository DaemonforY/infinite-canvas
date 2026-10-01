import { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Segmented } from "antd";
import { Expand } from "lucide-react";
import { useTranslation } from "react-i18next";

import { readImageMeta } from "@/lib/image-utils";
import { OUTPAINT_FILL, OUTPAINT_RATIOS, buildOutpaintImage, planOutpaint, type OutpaintAnchor } from "@/lib/outpaint";

export type CanvasImageOutpaintPayload = {
    /** The original on the larger canvas, blank area grey (PNG data URL). */
    layoutDataUrl: string;
    /** Ratio requested from the model. */
    size: string;
    prompt: string;
};

const ZOOM_FACTORS = [1.25, 1.5, 2];

export function CanvasNodeOutpaintDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (payload: CanvasImageOutpaintPayload) => void }) {
    const { t } = useTranslation();
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const [ratio, setRatio] = useState("keep");
    const [factor, setFactor] = useState(1.5);
    const [anchor, setAnchor] = useState<OutpaintAnchor>("center");
    const [prompt, setPrompt] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        setRatio("keep");
        setFactor(1.5);
        setAnchor("center");
        setPrompt("");
        setError("");
        void readImageMeta(dataUrl).then(setImage);
    }, [dataUrl, open]);

    const zoom = ratio === "keep";
    const plan = useMemo(() => (image ? planOutpaint(image.width, image.height, ratio, zoom ? factor : 1, zoom ? "center" : anchor) : null), [image, ratio, zoom, factor, anchor]);
    const widens = Boolean(plan && image && plan.width > image.width);

    const confirm = async () => {
        if (!plan) return;
        setBusy(true);
        setError("");
        try {
            onConfirm({ layoutDataUrl: await buildOutpaintImage(dataUrl, plan), size: plan.size, prompt: prompt.trim() });
        } catch {
            setError(t("canvas.outpaint.failed"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Modal title={t("canvas.outpaint.title")} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={860} centered destroyOnHidden>
            <div className="grid gap-5 md:grid-cols-[minmax(300px,1fr)_280px]" data-canvas-no-zoom>
                <div className="flex h-[min(60vh,560px)] min-h-[300px] items-center justify-center rounded-xl border border-black/10 p-4 dark:border-white/10">
                    {image ? (
                        <div
                            className="relative overflow-hidden rounded"
                            style={{
                                // As large as fits the preview box (its height minus padding) at the canvas ratio.
                                aspectRatio: `${plan?.width || image.width} / ${plan?.height || image.height}`,
                                width: `min(100%, calc((max(300px, min(60vh, 560px)) - 2rem) * ${(plan?.width || image.width) / (plan?.height || image.height)}))`,
                                backgroundColor: OUTPAINT_FILL,
                                backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,.12) 0 10px, transparent 10px 20px)",
                            }}
                            data-testid="outpaint-preview"
                        >
                            <img
                                src={dataUrl}
                                alt=""
                                draggable={false}
                                className="absolute block select-none"
                                style={
                                    plan
                                        ? { left: `${(plan.x / plan.width) * 100}%`, top: `${(plan.y / plan.height) * 100}%`, width: `${(image.width / plan.width) * 100}%`, height: `${(image.height / plan.height) * 100}%` }
                                        : { inset: 0, width: "100%", height: "100%" }
                                }
                            />
                        </div>
                    ) : (
                        <span className="text-sm opacity-60">{t("canvas.editors.loading")}</span>
                    )}
                </div>

                <div className="flex flex-col gap-4 text-sm">
                    <div className="text-xs leading-5 opacity-60">{t("canvas.outpaint.hint")}</div>
                    <div className="grid gap-1.5">
                        <span className="font-medium">{t("canvas.outpaint.ratio")}</span>
                        <div className="flex flex-wrap gap-1.5">
                            {["keep", ...OUTPAINT_RATIOS].map((value) => (
                                <Button key={value} size="small" type={ratio === value ? "primary" : "default"} onClick={() => setRatio(value)}>
                                    {value === "keep" ? t("canvas.outpaint.keep") : value}
                                </Button>
                            ))}
                        </div>
                    </div>
                    {zoom ? (
                        <div className="grid gap-1.5">
                            <span className="font-medium">{t("canvas.outpaint.factor")}</span>
                            <Segmented block value={factor} onChange={(value) => setFactor(Number(value))} options={ZOOM_FACTORS.map((value) => ({ value, label: `${value}×` }))} />
                        </div>
                    ) : plan ? (
                        <div className="grid gap-1.5">
                            <span className="font-medium">{t("canvas.outpaint.anchor")}</span>
                            <Segmented
                                block
                                value={anchor}
                                onChange={(value) => setAnchor(value as OutpaintAnchor)}
                                options={(["start", "center", "end"] as const).map((value) => ({ value, label: t(`canvas.outpaint.anchors.${widens ? "x" : "y"}.${value}`) }))}
                            />
                        </div>
                    ) : null}
                    {image && !plan ? <div className="text-xs font-medium text-[#f59e0b]">{t("canvas.outpaint.sameRatio")}</div> : null}
                    <div className="grid gap-1.5">
                        <span className="font-medium">{t("canvas.outpaint.prompt")}</span>
                        <Input.TextArea rows={3} maxLength={300} value={prompt} placeholder={t("canvas.outpaint.promptPlaceholder")} onChange={(event) => setPrompt(event.target.value)} />
                    </div>
                    {plan && image ? <div className="text-xs opacity-55">{t("canvas.outpaint.size", { from: `${image.width}×${image.height}`, ratio: plan.size })}</div> : null}
                    {error ? <div className="text-xs font-medium text-[#ef4444]">{error}</div> : null}
                    <Button type="primary" className="mt-auto" icon={<Expand className="size-4" />} disabled={!plan} loading={busy} onClick={() => void confirm()} data-testid="outpaint-generate">
                        {t("canvas.outpaint.generate")}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
