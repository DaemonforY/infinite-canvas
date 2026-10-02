// Cover screenshot of a web page made on the canvas, drawn in the browser: the page's HTML and
// <style>s are rendered through an SVG <foreignObject> image. Scripts never run and remote files
// (images, fonts, stylesheets) are not loaded, so script-built pages come out plain — the publish
// dialog lets the author swap in their own screenshot.

const SNAPSHOT_CLASS = "hg-snap";

/** Points html / body / :root selectors at the snapshot's root element. */
export function scopePageCss(css: string): string {
    return css.replace(/(^|[\s,{}>+~(])(html|body|:root)(?=[\s,{.:#[>+~)]|$)/gi, `$1.${SNAPSHOT_CLASS}`);
}

function xmlAttr(value: string): string {
    return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** The SVG markup of the page at width × height. */
export function pageSnapshotSvg(html: string, width: number, height: number): string {
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script, noscript, iframe, frame, object, embed, link, meta, base, template").forEach((el) => el.remove());
    // Event handler attributes are dropped too (they never run in an image, but keep the markup clean).
    doc.querySelectorAll("*").forEach((el) => {
        for (const attr of Array.from(el.attributes)) if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
    });
    const css = Array.from(doc.querySelectorAll("style"))
        .map((style) => scopePageCss(style.textContent || ""))
        .join("\n")
        .replace(/]]>/g, "] ]>");
    doc.querySelectorAll("style").forEach((style) => style.remove());
    const serializer = new XMLSerializer();
    const body = Array.from(doc.body.childNodes)
        .map((node) => serializer.serializeToString(node))
        .join("");
    const bodyClass = doc.body.getAttribute("class") || "";
    const bodyStyle = doc.body.getAttribute("style") || "";
    // Defaults come first in the stylesheet so the page's own html / body rules override them.
    const defaults = `.${SNAPSHOT_CLASS}{box-sizing:border-box;margin:0;padding:8px;background:#fff;color:#111;font-family:system-ui,'PingFang SC','Microsoft YaHei',sans-serif}`;
    const root =
        `<div xmlns="http://www.w3.org/1999/xhtml" class="${SNAPSHOT_CLASS} ${xmlAttr(bodyClass)}" ` +
        `style="width:${width}px;min-height:${height}px;${xmlAttr(bodyStyle)}">` +
        `<style><![CDATA[${defaults}\n${css}]]></style>${body}</div>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject x="0" y="0" width="100%" height="100%">${root}</foreignObject></svg>`;
}

/** A JPEG screenshot of the page (desktop size 1280 × 800). Throws when the browser cannot draw it. */
export async function snapshotPage(html: string, width = 1280, height = 800): Promise<Blob> {
    const svg = pageSnapshotSvg(html, width, height);
    const image = new Image();
    image.decoding = "sync";
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) throw new Error("snapshot failed");
    return blob;
}
