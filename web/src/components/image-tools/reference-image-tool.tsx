import { useState, type Dispatch, type SetStateAction } from "react";
import { App } from "antd";
import { nanoid } from "nanoid";
import { useTranslation } from "react-i18next";

import { ImageToolDialog, LARGE_REFERENCE_BYTES } from "@/components/image-tools/image-tool-dialog";
import { normalizeImageFile } from "@/lib/image-tools";
import { formatBytes } from "@/lib/image-utils";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import type { ReferenceImage } from "@/types/image";

/** Stores an uploaded / pasted file as a workbench reference (HEIC photos become JPEG first). */
export async function createReferenceImage(file: Blob, name: string): Promise<ReferenceImage> {
    const normalized = file instanceof File ? await normalizeImageFile(file) : file;
    const image = await uploadImage(normalized);
    return { id: nanoid(), name: normalized instanceof File ? normalized.name : name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes };
}

/** "Compress / resize" for one reference of a workbench; returns the opener and the dialog to render. */
export function useReferenceImageTool(setReferences: Dispatch<SetStateAction<ReferenceImage[]>>) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [target, setTarget] = useState<{ id: string; name: string; blob: Blob } | null>(null);

    const open = async (item: ReferenceImage) => {
        try {
            const blob = (item.storageKey && (await getImageBlob(item.storageKey))) || (await (await fetch(item.dataUrl)).blob());
            setTarget({ id: item.id, name: item.name, blob });
        } catch {
            message.error(t("toolbox.decodeFailed"));
        }
    };

    const dialog = (
        <ImageToolDialog
            open={Boolean(target)}
            source={target?.blob || null}
            name={target?.name || ""}
            onClose={() => setTarget(null)}
            onApply={async (file) => {
                if (!target) return;
                const image = await uploadImage(file);
                setReferences((value) => value.map((ref) => (ref.id === target.id ? { id: ref.id, name: file.name, type: image.mimeType, dataUrl: image.url, storageKey: image.storageKey, bytes: image.bytes } : ref)));
            }}
        />
    );
    return { open, dialog };
}

/** Size of a reference on its thumbnail; large ones are flagged. Opens the tool dialog. */
export function ReferenceSizeBadge({ item, onOpen }: { item: ReferenceImage; onOpen: () => void }) {
    const { t } = useTranslation();
    if (!item.bytes) return null;
    const large = item.bytes > LARGE_REFERENCE_BYTES;
    const size = formatBytes(item.bytes);
    return (
        <button
            type="button"
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm transition ${large ? "bg-red-600/90 hover:bg-red-600" : "bg-black/55 opacity-0 hover:bg-black/75 focus-visible:opacity-100 group-hover:opacity-100"}`}
            title={t(large ? "toolbox.referenceLarge" : "toolbox.referenceSize", { size })}
            aria-label={t(large ? "toolbox.referenceLarge" : "toolbox.referenceSize", { size })}
            onClick={onOpen}
            data-testid="reference-size"
        >
            {size}
        </button>
    );
}
