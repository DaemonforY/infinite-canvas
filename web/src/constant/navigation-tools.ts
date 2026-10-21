import { BookOpen, Compass, FileText, ImageDown, ImagePlus, Images, Maximize2, Settings2, Video, WandSparkles } from "lucide-react";

// Top navigation: 提示词库 first (the site opens there), then 生图; the rest behind 「更多」.
// `primary` items are always in the bar; the others are in the 更多 menu (desktop) and below a divider (mobile).
export const navigationTools = [
    { slug: "prompts", icon: FileText, primary: true },
    { slug: "image", icon: ImagePlus, primary: true },
    { slug: "comic", icon: BookOpen, primary: true },
    { slug: "tools", icon: ImageDown, primary: true },
    { slug: "assets", icon: Images, primary: true },
    { slug: "explore", icon: Compass, primary: true },
    { slug: "video", icon: Video, primary: false },
    { slug: "animation", icon: WandSparkles, primary: false },
    { slug: "canvas", icon: Maximize2, primary: false },
    { slug: "config", icon: Settings2, primary: false },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
