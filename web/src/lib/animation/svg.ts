// AI 动画: the prompt sent to the text model, and turning its answer into a safe, self-contained SVG.
//
// The model must answer with one <svg> animated by CSS (@keyframes in an inner <style>) or SMIL — no
// scripts. That keeps the download a real .svg file, and lets us strip anything executable before the
// preview, which still runs in a sandboxed iframe with a CSP that blocks every network request.

import type { AiTextMessage } from "@/services/api/image";
import { findRatio, findScenario, findStyle } from "./presets";

export type AnimationBrief = { prompt: string; scenario: string; style: string; ratio: string };

const SVG_NS = "http://www.w3.org/2000/svg";
/** Answers longer than this are not plausible animations (and would bloat local history). */
export const MAX_SVG_CHARS = 400_000;

export function buildSystemPrompt(brief: AnimationBrief): string {
    const ratio = findRatio(brief.ratio);
    const scenario = findScenario(brief.scenario);
    const style = findStyle(brief.style);
    return [
        "You are a senior motion designer who hand-writes animated SVG.",
        "Answer with ONE complete, standalone <svg> element and nothing else: no Markdown fence, no explanation before or after.",
        "",
        "Hard requirements:",
        `- Root: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ratio.width} ${ratio.height}" width="${ratio.width}" height="${ratio.height}">. Paint a full-size background <rect> first unless the design needs transparency (loaders, icons).`,
        "- Animate with CSS @keyframes inside one <style> element in the SVG (preferred) or SMIL (<animate>, <animateTransform>, <animateMotion>). NEVER use <script>, event handler attributes (onload, onclick…), <foreignObject>, <iframe> or external resources (no http(s) URLs, no @import, no web fonts).",
        "- For transforms on SVG elements in CSS always set transform-box: fill-box; and an explicit transform-origin, otherwise rotations and scales pivot around the canvas corner.",
        '- A CSS transform REPLACES the transform="…" attribute of the same element. Never animate (or set) a CSS transform on an element that is positioned with a transform attribute: position with an outer <g transform="translate(…)"> and animate an inner <g class="…">, or place shapes with x / y / cx / cy.',
        '- Fonts: font-family system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif (or a monospace stack). Text must stay inside the viewBox — keep a 6% safe margin. SVG text does not wrap: estimate the width of every line (a Chinese character ≈ 1 × font-size, a Latin letter or digit ≈ 0.6 × font-size) and keep the widest line within 88% of the canvas width; on portrait canvases break sentences into short lines of a few words each.',
        "- Timing: pick ONE cycle length of 4–8 s (loaders 1–2.4 s) and give EVERY animation exactly that duration with animation-iteration-count: infinite — mixed durations drift apart and break the scene after the first loop. Stagger elements with keyframe percentages (e.g. 0%,20% { opacity:0 } 30% { opacity:1 }), not with animation-delay, so every element's state at 0% is defined. The last keyframe equals the first so the loop has no visible jump. Use cubic-bezier easing for natural motion.",
        "- The scene builds up, then the complete final frame (every element visible at once) holds for at least 25% of the cycle before everything resets together. Elements that explain each other (e.g. a ray and its label, a node and its connector) are visible at the same time.",
        "- Write the visible text in the user's language (Chinese if the request is in Chinese). Keep labels short.",
        "- Words: show only the text the user gave plus the labels the content strictly needs (axis labels, names of parts). Do NOT invent slogans, taglines, brand names, captions, fake UI text or decorative English words.",
        "",
        "Layout:",
        "- Balance: the whole composition is optically centred in the canvas. The main content spans 60–85% of the width (of the height for portrait canvases); no side of the canvas is left as a large empty area. A logo + wordmark lockup is centred as one group.",
        "- No overlaps in the final frame: text never sits on top of other text, lines, arrows or shapes unless it has its own background plate; labels sit beside what they label with a clear gap. Titles stay clear of the content area. Check every element's position against the others, including callouts that appear late.",
        "- Charts: the plot area uses most of the canvas width; plot every data point the user gave (count them) with its value label; callouts go in free space, never over the title or the line.",
        "- Diagrams: lines and arrows connect exactly to the shapes they point at; the content is physically / mathematically correct.",
        "",
        "- Quality bar: clear focal point, deliberate hierarchy, consistent stroke widths and corner radii, harmonious palette, at least two layers of motion (main action + subtle secondary motion). Avoid clip-art clichés and lorem ipsum.",
        "- Keep it compact: reuse shapes with <defs>/<use>, prefer CSS classes over repeated inline styles, under ~30 KB.",
        "",
        `Kind of animation: ${scenario.brief}`,
        style.brief ? `Visual style: ${style.brief}` : "Visual style: choose the style that best suits the subject.",
        "",
        "When the user asks for changes to an earlier SVG, return the full updated SVG (not a diff), keeping everything they did not ask to change and adding nothing they did not ask for.",
    ].join("\n");
}

/** The conversation for a first draft, or for revising `currentSvg` with `instruction`. */
export function buildAnimationMessages(brief: AnimationBrief, revision?: { currentSvg: string; instruction: string; history: string[] }): AiTextMessage[] {
    const messages: AiTextMessage[] = [
        { role: "system", content: buildSystemPrompt(brief) },
        { role: "user", content: brief.prompt.trim() },
    ];
    if (!revision) return messages;
    // Earlier change requests are folded into one note so the model knows what must be kept, without
    // resending every older SVG.
    const earlier = revision.history.filter(Boolean);
    return [
        ...messages,
        { role: "assistant", content: revision.currentSvg },
        {
            role: "user",
            content: [earlier.length ? `Changes already made (keep them): ${earlier.map((item, index) => `${index + 1}. ${item}`).join(" ")}` : "", `Now change: ${revision.instruction.trim()}`, "Return the complete updated <svg>."]
                .filter(Boolean)
                .join("\n"),
        },
    ];
}

/** The <svg>…</svg> in a model answer (which may be fenced or wrapped in prose), or "". */
export function extractSvg(answer: string): string {
    const text = answer || "";
    const start = text.search(/<svg[\s>]/i);
    const end = text.toLowerCase().lastIndexOf("</svg>");
    if (start < 0 || end < start) return "";
    return text.slice(start, end + "</svg>".length);
}

export type SanitizeResult = { svg: string; removed: number } | { error: "empty" | "invalid" | "tooLarge" };

const BLOCKED_ELEMENTS = new Set(["script", "foreignobject", "iframe", "object", "embed", "audio", "video", "canvas", "handler", "listener"]);
const URL_ATTRIBUTES = new Set(["href", "xlink:href", "src"]);

/**
 * Parses the SVG as XML (nothing runs while parsing), drops executable or external parts and
 * serializes it back. Returns how many things were removed so the UI can say so.
 */
export function sanitizeSvg(source: string): SanitizeResult {
    const raw = extractSvg(source);
    if (!raw) return { error: "empty" };
    if (raw.length > MAX_SVG_CHARS) return { error: "tooLarge" };
    const doc = new DOMParser().parseFromString(withNamespaces(raw), "image/svg+xml");
    const root = doc.documentElement;
    if (!root || root.nodeName.toLowerCase() !== "svg" || doc.getElementsByTagName("parsererror").length) return { error: "invalid" };

    let removed = 0;
    const walk = (element: Element) => {
        for (const child of Array.from(element.children)) {
            if (BLOCKED_ELEMENTS.has(child.localName.toLowerCase())) {
                child.remove();
                removed += 1;
                continue;
            }
            walk(child);
        }
        for (const attribute of Array.from(element.attributes)) {
            const name = attribute.name.toLowerCase();
            const value = attribute.value.trim();
            if (name.startsWith("on") || (URL_ATTRIBUTES.has(name) && !isLocalReference(value)) || /javascript:/i.test(value)) {
                element.removeAttribute(attribute.name);
                removed += 1;
            }
        }
        // SMIL can set an href to javascript: — only allow animating ordinary presentation attributes.
        const animated = element.getAttribute("attributeName")?.toLowerCase();
        if (animated && (animated.startsWith("on") || URL_ATTRIBUTES.has(animated))) {
            element.remove();
            removed += 1;
        }
    };
    walk(root);
    for (const style of Array.from(root.getElementsByTagName("style"))) {
        const css = style.textContent || "";
        const cleaned = css.replace(/@import[^;]*;?/gi, "").replace(/url\(\s*(['"]?)(?!#|data:image\/)[^)]*\)/gi, "none");
        if (cleaned !== css) {
            style.textContent = cleaned;
            removed += 1;
        }
    }
    fixTransformConflicts(root);
    if (!root.getAttribute("xmlns")) root.setAttribute("xmlns", SVG_NS);
    return { svg: new XMLSerializer().serializeToString(root), removed };
}

/**
 * A CSS transform (static or animated) replaces an element's transform="…" attribute instead of adding
 * to it, so a group placed with transform="translate(500 300)" and animated with scale() jumps to the
 * canvas corner. Models do this often. The attribute moves to a new inner <g> holding the children, so
 * the element keeps its place in the tree (nth-child selectors still match) and the CSS transform now
 * applies on top of the positioned content. Leaf shapes are wrapped from outside instead.
 */
export function fixTransformConflicts(root: Element): number {
    const css = Array.from(root.getElementsByTagName("style"))
        .map((style) => style.textContent || "")
        .join("\n");
    if (!/transform/i.test(css)) return 0;
    const transformFrames = new Set<string>();
    const withoutFrames = css.replace(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*[^{}]*)\}/gi, (_, name: string, body: string) => {
        if (/transform\s*:/i.test(body)) transformFrames.add(name);
        return "";
    });
    const selectors: string[] = [];
    for (const match of withoutFrames.replace(/@media[^{]*\{/gi, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const body = match[2];
        const animationNames = [...body.matchAll(/animation(?:-name)?\s*:\s*([^;]+)/gi)].flatMap((item) => item[1].split(/[\s,]+/));
        if (/(^|[;\s])transform\s*:/i.test(body) || animationNames.some((name) => transformFrames.has(name))) selectors.push(...match[1].split(","));
    }
    const targets = new Set<Element>();
    for (const selector of selectors) {
        try {
            root.querySelectorAll(selector.trim()).forEach((element) => targets.add(element));
        } catch {
            // Selector the DOM cannot evaluate (pseudo-elements…): skip it.
        }
    }
    let fixed = 0;
    for (const element of targets) {
        const transform = element.getAttribute("transform");
        if (!transform || element === root) continue;
        const doc = element.ownerDocument;
        const holder = doc.createElementNS(SVG_NS, "g");
        holder.setAttribute("transform", transform);
        element.removeAttribute("transform");
        if (element.localName === "g" || element.localName === "a") {
            while (element.firstChild) holder.appendChild(element.firstChild);
            element.appendChild(holder);
        } else {
            element.parentNode?.insertBefore(holder, element);
            holder.appendChild(element);
        }
        fixed += 1;
    }
    return fixed;
}

function isLocalReference(value: string) {
    return value.startsWith("#") || /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(value);
}

/** Models often forget xmlns / xmlns:xlink, which makes the XML parser reject the document. */
function withNamespaces(svg: string) {
    let open = svg.match(/^<svg[^>]*>/i)?.[0] || "";
    if (!open) return svg;
    const original = open;
    if (!/\sxmlns=/.test(open)) open = open.replace(/^<svg/i, `<svg xmlns="${SVG_NS}"`);
    if (/xlink:/.test(svg) && !/\sxmlns:xlink=/.test(open)) open = open.replace(/^<svg/i, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
    return open + svg.slice(original.length);
}

/** The viewBox size of an SVG, for laying out the preview. */
export function svgSize(svg: string): { width: number; height: number } | null {
    const box = svg.match(/viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (!box) return null;
    const width = Number(box[1]);
    const height = Number(box[2]);
    return width > 0 && height > 0 ? { width, height } : null;
}

// Nothing in the page may reach the network: no scripts except none at all, styles and images inline only.
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; media-src 'none'; frame-src 'none'; form-action 'none'";

/** A full HTML page that shows the SVG centred and scaled to fit — used for preview, download and publishing. */
export function svgPage(svg: string, title: string, background = "#ffffff"): string {
    const safeTitle = title.replace(/[<>&"]/g, "").slice(0, 60) || "AI 动画";
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${PAGE_CSP}">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
html,body{margin:0;height:100%;background:${/^#[0-9a-f]{3,8}$/i.test(background) ? background : "#ffffff"}}
body{display:flex;align-items:center;justify-content:center;overflow:hidden}
body>svg{display:block;width:100vw;height:100vh;max-width:100%;max-height:100%}
</style>
</head>
<body>
${svg.replace(/^<svg([^>]*?)\swidth="[^"]*"/i, "<svg$1").replace(/^<svg([^>]*?)\sheight="[^"]*"/i, "<svg$1")}
</body>
</html>
`;
}

/** The colour of the first full-size background rect, so the page around a letterboxed SVG matches it. */
export function svgBackground(svg: string): string {
    const rect = svg.match(/<rect\b[^>]*\bwidth="100%"[^>]*>|<rect\b[^>]*\bx="0"[^>]*\by="0"[^>]*>/i)?.[0] || "";
    return rect.match(/\bfill="(#[0-9a-f]{3,8})"/i)?.[1] || "#ffffff";
}

/** A short title for history and the site name: the first line of the prompt. */
export function animationTitle(prompt: string): string {
    const line = prompt.trim().split(/\n/)[0] || "";
    return line.length > 24 ? `${line.slice(0, 24)}…` : line;
}
