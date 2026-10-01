import i18n from "@/i18n";
import type { ReferenceImage } from "@/types/image";

export function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return "";
    }
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }
    return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDuration(ms: number) {
    const value = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(value / 60);
    const seconds = value % 60;
    return minutes ? i18n.t("common.durationMinutes", { minutes, seconds: String(seconds).padStart(2, "0") }) : i18n.t("common.durationSeconds", { seconds });
}

export function getDataUrlByteSize(dataUrl: string) {
    const base64 = dataUrl.split(",", 2)[1];
    if (!base64) {
        return 0;
    }
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function readFileAsDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(file);
    });
}

export function readImageMeta(dataUrl: string) {
    return new Promise<{ width: number; height: number; mimeType: string }>((resolve) => {
        const image = new Image();
        const done = () => resolve({ width: image.naturalWidth || 1024, height: image.naturalHeight || 1024, mimeType: dataUrl.match(/^data:([^;]+)/)?.[1] || "image/png" });
        image.onload = done;
        image.onerror = done;
        setTimeout(done, 3000);
        image.src = dataUrl;
    });
}

export function dataUrlToFile(image: ReferenceImage) {
    const [header, content] = image.dataUrl.split(",", 2);
    const mimeType = header.match(/data:(.*?);base64/)?.[1] || image.type || "image/png";
    const binary = atob(content || "");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], image.name || "reference.png", { type: mimeType });
}

// The gateway (and OpenAI) reject image-edit requests over 20MB. Phone photos are often 5–10MB
// each, so reference images are shrunk before upload when the request would get close to that.
export const EDIT_REQUEST_BUDGET_BYTES = 16 * 1024 * 1024;
const REFERENCE_SOFT_LIMIT_BYTES = 4 * 1024 * 1024;

/** Which files to shrink: none when everything fits, else the large ones (biggest first) until it fits. */
export function planReferenceShrink(sizes: number[], budget = EDIT_REQUEST_BUDGET_BYTES): number[] {
    const total = sizes.reduce((sum, size) => sum + size, 0);
    if (total <= budget) return [];
    const order = sizes.map((size, index) => ({ size, index })).sort((a, b) => b.size - a.size);
    const picked: number[] = [];
    let remaining = total;
    for (const { size, index } of order) {
        if (remaining <= budget && size <= REFERENCE_SOFT_LIMIT_BYTES) break;
        picked.push(index);
        // A 2048px WebP is typically well under 1MB.
        remaining -= Math.max(0, size - 1024 * 1024);
    }
    return picked.sort((a, b) => a - b);
}

async function shrinkImageFile(file: File, maxEdge: number, quality: number): Promise<File> {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], (file.name || "reference").replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
}

/** Keeps an image-edit request under the upload limit by re-encoding the largest references. */
export async function fitReferenceFiles(files: File[], budget = EDIT_REQUEST_BUDGET_BYTES): Promise<File[]> {
    const picked = planReferenceShrink(files.map((file) => file.size), budget);
    if (!picked.length) return files;
    const out = [...files];
    for (const index of picked) {
        try {
            let shrunk = await shrinkImageFile(out[index], 2048, 0.9);
            if (shrunk.size > REFERENCE_SOFT_LIMIT_BYTES) shrunk = await shrinkImageFile(out[index], 1536, 0.82);
            out[index] = shrunk;
        } catch {
            // Undecodable here: send as is and let the server explain.
        }
    }
    return out;
}
