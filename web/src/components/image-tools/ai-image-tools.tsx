import { useCallback, useEffect, useState } from "react";
import { ColorPicker, Segmented } from "antd";
import { useTranslation } from "react-i18next";

import { MAIN_SITE_NAME } from "@/constant/runtime-config";
import { applyBackground, fitForUpload, renameForType, type ImageToolResult } from "@/lib/image-tools";
import { findMainSiteApiKey } from "@/services/api/main-site-contests";
import { fetchImageToolsQuota, runServerImageTool, type ImageToolsQuota } from "@/services/api/main-site-image-tools";
import { useConfigStore } from "@/stores/use-config-store";

export type AiToolMode = "removeBg" | "upscale";
export type AiToolSettings = { model: "isnet" | "u2net"; background: string; scale: 2 | 4 };
export const DEFAULT_AI_TOOL_SETTINGS: AiToolSettings = { model: "isnet", background: "", scale: 4 };

const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;
// The server never outputs more than 4096px, so larger uploads only cost bandwidth.
const UPLOAD_MAX_EDGE: Record<AiToolMode, number> = { removeBg: 4096, upscale: 2048 };

/** The connected HiveGPT key and today's free runs / prices for it. */
export function useImageToolsQuota() {
    const apiKey = useConfigStore((state) => findMainSiteApiKey(state.config));
    const [quota, setQuota] = useState<ImageToolsQuota | null>(null);
    const refresh = useCallback(async () => {
        if (!apiKey) return setQuota(null);
        try {
            setQuota(await fetchImageToolsQuota(apiKey));
        } catch {
            setQuota(null);
        }
    }, [apiKey]);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    return { apiKey, quota, refresh };
}

/** Uploads one image to the server tool and returns the finished image (background applied). */
export async function runAiTool(apiKey: string, mode: AiToolMode, settings: AiToolSettings, source: Blob, name: string): Promise<ImageToolResult> {
    const input = await fitForUpload(source, name, UPLOAD_MAX_EDGE[mode], UPLOAD_MAX_BYTES);
    const sourceBitmap = await createImageBitmap(input);
    const sourceSize = { width: sourceBitmap.width, height: sourceBitmap.height };
    sourceBitmap.close();
    let blob = await runServerImageTool(apiKey, mode === "removeBg" ? "remove-bg" : "upscale", input, mode === "removeBg" ? { model: settings.model } : { scale: settings.scale });
    if (mode === "removeBg") blob = await applyBackground(blob, settings.background);
    const bitmap = await createImageBitmap(blob);
    const result = { blob, name: renameForType(name, blob.type || "image/png"), width: bitmap.width, height: bitmap.height, sourceWidth: sourceSize.width, sourceHeight: sourceSize.height, capped: false, kept: false };
    bitmap.close();
    return result;
}

const BACKGROUNDS = ["", "#ffffff", "#000000", "#f5f5f4", "#2563eb", "#dc2626"];

/** Options and price / free-runs line for the server tools. */
export function AiToolOptionsForm({ mode, value, onChange, quota, connected }: { mode: AiToolMode; value: AiToolSettings; onChange: (value: AiToolSettings) => void; quota: ImageToolsQuota | null; connected: boolean }) {
    const { t } = useTranslation();
    const price = quota ? (mode === "removeBg" ? quota.prices.remove_bg : quota.prices.upscale) : 0;
    return (
        <div className="grid gap-4 text-sm">
            {mode === "removeBg" ? (
                <>
                    <div className="grid gap-1.5">
                        <span className="font-medium">{t("toolbox.ai.model")}</span>
                        <Segmented
                            block
                            value={value.model}
                            onChange={(model) => onChange({ ...value, model: model as AiToolSettings["model"] })}
                            options={[
                                { value: "isnet", label: t("toolbox.ai.models.isnet") },
                                { value: "u2net", label: t("toolbox.ai.models.u2net") },
                            ]}
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <span className="font-medium">{t("toolbox.ai.background")}</span>
                        <div className="flex flex-wrap items-center gap-2">
                            {BACKGROUNDS.map((color) => (
                                <button
                                    key={color || "none"}
                                    type="button"
                                    title={color ? color : t("toolbox.ai.transparent")}
                                    onClick={() => onChange({ ...value, background: color })}
                                    className={`size-7 rounded-md border ${value.background === color ? "ring-2 ring-stone-900 ring-offset-1 dark:ring-stone-100" : "border-stone-300 dark:border-stone-700"}`}
                                    style={color ? { background: color } : { backgroundImage: "repeating-conic-gradient(#d6d3d1 0 25%, #fff 0 50%)", backgroundSize: "10px 10px" }}
                                />
                            ))}
                            <ColorPicker size="small" value={value.background || "#ffffff"} onChangeComplete={(color) => onChange({ ...value, background: color.toHexString() })} />
                        </div>
                    </div>
                </>
            ) : (
                <div className="grid gap-1.5">
                    <span className="font-medium">{t("toolbox.ai.scale")}</span>
                    <Segmented
                        block
                        value={value.scale}
                        onChange={(scale) => onChange({ ...value, scale: scale as AiToolSettings["scale"] })}
                        options={[
                            { value: 2, label: "2×" },
                            { value: 4, label: "4×" },
                        ]}
                    />
                    <span className="text-xs text-stone-500">{t("toolbox.ai.scaleHint")}</span>
                </div>
            )}
            <p className="m-0 text-xs leading-5 text-stone-500">
                {!connected
                    ? t("toolbox.ai.connect", { site: MAIN_SITE_NAME })
                    : !quota
                      ? t("toolbox.ai.quotaUnknown")
                      : !quota.enabled
                        ? t("toolbox.ai.disabled")
                        : quota.subscribed
                          ? t("toolbox.ai.subscribed", { left: quota.free_left, daily: quota.free_daily, price, balance: quota.balance.toFixed(2) })
                          : t("toolbox.ai.payg", { price, daily: quota.free_daily, balance: quota.balance.toFixed(2) })}
            </p>
        </div>
    );
}
