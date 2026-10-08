import { useEffect, useState } from "react";
import { App } from "antd";
import { saveAs } from "file-saver";
import { Crown, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { mainSiteLink } from "@/constant/runtime-config";
import { watermarkImage } from "@/lib/watermark";
import { isWatermarkFree, logUnmarkedSave } from "@/services/api/main-site-account";
import { useMainAccountStore } from "@/stores/use-main-account-store";

/** WeChat's in-app browser ignores downloads; the only way to keep an image there is a long press. */
export function isWeChatBrowser() {
    return typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent);
}

export function useWatermarkFree() {
    const account = useMainAccountStore((state) => state.account);
    return isWatermarkFree(account);
}

/** 去水印 is offered only while 创作会员 is on sale (and only to signed-in users, who can buy it). */
export function useMembershipOnSale() {
    return useMainAccountStore((state) => state.account?.membership_on_sale === true);
}

export function membershipLink(medium: string) {
    return mainSiteLink("/purchase?tab=membership", medium);
}

type Saveable = { dataUrl: string; mimeType?: string; width?: number; height?: number };

/** Saves workbench images: watermarked unless the account has 创作会员; in WeChat shows the image for a long press. */
export function useSaveImage() {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const free = useWatermarkFree();
    const onSale = useMembershipOnSale();
    const [longPressUrl, setLongPressUrl] = useState("");

    useEffect(() => {
        if (!longPressUrl) return;
        return () => URL.revokeObjectURL(longPressUrl);
    }, [longPressUrl]);

    // Members get the original; each such save is logged on the main site (labelling rules, 第九条).
    // If the membership ended meanwhile, the save falls back to the watermarked image.
    const imageBlob = async (image: Saveable) => {
        if (free && (await logUnmarkedSave(image.width || 0, image.height || 0))) return fetch(image.dataUrl).then((res) => res.blob());
        if (free) void useMainAccountStore.getState().refresh();
        return watermarkImage(image.dataUrl, image.mimeType);
    };

    const save = async (image: Saveable, name: string) => {
        try {
            const blob = await imageBlob(image);
            const extension = blob.type === "image/jpeg" ? "jpg" : blob.type === "image/webp" ? "webp" : "png";
            if (isWeChatBrowser()) setLongPressUrl(URL.createObjectURL(blob));
            else saveAs(blob, `${name}.${extension}`);
        } catch {
            message.error(t("studio.save.failed"));
        }
    };

    const overlay = longPressUrl ? (
        <div className="fixed inset-0 z-[1100] flex flex-col items-center justify-center gap-4 bg-black/95 p-5" onClick={() => setLongPressUrl("")}>
            <button type="button" className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-full bg-white/10 text-white" aria-label={t("common.cancel")}>
                <X className="size-5" />
            </button>
            <img src={longPressUrl} alt="" className="max-h-[72vh] max-w-full rounded-lg object-contain" onClick={(event) => event.stopPropagation()} />
            <div className="text-sm text-stone-200">{t("studio.save.longPress")}</div>
            {!free && onSale ? (
                <a href={membershipLink("wechat-save")} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-amber-300" onClick={(event) => event.stopPropagation()}>
                    <Crown className="size-3.5" />
                    {t("studio.watermark.removeHint")}
                </a>
            ) : null}
        </div>
    ) : null;

    return { save, free, onSale, overlay };
}
