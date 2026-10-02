import { describe, expect, test } from "bun:test";

import { scopePageCss } from "../src/lib/html-snapshot";

describe("page snapshot css", () => {
    test("html, body and :root selectors point at the snapshot root", () => {
        expect(scopePageCss("body{margin:0}")).toBe(".hg-snap{margin:0}");
        expect(scopePageCss("html, body { background: #000 }")).toBe(".hg-snap, .hg-snap { background: #000 }");
        expect(scopePageCss(":root{--c:red} body.dark h1{color:var(--c)}")).toBe(".hg-snap{--c:red} .hg-snap.dark h1{color:var(--c)}");
        expect(scopePageCss("@media (max-width:600px){body{padding:0}}")).toBe("@media (max-width:600px){.hg-snap{padding:0}}");
    });

    test("words that merely contain body or html are left alone", () => {
        expect(scopePageCss(".tbody td{} #htmlbox{} .card-body{}")).toBe(".tbody td{} #htmlbox{} .card-body{}");
    });
});
