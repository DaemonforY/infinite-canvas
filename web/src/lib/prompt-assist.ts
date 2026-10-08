import { requestImageQuestion, type AiTextMessage } from "@/services/api/image";
import { imageToDataUrl } from "@/services/image-storage";
import { resolveModelForCapability, type AiConfig } from "@/stores/use-config-store";

// 「帮我写」 and 「解析图片」 on the image workbench: one text-model call each, streamed, billed to the user's channel.

const WRITE_INSTRUCTION = [
    "你是 AI 生图提示词助手。用户给出一个简短的想法，你把它扩写成一段可以直接交给 gpt-image-2 的中文提示词。",
    "要求：",
    "1. 只输出提示词正文，不要解释，不要加引号、标题或列表。",
    "2. 保留用户的原意和用户写出的所有具体内容（文字、品牌、数字、人名），一字不改。",
    "3. 补全主体、场景、构图、光线、色彩、材质、风格和氛围，写成一段连贯的话，不超过 180 字。",
    "4. 用户没有给出的标题、日期、价格、地址等具体文字不要编造；需要文字的位置写成「顶部留出标题位置」这类描述。",
    "5. 如果附带了参考图，用「图片1」「图片2」指代它们，说明每张图在画面里怎么用（例如保持图片1的人物五官）。",
].join("\n");

const DESCRIBE_INSTRUCTION = [
    "请根据这张图片写一段中文提示词，让 gpt-image-2 能画出同样风格和内容的画面。",
    "要求：",
    "1. 只输出提示词正文，不要解释，不要加引号、标题或列表。",
    "2. 依次覆盖：主体和动作、场景、构图和镜头、光线、色彩、材质、风格和氛围。",
    "3. 画面里能看清的文字按原样写出，用「」括起来，并说明位置。",
    "4. 不要出现「这张图片」「参考图」之类的说法，直接描述画面。",
    "5. 不超过 200 字。",
].join("\n");

export type RewriteStyle = "rewrite" | "shorter" | "photo" | "xiaohongshu";

const REWRITE_HINTS: Record<RewriteStyle, string> = {
    rewrite: "换一种完全不同的写法和画面构思，保留用户原意。",
    shorter: "写得更简洁，不超过 80 字，只保留最关键的画面要素。",
    photo: "改成写实摄影风格，写明镜头、焦段和光线。",
    xiaohongshu: "适合做小红书封面：竖版 3:4，主体突出，顶部留出大标题位置，色彩清新干净。",
};

/** Text model of the user's config, with the global system prompt removed (it is written for image prompts). */
export function promptAssistConfig(config: AiConfig): AiConfig {
    return { ...config, model: resolveModelForCapability(config, undefined, "text"), systemPrompt: "" };
}

type ImageRef = { dataUrl?: string; storageKey?: string };

async function imageParts(images: ImageRef[]) {
    const urls = await Promise.all(images.map((image) => imageToDataUrl(image)));
    return urls.filter(Boolean).map((url) => ({ type: "image_url" as const, image_url: { url } }));
}

/** Expand a short idea into a full prompt. `style` asks for a variant of an earlier answer. */
export async function writePrompt(config: AiConfig, input: { idea: string; references?: ImageRef[]; previous?: string; style?: RewriteStyle }, onDelta: (text: string) => void, signal?: AbortSignal) {
    const lines = [`用户的想法：${input.idea.trim()}`];
    if (input.references?.length) lines.push(`附带了 ${input.references.length} 张参考图，按顺序是图片1${input.references.length > 1 ? `到图片${input.references.length}` : ""}。`);
    if (input.previous && input.style) lines.push(`上一次写的是：${input.previous}`, `这次的要求：${REWRITE_HINTS[input.style]}`);
    const content: AiTextMessage["content"] = input.references?.length ? [{ type: "text", text: lines.join("\n") }, ...(await imageParts(input.references))] : lines.join("\n");
    const messages: AiTextMessage[] = [
        { role: "system", content: WRITE_INSTRUCTION },
        { role: "user", content },
    ];
    return cleanPrompt(await requestImageQuestion(promptAssistConfig(config), messages, (text) => onDelta(cleanPrompt(text)), { signal }));
}

/** Describe an image as a prompt that would reproduce it. */
export async function describeImage(config: AiConfig, image: ImageRef, onDelta: (text: string) => void, signal?: AbortSignal) {
    const messages: AiTextMessage[] = [{ role: "user", content: [{ type: "text", text: DESCRIBE_INSTRUCTION }, ...(await imageParts([image]))] }];
    return cleanPrompt(await requestImageQuestion(promptAssistConfig(config), messages, (text) => onDelta(cleanPrompt(text)), { signal }));
}

/** Models sometimes wrap the answer in quotes or a code fence despite the instructions. */
function cleanPrompt(text: string) {
    return text
        .replace(/^\s*```[a-z]*\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .replace(/^\s*(提示词|Prompt)\s*[:：]\s*/i, "")
        .replace(/^["“「]([\s\S]*)["”」]$/, "$1")
        .trim();
}
