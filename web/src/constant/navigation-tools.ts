import { Compass, FileText, ImageDown, ImagePlus, Images, Maximize2, Settings2, Video } from "lucide-react";

export const navigationTools = [
    {
        slug: "explore",
        icon: Compass,
    },
    {
        slug: "canvas",
        icon: Maximize2,
    },
    {
        slug: "image",
        icon: ImagePlus,
    },
    {
        slug: "video",
        icon: Video,
    },
    {
        slug: "prompts",
        icon: FileText,
    },
    {
        slug: "tools",
        icon: ImageDown,
    },
    {
        slug: "assets",
        icon: Images,
    },
    {
        slug: "config",
        icon: Settings2,
    },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
