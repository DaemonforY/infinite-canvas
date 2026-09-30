import { expect, test } from "bun:test";

import { interleave, localTasteScenes } from "../src/lib/prompt-recommend";
import type { PromptScene } from "../src/lib/prompt-taxonomy";

const p = (...scenes: PromptScene[]) => ({ traits: { scenes } });

test("taste follows what the user used most, favorites count double", () => {
    expect(localTasteScenes([p("poster"), p("poster", "brand"), p("3d")], [])).toEqual(["poster", "3d", "brand"]);
    expect(localTasteScenes([p("poster")], [p("ecommerce")])).toEqual(["ecommerce", "poster"]);
    expect(localTasteScenes([p("other"), p("other")], [])).toEqual([]);
});

test("newer recents weigh more than older ones", () => {
    expect(localTasteScenes([p("photo"), p("life")], [], 1)).toEqual(["photo"]);
});

test("interleave mixes scenes and drops repeats", () => {
    const a = [{ id: "1" }, { id: "2" }, { id: "3" }];
    const b = [{ id: "2" }, { id: "4" }];
    expect(interleave([a, b], (x) => x.id, 10).map((x) => x.id)).toEqual(["1", "2", "4", "3"]);
    expect(interleave([a, b], (x) => x.id, 2).map((x) => x.id)).toEqual(["1", "2"]);
});
