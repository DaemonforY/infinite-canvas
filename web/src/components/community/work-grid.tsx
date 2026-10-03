import { Clock3, Globe, Heart, Images, Link2, Lock, Play, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { AuthorAvatar } from "@/components/community/author-avatar";
import { formatClipDuration } from "@/lib/site-videos";
import { authorName, cardHeight, compactCount, mainSiteAsset, type Work } from "@/services/api/community";

const COLUMN_WIDTH = 240;

/** One feed card: cover (aspect kept within limits), title, author and likes; badges for state. */
export function WorkCard({ work, showAuthor = true }: { work: Work; showAuthor?: boolean }) {
    const { t } = useTranslation();
    return (
        <div className="mb-3 break-inside-avoid" data-testid="work-card">
            <Link to={`/w/${work.id}`} className="group block overflow-hidden rounded-xl border border-stone-200 bg-stone-100 dark:border-stone-800 dark:bg-stone-900">
                <div className="relative w-full overflow-hidden" style={{ aspectRatio: `${COLUMN_WIDTH} / ${cardHeight(work, COLUMN_WIDTH)}` }}>
                    <img src={mainSiteAsset(work.cover_thumb_url)} alt={work.title} loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                    <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">{t("community.aiLabel")}</span>
                    <span className="absolute right-2 top-2 flex gap-1">
                        {work.kind === "site" ? <Badge icon={<Globe className="size-3" />} label={t("community.site.badge")} /> : null}
                        {work.kind === "video" ? <Badge icon={<Play className="size-3" fill="currentColor" />} label={work.video?.duration_ms ? formatClipDuration(work.video.duration_ms) : t("community.video.badge")} /> : null}
                        {work.featured ? <Badge icon={<Sparkles className="size-3" />} label={t("community.featured")} /> : null}
                        {work.image_count > 1 ? <Badge icon={<Images className="size-3" />} label={String(work.image_count)} /> : null}
                        {work.visibility === "private" ? <Badge icon={<Lock className="size-3" />} label={t("community.visibility.private")} /> : null}
                        {work.visibility === "unlisted" ? <Badge icon={<Link2 className="size-3" />} label={t("community.visibility.unlisted")} /> : null}
                        {work.status === "pending" ? <Badge icon={<Clock3 className="size-3" />} label={t("community.status.pending")} /> : null}
                    </span>
                </div>
            </Link>
            <div className="px-1 pt-2">
                {work.title ? (
                    <Link to={`/w/${work.id}`} className="line-clamp-2 text-sm font-medium !text-stone-900 hover:underline dark:!text-stone-100">
                        {work.title}
                    </Link>
                ) : null}
                <div className="mt-1 flex items-center gap-1.5 text-xs text-stone-500">
                    {showAuthor ? (
                        <Link to={`/u/${work.author.handle}`} className="flex min-w-0 items-center gap-1.5 !text-stone-500 hover:!text-stone-800 dark:hover:!text-stone-200">
                            <AuthorAvatar author={work.author} size={18} />
                            <span className="truncate">{authorName(work.author)}</span>
                        </Link>
                    ) : null}
                    <span className={`ml-auto flex shrink-0 items-center gap-1 ${work.liked_by_me ? "text-rose-500" : ""}`}>
                        <Heart className="size-3.5" fill={work.liked_by_me ? "currentColor" : "none"} />
                        {compactCount(work.like_count)}
                    </span>
                </div>
            </div>
        </div>
    );
}

function Badge({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <span className="flex items-center gap-0.5 rounded bg-black/55 px-1.5 py-0.5 text-[11px] text-white">
            {icon}
            {label}
        </span>
    );
}

/** Masonry of work cards (CSS columns). */
export function WorkGrid({ works, showAuthor = true }: { works: Work[]; showAuthor?: boolean }) {
    return (
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5" data-testid="work-grid">
            {works.map((work) => (
                <WorkCard key={work.id} work={work} showAuthor={showAuthor} />
            ))}
        </div>
    );
}
