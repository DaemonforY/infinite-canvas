import { nanoid } from "nanoid";

import { promptAssistConfig } from "@/lib/prompt-assist";
import {
    characterSheetPrompt,
    findBubbles,
    pagePrompt,
    panelEditPrompt,
    panelRects,
    panelSegments,
    parseStory,
    placeBubbles,
    STORY_INSTRUCTION,
    storyRequest,
    type ComicCharacter,
    type ComicGenre,
    type ComicImage,
    type ComicPage,
    type ComicProject,
    type ComicStory,
    type ComicStyleChoice,
} from "@/lib/comic";
import { imageSizePresets } from "@/lib/media-size";
import { requestEdit, requestGeneration, requestImageQuestion } from "@/services/api/image";
import { resolveImageUrl, uploadImage } from "@/services/image-storage";
import type { AiConfig } from "@/stores/use-config-store";
import type { ReferenceImage } from "@/types/image";

// The model calls of 画漫画, all on the user's own channel (text model for the story, image model for the rest).

export async function writeStory(config: AiConfig, input: { idea: string; genre: ComicGenre; panelCount: number; previous?: ComicStory; change?: string }, onDelta: (text: string) => void, signal?: AbortSignal) {
    const answer = await requestImageQuestion(
        promptAssistConfig(config),
        [
            { role: "system", content: STORY_INSTRUCTION },
            { role: "user", content: storyRequest(input) },
        ],
        onDelta,
        { signal },
    );
    return parseStory(answer, input.panelCount);
}

export function storyOf(project: ComicProject): ComicStory {
    return {
        title: project.title,
        characters: project.characters.map(({ name, role, look }) => ({ name, role, look })),
        panels: project.panels.map(({ id: _id, ...panel }) => panel),
    };
}

/**
 * Comic art is drawn at 1K and at most medium quality: a page with several reference sheets is slow, and the
 * upstream gives up after about two minutes. Line art looks fine at medium (even low).
 */
function comicRequest(config: AiConfig, ratio: string): AiConfig {
    return { ...config, count: "1", size: imageSizePresets["1k"][ratio] || "1024x1536", quality: config.quality === "low" ? "low" : "medium" };
}

async function store(dataUrl: string): Promise<ComicImage> {
    const stored = await uploadImage(dataUrl);
    return { url: stored.url, ...(stored.storageKey ? { storageKey: stored.storageKey } : {}), width: stored.width, height: stored.height, mimeType: stored.mimeType };
}

export async function comicImageUrl(image: ComicImage) {
    return resolveImageUrl(image.storageKey, image.url);
}

function toReference(image: ComicImage, name: string): ReferenceImage {
    return { id: nanoid(), name, type: image.mimeType || "image/png", dataUrl: image.storageKey ? "" : image.url, ...(image.storageKey ? { storageKey: image.storageKey } : {}) };
}

export function chosenSheet(character: ComicCharacter) {
    return character.sheet >= 0 ? character.sheets[character.sheet] : undefined;
}

const smallSheets = new Map<string, string>();

/** A design sheet as a reference: a 1024px JPEG instead of a ~2 MB PNG, so the request uploads and runs faster. */
async function sheetReference(image: ComicImage, index: number): Promise<ReferenceImage> {
    const key = image.storageKey || image.url;
    let dataUrl = smallSheets.get(key);
    if (!dataUrl) {
        const element = await loadImage(await comicImageUrl(image));
        const scale = Math.min(1, 1024 / Math.max(element.naturalWidth, element.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(element.naturalWidth * scale);
        canvas.height = Math.round(element.naturalHeight * scale);
        const context = canvas.getContext("2d");
        if (!context) return toReference(image, `character-${index + 1}.png`);
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(element, 0, 0, canvas.width, canvas.height);
        dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        smallSheets.set(key, dataUrl);
    }
    return { id: nanoid(), name: `character-${index + 1}.jpg`, type: "image/jpeg", dataUrl };
}

export async function drawCharacterSheet(config: AiConfig, character: ComicCharacter, style: ComicStyleChoice) {
    const prompt = characterSheetPrompt(character, style, Boolean(character.photo));
    const request = comicRequest(config, "3:2");
    const result = character.photo ? await requestEdit(request, prompt, [toReference(character.photo, "photo.png")]) : await requestGeneration(request, prompt);
    if (!result[0]) throw new Error("no image");
    return store(result[0].dataUrl);
}

/** Characters with a chosen design sheet, in the order their sheets are sent (图片1, 图片2…). */
export function sheetCharacters(project: ComicProject) {
    return project.characters.filter((character) => chosenSheet(character));
}

export async function drawPage(config: AiConfig, project: ComicProject): Promise<ComicPage> {
    const characters = sheetCharacters(project);
    const prompt = pagePrompt(project, characters);
    const request = comicRequest(config, "2:3");
    const references = await Promise.all(characters.map((character, index) => sheetReference(chosenSheet(character)!, index)));
    const result = references.length ? await requestEdit(request, prompt, references) : await requestGeneration(request, prompt);
    if (!result[0]) throw new Error("no image");
    const image = await store(result[0].dataUrl);
    return { id: nanoid(), image, bubbles: await letter(project, image), createdAt: Date.now(), prompt };
}

/** Redraws one panel: the page plus a copy with that panel tinted blue, and the character sheets. */
export async function redrawPanel(config: AiConfig, project: ComicProject, page: ComicPage, panelIndex: number, instruction: string): Promise<ComicPage> {
    const characters = sheetCharacters(project);
    const rect = panelRects(project.panels.length)[panelIndex];
    const maskDataUrl = await tintRect(await comicImageUrl(page.image), rect);
    const mask = await store(maskDataUrl);
    const references = [toReference(page.image, "page.png"), toReference(mask, "mask.png"), ...(await Promise.all(characters.map((character, index) => sheetReference(chosenSheet(character)!, index))))];
    const panel = project.panels[panelIndex];
    const panelText = panelSegments(panel, project.characters, project.style)
        .filter((segment) => segment.kind !== "style")
        .map((segment) => segment.text)
        .join("，");
    const prompt = panelEditPrompt(panelIndex, instruction, characters, panelText);
    const result = await requestEdit({ ...comicRequest(config, "2:3"), size: "auto" }, prompt, references);
    if (!result[0]) throw new Error("no image");
    const image = await store(result[0].dataUrl);
    // Keep the lettering of the other panels; place this panel's lines again.
    const fresh = await letter(project, image);
    const bubbles = [
        ...page.bubbles.filter((bubble) => bubble.panel !== panelIndex),
        ...fresh.filter((bubble) => bubble.panel === panelIndex).map((bubble) => ({ ...bubble, text: page.bubbles.find((old) => old.panel === panelIndex && old.line === bubble.line)?.text ?? bubble.text })),
    ];
    return { id: nanoid(), image, bubbles, createdAt: Date.now(), prompt, label: `第 ${panelIndex + 1} 格：${instruction.trim()}` };
}

/** Finds the empty balloons of a page and puts the story's lines in them. */
export async function letter(project: Pick<ComicProject, "panels">, image: ComicImage) {
    const rects = panelRects(project.panels.length);
    let found: ReturnType<typeof findBubbles> = rects.map(() => []);
    try {
        const pixels = await readPixels(await comicImageUrl(image), 360);
        found = findBubbles(pixels.data, pixels.width, pixels.height, rects);
    } catch {
        // No balloons found: every line gets a drawn balloon.
    }
    return placeBubbles(project.panels, found, rects, nanoid);
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("image load failed"));
        image.src = src;
    });
}

async function readPixels(src: string, maxWidth: number) {
    const image = await loadImage(src);
    const scale = Math.min(1, maxWidth / image.naturalWidth);
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("canvas unavailable");
    context.drawImage(image, 0, 0, width, height);
    return { data: context.getImageData(0, 0, width, height).data, width, height };
}

async function tintRect(src: string, rect: { x: number; y: number; w: number; h: number }) {
    const image = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas unavailable");
    context.drawImage(image, 0, 0);
    context.fillStyle = "rgba(37, 99, 235, 0.4)";
    context.fillRect(rect.x * canvas.width, rect.y * canvas.height, rect.w * canvas.width, rect.h * canvas.height);
    return canvas.toDataURL("image/png");
}
