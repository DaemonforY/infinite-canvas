// The image model sees only the prompt (and any reference images). Prompts written as if it could see a chat or an
// article — 「根据以上内容生成一张PPT」 — come back as an empty template with 「请输入您的主标题」 placeholders, so the
// composer points this out. A long prompt probably carries the content itself, so it gets no hint.
const MISSING_CONTEXT = [
    /(以上|上面|上述|上文|前面|前文|刚才|之前|下面|下述)的?(内容|文章|文字|文本|资料|材料|信息|大纲|要点|段落|对话|方案)/,
    /(这篇|该|这份|此)(文章|文档|资料|材料|大纲)/,
    /\b(the )?(above|previous|following|preceding) (content|article|text|outline|conversation|document)\b/i,
];
const CONTENT_BEARING_LENGTH = 150;

export function promptLacksReferencedContent(prompt: string, hasReferenceImages: boolean): boolean {
    const text = prompt.trim();
    if (!text || hasReferenceImages || text.length >= CONTENT_BEARING_LENGTH) return false;
    return MISSING_CONTEXT.some((pattern) => pattern.test(text));
}
