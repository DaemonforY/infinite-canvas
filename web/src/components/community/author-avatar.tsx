import { UserRound } from "lucide-react";

import { authorName, mainSiteAsset, type CommunityAuthor } from "@/services/api/community";
import { cn } from "@/lib/utils";

/** Round avatar: the uploaded picture, else the first letter of the name. */
export function AuthorAvatar({ author, size = 28, className }: { author?: Pick<CommunityAuthor, "avatar_url" | "display_name" | "handle"> | null; size?: number; className?: string }) {
    const name = author ? authorName(author).replace(/^@/, "") : "";
    return (
        <span
            className={cn("inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-violet-100 font-semibold text-violet-800 dark:bg-violet-900/50 dark:text-violet-100", className)}
            style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.42)) }}
        >
            {author?.avatar_url ? <img src={mainSiteAsset(author.avatar_url)} alt="" className="size-full object-cover" loading="lazy" /> : name ? Array.from(name)[0].toUpperCase() : <UserRound className="size-1/2" />}
        </span>
    );
}
