// "发布为网页": finds a web page in a text node (often an AI answer with the page in a ```html block).

const FENCE_RE = /```(?:html|htm)?\s*\n([\s\S]*?)```/i;
const DOCUMENT_RE = /<!doctype html|<html[\s>]|<body[\s>]/i;
const FRAGMENT_RE = /^\s*<([a-z][a-z0-9-]*)[\s>][\s\S]*<\/\1>\s*$/i;

/** The HTML to publish from a text, or "" when the text is not a page. */
export function extractHtmlPage(text: string): string {
    const source = text || "";
    const fenced = FENCE_RE.exec(source)?.[1];
    for (const candidate of fenced ? [fenced, source] : [source]) {
        const trimmed = candidate.trim();
        if (DOCUMENT_RE.test(trimmed) || FRAGMENT_RE.test(trimmed)) return trimmed;
    }
    return "";
}

/** A fragment becomes a complete UTF-8 page (so Chinese text renders correctly). */
export function asHtmlDocument(html: string, title: string): string {
    if (DOCUMENT_RE.test(html)) return html;
    const safeTitle = title.replace(/[<>&"]/g, "");
    return `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${safeTitle}</title>\n</head>\n<body>\n${html}\n</body>\n</html>\n`;
}

/** The page's own <title>, used as the default site name. */
export function htmlTitle(html: string): string {
    return /<title[^>]*>([^<]{1,60})<\/title>/i.exec(html)?.[1]?.trim() || "";
}
