import type { ReactNode } from "react";
import { Brush, Camera, Copy, Expand, FileText, Grid2x2, Lock, LockOpen, Maximize2, Scissors, Send, Sparkles, Upload, Wand2, ZoomIn } from "lucide-react";

import type { CanvasNodeData } from "@/types/canvas";
import i18n from "@/i18n";

export type ImageNodeActionToolId = "copyPrompt" | "reversePrompt" | "replace" | "resize" | "edit" | "maskEdit" | "outpaint" | "crop" | "split" | "upscale" | "superResolve" | "angle" | "publish" | "view";
export type ImageQuickToolId = "info" | "delete" | "saveAsset" | "download" | ImageNodeActionToolId;

export type ImageToolHandlers = {
    onUpload: (node: CanvasNodeData) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onEditImage: (node: CanvasNodeData) => void;
    onMaskEdit: (node: CanvasNodeData) => void;
    onOutpaint: (node: CanvasNodeData) => void;
    onPublish: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onSplit: (node: CanvasNodeData) => void;
    onUpscale: (node: CanvasNodeData) => void;
    onSuperResolve: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onViewImage: (node: CanvasNodeData) => void;
    onCopyPrompt: (node: CanvasNodeData) => void;
    onReversePrompt: (node: CanvasNodeData) => void;
};

export type ImageToolDefinition = {
    id: ImageNodeActionToolId;
    defaultVisible: boolean;
    label: string | ((node: CanvasNodeData) => string);
    title: string | ((node: CanvasNodeData) => string);
    icon: (node: CanvasNodeData) => ReactNode;
    active?: (node: CanvasNodeData) => boolean;
    run: (node: CanvasNodeData, handlers: ImageToolHandlers) => void;
};

export type ImageQuickToolsConfig = {
    ids: ImageQuickToolId[];
    showLabels: boolean;
    /** Bumped when default-visible tools are added, so saved toolbars pick them up once. */
    toolsVersion?: number;
};

export const IMAGE_QUICK_TOOLS_VERSION = 4;

/** Default-visible tools added in each toolbar version; saved toolbars get them once (users can still hide them). */
const TOOLS_ADDED_IN_VERSION: Record<number, ImageQuickToolId[]> = { 2: ["edit"], 3: ["outpaint"], 4: ["publish"] };

export const IMAGE_QUICK_TOOLS_STORAGE_KEY = "canvas-image-quick-tools-v7";

const defaultBaseToolIds: ImageQuickToolId[] = ["info", "delete", "saveAsset", "download"];

export const imageToolDefinitions: ImageToolDefinition[] = [
    {
        id: "copyPrompt",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.copyPrompt"),
        title: () => i18n.t("canvas.imageTools.copyPromptTitle"),
        icon: () => <Copy className="size-4" />,
        run: (node, handlers) => handlers.onCopyPrompt(node),
    },
    {
        id: "reversePrompt",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.reversePrompt"),
        title: () => i18n.t("canvas.imageTools.reversePromptTitle"),
        icon: () => <FileText className="size-4" />,
        run: (node, handlers) => handlers.onReversePrompt(node),
    },
    {
        id: "replace",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.replace"),
        title: () => i18n.t("canvas.imageTools.replace"),
        icon: () => <Upload className="size-4" />,
        run: (node, handlers) => handlers.onUpload(node),
    },
    {
        id: "resize",
        defaultVisible: false,
        label: (node) => i18n.t(node.metadata?.freeResize ? "canvas.imageTools.free" : "canvas.imageTools.locked"),
        title: (node) => i18n.t(node.metadata?.freeResize ? "canvas.imageTools.lockTitle" : "canvas.imageTools.freeTitle"),
        icon: (node) => (node.metadata?.freeResize ? <LockOpen className="size-4" /> : <Lock className="size-4" />),
        active: (node) => Boolean(node.metadata?.freeResize),
        run: (node, handlers) => handlers.onToggleFreeResize(node),
    },
    {
        id: "edit",
        defaultVisible: true,
        label: () => i18n.t("imageEditor.open"),
        title: () => i18n.t("imageEditor.openTitle"),
        icon: () => <Wand2 className="size-4" />,
        run: (node, handlers) => handlers.onEditImage(node),
    },
    {
        id: "maskEdit",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.mask"),
        title: () => i18n.t("canvas.imageTools.maskTitle"),
        icon: () => <Brush className="size-4" />,
        run: (node, handlers) => handlers.onMaskEdit(node),
    },
    {
        id: "outpaint",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.outpaint"),
        title: () => i18n.t("canvas.imageTools.outpaintTitle"),
        icon: () => <Expand className="size-4" />,
        run: (node, handlers) => handlers.onOutpaint(node),
    },
    {
        id: "crop",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.crop"),
        title: () => i18n.t("canvas.imageTools.cropTitle"),
        icon: () => <Scissors className="size-4" />,
        run: (node, handlers) => handlers.onCrop(node),
    },
    {
        id: "split",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.split"),
        title: () => i18n.t("canvas.imageTools.splitTitle"),
        icon: () => <Grid2x2 className="size-4" />,
        run: (node, handlers) => handlers.onSplit(node),
    },
    {
        id: "upscale",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.upscale"),
        title: () => i18n.t("canvas.imageTools.upscaleTitle"),
        icon: () => <ZoomIn className="size-4" />,
        run: (node, handlers) => handlers.onUpscale(node),
    },
    {
        id: "superResolve",
        defaultVisible: false,
        label: () => i18n.t("canvas.imageTools.superResolve"),
        title: () => i18n.t("canvas.imageTools.superResolveTitle"),
        icon: () => <Sparkles className="size-4" />,
        run: (node, handlers) => handlers.onSuperResolve(node),
    },
    {
        id: "angle",
        defaultVisible: false,
        label: () => i18n.t("canvas.imageTools.angle"),
        title: () => i18n.t("canvas.imageTools.angleTitle"),
        icon: () => <Camera className="size-4" />,
        run: (node, handlers) => handlers.onAngle(node),
    },
    {
        id: "publish",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.publish"),
        title: () => i18n.t("canvas.imageTools.publishTitle"),
        icon: () => <Send className="size-4" />,
        run: (node, handlers) => handlers.onPublish(node),
    },
    {
        id: "view",
        defaultVisible: true,
        label: () => i18n.t("canvas.imageTools.view"),
        title: () => i18n.t("canvas.imageTools.viewTitle"),
        icon: () => <Maximize2 className="size-4" />,
        run: (node, handlers) => handlers.onViewImage(node),
    },
];

export const defaultImageQuickToolIds: ImageQuickToolId[] = [...defaultBaseToolIds, ...imageToolDefinitions.filter((tool) => tool.defaultVisible).map((tool) => tool.id)];

export function buildImageToolbarTools(node: CanvasNodeData, handlers: ImageToolHandlers) {
    return imageToolDefinitions.map((tool) => ({
        id: tool.id,
        label: resolveToolText(tool.label, node),
        title: resolveToolText(tool.title, node),
        icon: tool.icon(node),
        active: tool.active?.(node),
        onClick: () => tool.run(node, handlers),
    }));
}

export function normalizeImageQuickToolIds(value: unknown[]) {
    const allIds: ImageQuickToolId[] = [...defaultBaseToolIds, ...imageToolDefinitions.map((tool) => tool.id)];
    const ids = new Set(allIds);
    return allIds.filter((id) => value.includes(id) && ids.has(id));
}

export function readImageQuickToolsConfig(value: unknown): ImageQuickToolsConfig {
    if (Array.isArray(value)) return { ids: withNewDefaultTools(normalizeImageQuickToolIds(value), 1), showLabels: false, toolsVersion: IMAGE_QUICK_TOOLS_VERSION };
    if (!value || typeof value !== "object") return { ids: defaultImageQuickToolIds, showLabels: false, toolsVersion: IMAGE_QUICK_TOOLS_VERSION };
    const data = value as Partial<ImageQuickToolsConfig>;
    const ids = Array.isArray(data.ids) ? normalizeImageQuickToolIds(data.ids) : defaultImageQuickToolIds;
    return {
        ids: withNewDefaultTools(ids, data.toolsVersion || 1),
        showLabels: data.showLabels === true,
        toolsVersion: IMAGE_QUICK_TOOLS_VERSION,
    };
}

/** Adds the tools introduced after the version a toolbar was saved with. */
function withNewDefaultTools(ids: ImageQuickToolId[], savedVersion: number): ImageQuickToolId[] {
    const added = Object.entries(TOOLS_ADDED_IN_VERSION).flatMap(([version, tools]) => (Number(version) > savedVersion ? tools : []));
    if (added.every((id) => ids.includes(id))) return ids;
    return normalizeImageQuickToolIds([...ids, ...added]);
}

function resolveToolText(value: string | ((node: CanvasNodeData) => string), node: CanvasNodeData) {
    return typeof value === "function" ? value(node) : value;
}
