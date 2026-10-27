import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

/**
 * A panel that slides up from the bottom of a phone screen: a dimmed backdrop (tap to close), a grab bar, an optional
 * title with a close button, and room for the home indicator. Taller content scrolls inside the sheet.
 */
export function BottomSheet({ open, onClose, title, children, bodyClassName, testId }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; bodyClassName?: string; testId?: string }) {
    const { t } = useTranslation();

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        // The page behind must not scroll along with the sheet.
        const overflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = overflow;
        };
    }, [open, onClose]);

    if (!open) return null;
    return createPortal(
        // antd's layer: a dialog opened from inside the sheet (e.g. 连接 HiveGPT) mounts later and stays on top.
        <div className="fixed inset-0 z-[1000] flex flex-col justify-end" data-testid={testId}>
            <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label={t("common.cancel")} />
            <div className="relative flex max-h-[85dvh] flex-col rounded-t-2xl bg-card pb-[env(safe-area-inset-bottom)] shadow-2xl">
                <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-stone-300 dark:bg-stone-600" />
                {title ? (
                    <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-2">
                        <span className="min-w-0 flex-1 text-[15px] font-semibold">{title}</span>
                        <button type="button" className="flex size-9 items-center justify-center rounded-full text-stone-500 active:bg-stone-100 dark:active:bg-stone-800" onClick={onClose} aria-label={t("common.cancel")}>
                            <X className="size-5" />
                        </button>
                    </div>
                ) : null}
                <div className={cn("min-h-0 overflow-y-auto overscroll-contain px-4 pb-4 pt-2", bodyClassName)}>{children}</div>
            </div>
        </div>,
        document.body,
    );
}
