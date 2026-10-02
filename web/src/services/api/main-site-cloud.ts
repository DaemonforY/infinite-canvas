// HiveGPT cloud sync storage: the signed-in user's synced files on the main site
// (/api/v1/canvas/cloud, session cookie). The merging happens here in the browser (services/app-sync.ts).

import { MAIN_SITE_URL } from "@/constant/runtime-config";
import { stripEnglishOriginal } from "@/lib/provider-errors";
import type { SyncTransport } from "@/services/app-sync";

export type CloudUsage = { used_bytes: number; quota_bytes: number; files: number; subscribed: boolean };
type CloudFile = { path: string; size: number; mime: string; updated_at: string };

const CANVAS_HEADER = { "X-HiveGPT-Canvas": "1" };
const base = () => `${MAIN_SITE_URL}/api/v1/canvas/cloud`;
const fileUrl = (path: string) => `${base()}/files/${path.split("/").map(encodeURIComponent).join("/")}`;

/** Error with the server's message (Chinese, English original stripped) and reason code. */
export class CloudSyncError extends Error {
    constructor(
        message: string,
        readonly reason: string,
        readonly status: number,
    ) {
        super(message);
    }
}

async function fail(res: Response, fallback: string): Promise<never> {
    const body = (await res.json().catch(() => null)) as { message?: string; reason?: string } | null;
    throw new CloudSyncError(body?.message ? stripEnglishOriginal(body.message) : `${fallback} (HTTP ${res.status})`, body?.reason || "", res.status);
}

async function json<T>(res: Response, fallback: string): Promise<T> {
    if (!res.ok) return fail(res, fallback);
    const body = (await res.json()) as { code?: number; data?: T };
    if (body.code !== 0) return fail(res, fallback);
    return body.data as T;
}

export async function getCloudUsage(signal?: AbortSignal): Promise<CloudUsage> {
    return json<CloudUsage>(await fetch(`${base()}/usage`, { credentials: "include", headers: CANVAS_HEADER, signal }), "读取云同步空间失败");
}

async function listCloudFiles(): Promise<CloudFile[]> {
    const data = await json<{ files: CloudFile[] }>(await fetch(`${base()}/files`, { credentials: "include", headers: CANVAS_HEADER, cache: "no-store" }), "读取云端文件列表失败");
    return data.files || [];
}

/** The transport app-sync uses for the HiveGPT cloud. */
export function cloudTransport(): SyncTransport {
    return {
        read: async (path) => {
            const res = await fetch(fileUrl(path), { credentials: "include", headers: CANVAS_HEADER, cache: "no-store" });
            if (res.status === 404) return null;
            if (!res.ok) return fail(res, "下载云端文件失败");
            const blob = await res.blob();
            return blob.size ? blob : null;
        },
        write: async (path, file, contentType) => {
            const res = await fetch(fileUrl(path), { method: "PUT", credentials: "include", headers: { ...CANVAS_HEADER, "Content-Type": contentType || "application/octet-stream" }, body: file });
            await json(res, "上传到云端失败");
        },
        prune: async (keep) => {
            for (const file of await listCloudFiles()) {
                if (keep.has(file.path)) continue;
                const res = await fetch(fileUrl(file.path), { method: "DELETE", credentials: "include", headers: CANVAS_HEADER });
                if (!res.ok && res.status !== 404) await fail(res, "清理云端文件失败");
            }
        },
    };
}
