import { expect, test } from "bun:test";

import { promptKey, serverPromptToPrompt } from "../src/services/api/prompts";
import type { ServerPrompt } from "../src/services/api/main-site-prompts";

const base: ServerPrompt = {
    id: 42,
    source_id: "freestylefly-gpt-image-2",
    source_name: "Freestylefly GPT Image 2",
    external_id: "case-12",
    kind: "image",
    title: "电影海报",
    prompt: "生成一张电影海报",
    description: "",
    cover_url: "https://example.com/a.png",
    reference_image_urls: [],
    source_tags: ["海报", "gpt-image-2"],
    scenes: ["poster", "not-a-scene"],
    tags: [],
    model: "gpt-image-2",
    lang: "zh",
    needs_reference: true,
    author: "someone",
    source_url: "https://github.com/x",
    visibility: "public",
    status: "active",
    featured: true,
    use_count: 12,
    favorite_count: 3,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-02T00:00:00Z",
};

test("server items keep the same favorite key as the local source copy", () => {
    const item = serverPromptToPrompt(base);
    expect(promptKey(item)).toBe("freestylefly-gpt-image-2:case-12");
    expect(item.serverId).toBe(42);
    expect(item.useCount).toBe(12);
    expect(item.traits.scenes).toEqual(["poster"]);
    expect(item.traits.needsReference).toBe(true);
    expect(item.tags).toEqual(["海报", "gpt-image-2"]);
});

test("curated tags win over source tags; user covers resolve against the main site", () => {
    const item = serverPromptToPrompt({ ...base, source_id: "user", mine: true, tags: ["国风"], scenes: [], model: "whatever", cover_url: "/api/v1/prompt-library/covers/x.png", status: "pending" });
    expect(item.tags).toEqual(["国风"]);
    expect(item.curatedTags).toEqual(["国风"]);
    expect(item.traits.scenes).toEqual(["other"]);
    expect(item.traits.model).toBe("unknown");
    expect(item.coverUrl.endsWith("/api/v1/prompt-library/covers/x.png")).toBe(true);
    expect(item.coverUrl.startsWith("http")).toBe(true);
    expect(item.coverPath).toBe("/api/v1/prompt-library/covers/x.png");
    expect(item.mine).toBe(true);
});
