import { expect, test } from "bun:test";

import { planReferenceShrink } from "../src/lib/image-utils";

const MB = 1024 * 1024;

test("references that fit are sent untouched", () => {
    expect(planReferenceShrink([3 * MB, 5 * MB, 6 * MB])).toEqual([]);
});

test("oversized requests shrink the biggest photos first, until the request fits", () => {
    expect(planReferenceShrink([9 * MB, 2 * MB, 8 * MB, 3 * MB])).toEqual([0, 2]);
    expect(planReferenceShrink([7 * MB, 7 * MB, 7 * MB])).toEqual([0, 1, 2]);
});

test("a single huge photo is shrunk", () => {
    expect(planReferenceShrink([25 * MB])).toEqual([0]);
});
