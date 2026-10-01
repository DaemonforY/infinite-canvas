import { expect, test } from "bun:test";

import { asHtmlDocument, extractHtmlPage, htmlTitle } from "../src/lib/publish-html";

test("finds the page in an AI answer's html block", () => {
    const answer = "好的，这是页面：\n```html\n<!doctype html><html><body><h1>Hi</h1></body></html>\n```\n说明……";
    expect(extractHtmlPage(answer)).toBe("<!doctype html><html><body><h1>Hi</h1></body></html>");
});

test("accepts whole documents and single-element fragments, not prose", () => {
    expect(extractHtmlPage("  <html><body>x</body></html> ")).toBe("<html><body>x</body></html>");
    expect(extractHtmlPage('<div class="card"><p>x</p></div>')).toBe('<div class="card"><p>x</p></div>');
    expect(extractHtmlPage("用 <b>粗体</b> 强调")).toBe("");
    expect(extractHtmlPage("")).toBe("");
});

test("fragments are wrapped into a UTF-8 page", () => {
    const page = asHtmlDocument("<p>你好</p>", 'A <b>"x"');
    expect(page).toContain('<meta charset="utf-8">');
    expect(page).toContain("<title>A bx</title>");
    expect(page).toContain("<p>你好</p>");
    expect(asHtmlDocument("<!doctype html><html></html>", "t")).toBe("<!doctype html><html></html>");
});

test("the page title becomes the default name", () => {
    expect(htmlTitle("<html><head><title> 活动页 </title></head></html>")).toBe("活动页");
    expect(htmlTitle("<p>x</p>")).toBe("");
});
