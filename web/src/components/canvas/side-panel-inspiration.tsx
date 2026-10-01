import { memo, useState } from "react";
import { App, Button, Empty, Modal, Spin } from "antd";
import { ExternalLink, ImagePlus, Images, LogIn, Type } from "lucide-react";
import { useTranslation } from "react-i18next";

import { AuthorAvatar } from "@/components/community/author-avatar";
import { useWorksFeed } from "@/components/community/use-works-feed";
import { useMainSiteSignIn } from "@/components/layout/use-main-site-sign-in";
import { type CanvasTheme } from "@/lib/canvas-theme";
import { cn } from "@/lib/utils";
import { authorName, COMMUNITY_TAGS, countRemix, mainSiteAsset, type Feed, type Work } from "@/services/api/community";
import { useMainAccountStore } from "@/stores/use-main-account-store";

import type { InsertAssetPayload } from "./asset-picker-modal";

// Inspiration tab: community works next to the canvas. A work's image goes onto the canvas as an
// image node (a reference to build on), its prompt as a text node; both credit the author.

const FEEDS: Feed[] = ["recommended", "latest", "following", "favorites"];

/** The work's full image as a blob: URL. no-store: a cached <img> response may lack CORS headers. */
async function fetchWorkImage(work: Work): Promise<string> {
    const res = await fetch(mainSiteAsset(work.cover_url), { mode: "cors", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return URL.createObjectURL(await res.blob());
}

export const InspirationTab = memo(function InspirationTab({ onInsert, theme }: { onInsert: (payload: InsertAssetPayload) => void; theme: CanvasTheme }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const signedIn = useMainAccountStore((state) => state.status === "signedIn");
    const { signIn } = useMainSiteSignIn();
    const [feed, setFeed] = useState<Feed>("recommended");
    const [tag, setTag] = useState("");
    const [detail, setDetail] = useState<Work | null>(null);
    const [adding, setAdding] = useState(0);
    const needsSignIn = (feed === "following" || feed === "favorites") && !signedIn;
    const { works, loading, error, hasMore, loadMore, reload } = useWorksFeed({ feed, tag: feed === "favorites" ? "" : tag }, !needsSignIn);

    const credit = (work: Work) => `${work.title || t("community.untitled")} · @${work.author.handle}`;

    const addImage = async (work: Work) => {
        setAdding(work.id);
        try {
            const url = await fetchWorkImage(work);
            onInsert({ kind: "image", dataUrl: url, title: credit(work) });
            // The canvas copies the image into its own storage right away.
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            message.success(t("community.inspiration.imageAdded"));
            setDetail(null);
        } catch {
            message.error(t("community.inspiration.imageFailed"));
        } finally {
            setAdding(0);
        }
    };

    const addPrompt = (work: Work) => {
        onInsert({ kind: "text", content: work.prompt, title: credit(work) });
        void countRemix(work.id);
        message.success(t("community.inspiration.promptAdded"));
        setDetail(null);
    };

    const pill = (active: boolean) => cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition", active ? "border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-300" : "border-transparent opacity-70 hover:opacity-100");

    return (
        <div className="flex h-full flex-col" data-testid="inspiration-tab">
            <div className="flex flex-wrap gap-1 px-3 pb-1.5 pt-1">
                {FEEDS.map((value) => (
                    <button key={value} type="button" className={pill(feed === value)} onClick={() => setFeed(value)}>
                        {t(`community.inspiration.feeds.${value}`)}
                    </button>
                ))}
            </div>
            {feed !== "favorites" ? (
                <div className="hide-scrollbar flex gap-1 overflow-x-auto px-3 pb-2">
                    {["", ...COMMUNITY_TAGS].map((value) => (
                        <button key={value || "all"} type="button" className={pill(tag === value)} style={{ borderColor: tag === value ? undefined : theme.node.stroke }} onClick={() => setTag(value)}>
                            {value || t("community.explore.allTags")}
                        </button>
                    ))}
                </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
                {needsSignIn ? (
                    <div className="flex flex-col items-center gap-3 px-4 pt-14 text-center text-xs opacity-80">
                        <span>{t(feed === "following" ? "community.explore.signInForFollowing" : "community.inspiration.signInForFavorites")}</span>
                        <Button size="small" type="primary" icon={<LogIn className="size-3.5" />} onClick={signIn}>
                            {t("community.inspiration.signIn")}
                        </Button>
                    </div>
                ) : error && !works.length ? (
                    <button type="button" onClick={reload} className="block w-full py-10 text-center text-xs text-red-500 opacity-80 transition hover:opacity-100">
                        {t("canvas.sidePanel.loadFailedRetry")}
                    </button>
                ) : works.length ? (
                    <>
                        <div className="grid grid-cols-2 gap-2 px-1 pt-1">
                            {works.map((work) => (
                                <InspirationCard key={work.id} work={work} theme={theme} busy={adding === work.id} onOpen={() => setDetail(work)} onAddImage={() => void addImage(work)} onAddPrompt={work.prompt ? () => addPrompt(work) : undefined} />
                            ))}
                        </div>
                        {hasMore ? (
                            <div className="flex justify-center pt-3">
                                <Button size="small" loading={loading} onClick={loadMore}>
                                    {t("community.loadMore")}
                                </Button>
                            </div>
                        ) : null}
                    </>
                ) : loading ? (
                    <div className="flex justify-center py-14">
                        <Spin size="small" />
                    </div>
                ) : (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t(feed === "favorites" ? "community.inspiration.noFavorites" : "community.inspiration.empty")} className="pt-12" />
                )}
            </div>
            {detail ? <InspirationDetail work={detail} busy={adding === detail.id} onClose={() => setDetail(null)} onAddImage={() => void addImage(detail)} onAddPrompt={() => addPrompt(detail)} /> : null}
        </div>
    );
});

function InspirationCard({ work, theme, busy, onOpen, onAddImage, onAddPrompt }: { work: Work; theme: CanvasTheme; busy: boolean; onOpen: () => void; onAddImage: () => void; onAddPrompt?: () => void }) {
    const { t } = useTranslation();
    const action = "grid size-8 place-items-center rounded-full bg-white/90 text-stone-700 shadow-sm backdrop-blur transition hover:bg-white hover:text-stone-900 dark:bg-black/60 dark:text-stone-100 dark:hover:bg-black/80";
    return (
        <div className="group relative aspect-square overflow-hidden rounded-xl border" style={{ borderColor: theme.node.stroke, background: theme.node.panel }} data-testid="inspiration-card">
            <button type="button" className="size-full" onClick={onOpen} aria-label={work.title || t("community.untitled")} title={work.title || undefined}>
                <img src={mainSiteAsset(work.cover_thumb_url)} alt="" loading="lazy" className="size-full object-cover transition duration-300 group-hover:scale-[1.04]" />
            </button>
            <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-black/55 px-1 py-px text-[10px] font-medium text-white">{t("community.aiLabel")}</span>
            {work.image_count > 1 ? (
                <span className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded bg-black/55 px-1 py-px text-[10px] text-white">
                    <Images className="size-3" />
                    {work.image_count}
                </span>
            ) : null}
            <div className={cn("absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-black/50 to-transparent pb-2 pt-6 transition duration-200", busy ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                <button type="button" className={action} onClick={onAddImage} disabled={busy} aria-label={t("community.inspiration.addImage")} title={t("community.inspiration.addImage")}>
                    {busy ? <Spin size="small" /> : <ImagePlus className="size-4" />}
                </button>
                {onAddPrompt ? (
                    <button type="button" className={action} onClick={onAddPrompt} aria-label={t("community.inspiration.addPrompt")} title={t("community.inspiration.addPrompt")}>
                        <Type className="size-4" />
                    </button>
                ) : null}
            </div>
        </div>
    );
}

function InspirationDetail({ work, busy, onClose, onAddImage, onAddPrompt }: { work: Work; busy: boolean; onClose: () => void; onAddImage: () => void; onAddPrompt: () => void }) {
    const { t } = useTranslation();
    return (
        <Modal open title={work.title || t("community.untitled")} onCancel={onClose} footer={null} width={520} destroyOnHidden>
            <div className="grid gap-3" data-testid="inspiration-detail">
                <div className="relative overflow-hidden rounded-lg bg-stone-100 dark:bg-stone-900">
                    <img src={mainSiteAsset(work.cover_thumb_url)} alt={work.title} className="max-h-[50vh] w-full object-contain" />
                    <span className="absolute left-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[11px] font-medium text-white">{t("community.aiLabel")}</span>
                </div>
                <a href={`/u/${work.author.handle}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm !text-stone-600 hover:!text-stone-900 dark:!text-stone-300 dark:hover:!text-stone-100">
                    <AuthorAvatar author={work.author} size={22} />
                    {authorName(work.author)}
                    <span className="opacity-60">@{work.author.handle}</span>
                </a>
                {work.prompt ? (
                    <p className="m-0 max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-2.5 text-xs leading-relaxed text-stone-700 dark:bg-stone-800/60 dark:text-stone-200">{work.prompt}</p>
                ) : (
                    <p className="m-0 text-xs text-stone-500">{t("community.promptHidden")}</p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                    <Button icon={<ExternalLink className="size-4" />} href={`/w/${work.id}`} target="_blank" rel="noopener noreferrer">
                        {t("community.inspiration.viewWork")}
                    </Button>
                    {work.prompt ? (
                        <Button icon={<Type className="size-4" />} onClick={onAddPrompt}>
                            {t("community.inspiration.addPrompt")}
                        </Button>
                    ) : null}
                    <Button type="primary" icon={<ImagePlus className="size-4" />} loading={busy} onClick={onAddImage}>
                        {t("community.inspiration.addImage")}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
