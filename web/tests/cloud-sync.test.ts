import { afterEach, describe, expect, test } from "bun:test";

import { safeFileName } from "../src/services/app-sync";
import { cloudTransport, CloudSyncError } from "../src/services/api/main-site-cloud";

const realFetch = globalThis.fetch;
type Call = { url: string; init?: RequestInit };

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
    const calls: Call[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        return handler(url, init);
    }) as typeof fetch;
    return calls;
}

const ok = (data: unknown) => new Response(JSON.stringify({ code: 0, data }), { status: 200, headers: { "Content-Type": "application/json" } });

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe("cloud transport", () => {
    test("reads files with the session cookie; a missing file is null", async () => {
        const calls = mockFetch((url) => (url.endsWith("/canvas/manifest.json") ? new Response("{}", { status: 404 }) : new Response("bytes")));
        const transport = cloudTransport();
        expect(await transport.read("canvas/manifest.json")).toBeNull();
        const blob = await transport.read("assets/files/image_a b.png");
        expect(await blob!.text()).toBe("bytes");
        expect(calls[1].url).toEndWith("/api/v1/canvas/cloud/files/assets/files/image_a%20b.png");
        expect(calls[1].init?.credentials).toBe("include");
        expect((calls[1].init?.headers as Record<string, string>)["X-HiveGPT-Canvas"]).toBe("1");
    });

    test("writes with PUT and the content type; a full quota surfaces the server's message", async () => {
        const calls = mockFetch((url) =>
            url.includes("big") ? new Response(JSON.stringify({ code: 403, reason: "CANVAS_CLOUD_QUOTA", message: "云同步空间已满（上限 200MB）（Cloud storage full）" }), { status: 403 }) : ok({ path: "x" }),
        );
        const transport = cloudTransport();
        await transport.write("canvas/manifest.json", new Blob(["{}"]), "application/json");
        expect(calls[0].init?.method).toBe("PUT");
        expect((calls[0].init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
        const err = await transport.write("canvas/files/big.png", new Blob(["x"]), "image/png").catch((e) => e);
        expect(err).toBeInstanceOf(CloudSyncError);
        expect((err as CloudSyncError).reason).toBe("CANVAS_CLOUD_QUOTA");
        expect((err as Error).message).toBe("云同步空间已满（上限 200MB）");
    });

    test("prune deletes only files no manifest refers to", async () => {
        const calls = mockFetch((url, init) => {
            if (url.endsWith("/cloud/files") && !init?.method) return ok({ files: [{ path: "canvas/manifest.json" }, { path: "canvas/files/keep.png" }, { path: "canvas/files/old.png" }] });
            return ok({ ok: true });
        });
        await cloudTransport().prune!(new Set(["canvas/manifest.json", "canvas/files/keep.png"]));
        const deletes = calls.filter((c) => c.init?.method === "DELETE").map((c) => c.url);
        expect(deletes).toHaveLength(1);
        expect(deletes[0]).toEndWith("/canvas/files/old.png");
    });
});

describe("sync file names", () => {
    test("only letters, digits, dot, underscore and dash", () => {
        expect(safeFileName("image:abc_DEF-1")).toBe("image_abc_DEF-1");
        expect(safeFileName("video-reference:a/b c")).toBe("video-reference_a_b_c");
    });
});

describe("canvas merge", () => {
    const project = (id: string, updatedAt: string, title = id) => ({ id, title, updatedAt }) as never;
    test("newest edit wins; a deletion beats older copies but not a later edit", async () => {
        const { mergeCanvasData } = await import("../src/services/app-sync");
        const local = { projects: [project("a", "2026-10-02T10:00:00Z", "a-local"), project("b", "2026-10-01T00:00:00Z")], deleted: [{ id: "c", deletedAt: "2026-10-02T09:00:00Z" }] };
        const remote = {
            projects: [project("a", "2026-10-02T09:00:00Z", "a-remote"), project("c", "2026-10-02T08:00:00Z"), project("d", "2026-10-02T11:00:00Z")],
            deleted: [{ id: "b", deletedAt: "2026-10-01T12:00:00Z" }, { id: "d", deletedAt: "2026-10-02T10:00:00Z" }],
        };
        const merged = mergeCanvasData(local, remote);
        const titles = Object.fromEntries(merged.projects.map((p: { id: string; title: string }) => [p.id, p.title]));
        expect(titles).toEqual({ a: "a-local", d: "d" });
        expect(merged.deleted.map((d: { id: string }) => d.id).sort()).toEqual(["b", "c"]);
    });
});
