import { Compass, FileText, ImageDown, ImagePlus, Images, Maximize2, Settings2, Video, WandSparkles } from "lucide-react";

// Top navigation: 生图 first (it is where most people work), the rest behind 「更多」.
// `primary` items are always in the bar; the others are in the 更多 menu (desktop) and below a divider (mobile).
export const navigationTools = [
    { slug: "image", icon: ImagePlus, primary: true },
    { slug: "video", icon: Video, primary: true },
    { slug: "explore", icon: Compass, primary: true },
    { slug: "assets", icon: Images, primary: true },
    { slug: "prompts", icon: FileText, primary: false },
    { slug: "animation", icon: WandSparkles, primary: false },
    { slug: "tools", icon: ImageDown, primary: false },
    { slug: "canvas", icon: Maximize2, primary: false },
    { slug: "config", icon: Settings2, primary: false },
] as const;

export type NavigationToolSlug = (typeof navigationTools)[number]["slug"];
