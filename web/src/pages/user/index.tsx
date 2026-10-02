import { useEffect, useState } from "react";
import { App, Button, Empty, Input, Modal, Segmented, Spin } from "antd";
import { BarChart3, FolderPlus, Pencil, RefreshCw, Share2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AuthorAvatar } from "@/components/community/author-avatar";
import { ProfileForm } from "@/components/community/profile-form";
import { useShareLink } from "@/components/community/use-share-link";
import { useWorksFeed } from "@/components/community/use-works-feed";
import { WorkGrid } from "@/components/community/work-grid";
import { useMainSiteSignIn } from "@/components/layout/use-main-site-sign-in";
import { authorName, compactCount, createCollection, getProfile, listCollections, listFollows, mainSiteAsset, setFollow, type Collection, type CommunityProfile } from "@/services/api/community";
import { useMainAccountStore } from "@/stores/use-main-account-store";

type Tab = "works" | "collections" | "favorites";

export default function UserPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const handle = useParams().handle || "";
    const signedIn = useMainAccountStore((state) => state.status === "signedIn");
    const { signIn } = useMainSiteSignIn();
    const [profile, setProfile] = useState<CommunityProfile | null>(null);
    const [error, setError] = useState("");
    const [tab, setTab] = useState<Tab>("works");
    const [editing, setEditing] = useState(false);
    const [follows, setFollows] = useState<"followers" | "following" | null>(null);
    const share = useShareLink(`/u/${encodeURIComponent(handle)}`, { syncAddressBar: true });

    useEffect(() => {
        let cancelled = false;
        setProfile(null);
        setError("");
        setTab("works");
        getProfile(handle)
            .then((p) => {
                if (cancelled) return;
                setProfile(p);
                document.title = `${authorName(p)} (@${p.handle})`;
            })
            .catch((err) => !cancelled && setError((err as Error).message));
        return () => {
            cancelled = true;
        };
    }, [handle, signedIn]);

    const works = useWorksFeed({ user: handle }, Boolean(profile) && tab === "works");
    const favorites = useWorksFeed({ feed: "favorites" }, Boolean(profile?.is_me) && tab === "favorites");

    const follow = async () => {
        if (!profile) return;
        if (!signedIn) {
            message.info(t("community.signInToInteract"));
            return signIn();
        }
        try {
            setProfile(await setFollow(profile.handle, !profile.followed_by_me));
        } catch (err) {
            message.error((err as Error).message);
        }
    };

    if (error) {
        return (
            <div className="flex h-full items-center justify-center">
                <Empty description={error}>
                    <Link to="/explore">
                        <Button>{t("community.backToExplore")}</Button>
                    </Link>
                </Empty>
            </div>
        );
    }
    if (!profile) {
        return (
            <div className="flex h-full items-center justify-center">
                <Spin />
            </div>
        );
    }

    const feed = tab === "favorites" ? favorites : works;

    return (
        <div className="h-full overflow-y-auto bg-background px-3 py-6 text-stone-900 sm:px-6 dark:text-stone-100" data-testid="user-page">
            <div className="mx-auto max-w-7xl">
                <div className="flex flex-wrap items-start gap-4">
                    <AuthorAvatar author={profile} size={80} />
                    <div className="min-w-0 flex-1">
                        <h1 className="m-0 text-2xl font-semibold">{authorName(profile)}</h1>
                        <div className="text-sm text-stone-500">@{profile.handle}</div>
                        {profile.bio ? <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-stone-700 dark:text-stone-300">{profile.bio}</p> : null}
                        <div className="mt-3 flex flex-wrap gap-4 text-sm">
                            <span>
                                <b>{compactCount(profile.works_count)}</b> <span className="text-stone-500">{t("community.profile.works")}</span>
                            </span>
                            <button type="button" className="hover:underline" onClick={() => setFollows("followers")}>
                                <b>{compactCount(profile.followers_count)}</b> <span className="text-stone-500">{t("community.profile.followers")}</span>
                            </button>
                            <button type="button" className="hover:underline" onClick={() => setFollows("following")}>
                                <b>{compactCount(profile.following_count)}</b> <span className="text-stone-500">{t("community.profile.following")}</span>
                            </button>
                            <span>
                                <b>{compactCount(profile.likes_received)}</b> <span className="text-stone-500">{t("community.profile.likes")}</span>
                            </span>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button icon={<Share2 className="size-4" />} onClick={share.copy} data-testid="profile-share">
                            {t("community.share")}
                        </Button>
                        {profile.is_me ? (
                            <Link to="/creator">
                                <Button icon={<BarChart3 className="size-4" />} data-testid="profile-creator">
                                    {t("creator.title")}
                                </Button>
                            </Link>
                        ) : null}
                        {profile.is_me ? (
                            <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)} data-testid="profile-edit">
                                {t("community.profile.edit")}
                            </Button>
                        ) : (
                            <Button type={profile.followed_by_me ? "default" : "primary"} onClick={() => void follow()} data-testid="profile-follow">
                                {profile.followed_by_me ? t("community.following") : t("community.follow")}
                            </Button>
                        )}
                    </div>
                </div>

                <div className="mt-6 border-b border-stone-200 pb-3 dark:border-stone-800">
                    <Segmented
                        value={tab}
                        onChange={(v) => setTab(v as Tab)}
                        options={[{ value: "works", label: t("community.profile.works") }, { value: "collections", label: t("community.profile.collections") }, ...(profile.is_me ? [{ value: "favorites", label: t("community.profile.favorites") }] : [])]}
                    />
                </div>

                <div className="mt-5">
                    {tab === "collections" ? (
                        <CollectionsTab profile={profile} />
                    ) : feed.error && !feed.works.length ? (
                        <Empty description={feed.error} className="py-12">
                            <Button icon={<RefreshCw className="size-4" />} onClick={feed.reload}>
                                {t("community.retry")}
                            </Button>
                        </Empty>
                    ) : !feed.works.length && !feed.loading ? (
                        <Empty description={tab === "favorites" ? t("community.profile.noFavorites") : profile.is_me ? t("community.profile.noWorksMine") : t("community.profile.noWorks")} className="py-12" />
                    ) : (
                        <WorkGrid works={feed.works} showAuthor={tab === "favorites"} />
                    )}
                    {tab !== "collections" && feed.loading ? (
                        <div className="flex justify-center py-6">
                            <Spin />
                        </div>
                    ) : tab !== "collections" && feed.hasMore ? (
                        <div className="flex justify-center py-6">
                            <Button onClick={feed.loadMore}>{t("community.loadMore")}</Button>
                        </div>
                    ) : null}
                </div>
            </div>

            <Modal open={editing} title={t("community.profile.edit")} onCancel={() => setEditing(false)} footer={null} destroyOnHidden>
                <ProfileForm
                    profile={profile}
                    onSaved={(saved) => {
                        setEditing(false);
                        message.success(t("community.profile.saved"));
                        if (saved.handle !== profile.handle) navigate(`/u/${saved.handle}`, { replace: true });
                        else setProfile({ ...profile, ...saved });
                    }}
                />
            </Modal>
            {follows ? <FollowsDialog handle={profile.handle} which={follows} onClose={() => setFollows(null)} /> : null}
        </div>
    );
}

function CollectionsTab({ profile }: { profile: CommunityProfile }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [list, setList] = useState<Collection[] | null>(null);
    const [creating, setCreating] = useState(false);
    const [title, setTitle] = useState("");
    useEffect(() => {
        listCollections(profile.handle)
            .then(setList)
            .catch(() => setList([]));
    }, [profile.handle]);
    const create = async () => {
        try {
            const created = await createCollection({ title, description: "", visibility: "public" });
            setList((current) => [created, ...(current || [])]);
            setCreating(false);
            setTitle("");
        } catch (err) {
            message.error((err as Error).message);
        }
    };
    if (list === null) return <Spin />;
    return (
        <div>
            {profile.is_me ? (
                <div className="mb-4">
                    {creating ? (
                        <div className="flex max-w-md gap-2">
                            <Input autoFocus value={title} maxLength={60} placeholder={t("community.collections.namePlaceholder")} onChange={(e) => setTitle(e.target.value)} onPressEnter={() => void create()} />
                            <Button type="primary" onClick={() => void create()}>
                                {t("community.collections.create")}
                            </Button>
                        </div>
                    ) : (
                        <Button icon={<FolderPlus className="size-4" />} onClick={() => setCreating(true)}>
                            {t("community.collections.new")}
                        </Button>
                    )}
                </div>
            ) : null}
            {list.length ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {list.map((c) => (
                        <Link key={c.id} to={`/c/${c.id}`} className="group block !text-inherit" data-testid="collection-card">
                            <div className="grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-0.5 overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-900">
                                {[0, 1, 2, 3].map((i) =>
                                    c.cover_urls[i] ? (
                                        <img key={i} src={mainSiteAsset(c.cover_urls[i])} alt="" className={`size-full object-cover ${c.cover_urls.length === 1 ? "col-span-2 row-span-2" : ""}`} />
                                    ) : c.cover_urls.length === 1 ? null : (
                                        <span key={i} />
                                    ),
                                )}
                            </div>
                            <div className="mt-2 text-sm font-medium group-hover:underline">{c.title}</div>
                            <div className="text-xs text-stone-500">
                                {t("community.collections.count", { count: c.works_count })}
                                {c.visibility === "private" ? ` · ${t("community.visibility.private")}` : ""}
                            </div>
                        </Link>
                    ))}
                </div>
            ) : (
                <Empty description={profile.is_me ? t("community.collections.emptyMine") : t("community.collections.empty")} className="py-12" />
            )}
        </div>
    );
}

function FollowsDialog({ handle, which, onClose }: { handle: string; which: "followers" | "following"; onClose: () => void }) {
    const { t } = useTranslation();
    const [list, setList] = useState<CommunityProfile[] | null>(null);
    useEffect(() => {
        listFollows(handle, which)
            .then(setList)
            .catch(() => setList([]));
    }, [handle, which]);
    return (
        <Modal open title={t(`community.profile.${which}`)} onCancel={onClose} footer={null} destroyOnHidden>
            {list === null ? (
                <Spin />
            ) : list.length ? (
                <div className="grid gap-2">
                    {list.map((p) => (
                        <Link key={p.handle} to={`/u/${p.handle}`} onClick={onClose} className="flex items-center gap-2.5 rounded-lg p-1.5 !text-inherit hover:bg-stone-100 dark:hover:bg-stone-800">
                            <AuthorAvatar author={p} size={32} />
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-medium">{authorName(p)}</span>
                                <span className="block truncate text-xs text-stone-500">@{p.handle}</span>
                            </span>
                        </Link>
                    ))}
                </div>
            ) : (
                <Empty description={t("community.profile.nobody")} />
            )}
        </Modal>
    );
}
