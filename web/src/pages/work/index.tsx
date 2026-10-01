import { useEffect, useState } from "react";
import { App, Button, Checkbox, Dropdown, Empty, Input, Modal, Popconfirm, Radio, Segmented, Select, Spin, Switch, Tag } from "antd";
import { Copy, Eye, Flag, FolderPlus, Heart, Image as ImageIcon, Link2, Pencil, Share2, Sparkles, Star, Trash2, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AuthorAvatar } from "@/components/community/author-avatar";
import { WorkGrid } from "@/components/community/work-grid";
import { SharePosterDialog } from "@/components/community/share-poster-dialog";
import { useShareLink } from "@/components/community/use-share-link";
import { useMainSiteSignIn } from "@/components/layout/use-main-site-sign-in";
import {
    authorName,
    compactCount,
    countRemix,
    deleteWork,
    getWork,
    isSignInRequired,
    listCollections,
    listWorks,
    mainSiteAsset,
    reportWork,
    setCollectionItem,
    setFavorite,
    setFollow,
    setLike,
    updateWork,
    workCollections,
    type Collection,
    type Work,
    type WorkVisibility,
} from "@/services/api/community";
import { useMainAccountStore } from "@/stores/use-main-account-store";

const REPORT_REASONS = ["porn", "violence", "politics", "copyright", "fraud", "spam", "other"] as const;

export default function WorkPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const id = Number(useParams().id);
    const signedIn = useMainAccountStore((state) => state.status === "signedIn");
    const { signIn } = useMainSiteSignIn();
    const [work, setWork] = useState<Work | null>(null);
    const [error, setError] = useState("");
    const [index, setIndex] = useState(0);
    const [more, setMore] = useState<Work[]>([]);
    const [editing, setEditing] = useState(false);
    const [reporting, setReporting] = useState(false);
    const [posterOpen, setPosterOpen] = useState(false);
    const share = useShareLink(`/w/${id}`, { syncAddressBar: Boolean(work && work.visibility !== "private") });
    const [managing, setManaging] = useState(false);

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        setWork(null);
        setError("");
        setIndex(0);
        getWork(id)
            .then((w) => {
                if (cancelled) return;
                setWork(w);
                document.title = `${w.title || t("community.untitled")} · ${authorName(w.author)}`;
                return listWorks({ user: w.author.handle, limit: 11 }).then((page) => !cancelled && setMore(page.works.filter((x) => x.id !== w.id).slice(0, 10)));
            })
            .catch((err) => !cancelled && setError((err as Error).message));
        return () => {
            cancelled = true;
        };
    }, [id, signedIn, t]);

    const needSignIn = (err: unknown) => {
        if (isSignInRequired(err)) {
            message.info(t("community.signInToInteract"));
            signIn();
            return true;
        }
        message.error((err as Error).message);
        return false;
    };

    const toggle = async (kind: "like" | "favorite") => {
        if (!work) return;
        if (!signedIn) {
            message.info(t("community.signInToInteract"));
            return signIn();
        }
        try {
            const state = kind === "like" ? await setLike(work.id, !work.liked_by_me) : await setFavorite(work.id, !work.favorited_by_me);
            setWork({ ...work, ...state });
        } catch (err) {
            needSignIn(err);
        }
    };

    const follow = async () => {
        if (!work) return;
        if (!signedIn) {
            message.info(t("community.signInToInteract"));
            return signIn();
        }
        try {
            const profile = await setFollow(work.author.handle, !work.author.followed_by_me);
            setWork({ ...work, author: { ...work.author, followed_by_me: profile.followed_by_me } });
        } catch (err) {
            needSignIn(err);
        }
    };

    const remix = () => {
        if (!work) return;
        void countRemix(work.id);
        navigate(`/image?prompt=${encodeURIComponent(work.prompt.slice(0, 4000))}`);
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
    if (!work) {
        return (
            <div className="flex h-full items-center justify-center">
                <Spin />
            </div>
        );
    }

    const media = work.media?.length ? work.media : [{ position: 0, url: work.cover_url, thumb_url: work.cover_thumb_url, width: work.cover_width, height: work.cover_height, mime_type: "", size_bytes: 0 }];
    const current = media[Math.min(index, media.length - 1)];
    const params = Object.entries(work.params || {}).filter(([, v]) => typeof v === "string" || typeof v === "number");

    return (
        <div className="h-full overflow-y-auto bg-background px-3 py-6 text-stone-900 sm:px-6 dark:text-stone-100" data-testid="work-page">
            <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0">
                    <div className="relative flex items-center justify-center overflow-hidden rounded-2xl bg-stone-100 dark:bg-stone-900">
                        <a href={mainSiteAsset(current.url)} target="_blank" rel="noopener noreferrer" className="block">
                            <img src={mainSiteAsset(current.url)} alt={work.title} className="max-h-[75vh] w-auto max-w-full object-contain" />
                        </a>
                        <span className="absolute left-3 top-3 rounded bg-black/60 px-2 py-0.5 text-xs font-medium text-white">{t("community.aiLabel")}</span>
                    </div>
                    {media.length > 1 ? (
                        <div className="mt-3 flex gap-2 overflow-x-auto">
                            {media.map((m, i) => (
                                <button key={m.position} type="button" onClick={() => setIndex(i)} className={`size-16 shrink-0 overflow-hidden rounded-lg border-2 ${i === index ? "border-violet-500" : "border-transparent opacity-70 hover:opacity-100"}`}>
                                    <img src={mainSiteAsset(m.thumb_url)} alt="" className="size-full object-cover" />
                                </button>
                            ))}
                        </div>
                    ) : null}
                </div>

                <aside className="grid content-start gap-4 lg:sticky lg:top-0">
                    <div className="flex items-center gap-3">
                        <Link to={`/u/${work.author.handle}`} className="flex min-w-0 flex-1 items-center gap-2.5 !text-inherit">
                            <AuthorAvatar author={work.author} size={40} />
                            <span className="min-w-0">
                                <span className="block truncate font-medium">{authorName(work.author)}</span>
                                <span className="block truncate text-xs text-stone-500">@{work.author.handle}</span>
                            </span>
                        </Link>
                        {!work.is_mine ? (
                            <Button type={work.author.followed_by_me ? "default" : "primary"} onClick={() => void follow()} data-testid="work-follow">
                                {work.author.followed_by_me ? t("community.following") : t("community.follow")}
                            </Button>
                        ) : null}
                    </div>

                    <div>
                        <h1 className="m-0 text-xl font-semibold leading-snug">{work.title || t("community.untitled")}</h1>
                        {work.description ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-600 dark:text-stone-300">{work.description}</p> : null}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            <Tag className="m-0">{t("community.aiLabel")}</Tag>
                            {work.featured ? (
                                <Tag color="purple" className="m-0" icon={<Sparkles className="mr-1 inline size-3" />}>
                                    {t("community.featured")}
                                </Tag>
                            ) : null}
                            {work.is_mine && work.visibility !== "public" ? <Tag className="m-0">{t(`community.visibility.${work.visibility}`)}</Tag> : null}
                            {work.is_mine && work.status !== "approved" ? (
                                <Tag color={work.status === "pending" ? "gold" : "red"} className="m-0">
                                    {t(`community.status.${work.status}`)}
                                    {work.review_reason ? `：${work.review_reason}` : ""}
                                </Tag>
                            ) : null}
                        </div>
                    </div>

                    <div className="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
                        <div className="mb-1.5 text-xs font-medium text-stone-500">{t("community.prompt")}</div>
                        {work.prompt ? (
                            <>
                                <p className="m-0 max-h-48 overflow-y-auto whitespace-pre-wrap text-sm leading-6">{work.prompt}</p>
                                <div className="mt-3 flex gap-2">
                                    <Button
                                        size="small"
                                        icon={<Copy className="size-3.5" />}
                                        onClick={() => {
                                            void navigator.clipboard?.writeText(work.prompt);
                                            message.success(t("community.promptCopied"));
                                        }}
                                    >
                                        {t("community.copy")}
                                    </Button>
                                    <Button size="small" type="primary" icon={<Wand2 className="size-3.5" />} onClick={remix} data-testid="work-remix">
                                        {t("community.remix")}
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <p className="m-0 text-sm text-stone-500">{t("community.promptHidden")}</p>
                        )}
                        {work.model || params.length ? (
                            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-stone-100 pt-2 text-xs text-stone-500 dark:border-stone-800">
                                {work.model ? <span className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-stone-800">{work.model}</span> : null}
                                {params.map(([k, v]) => (
                                    <span key={k} className="rounded bg-stone-100 px-1.5 py-0.5 dark:bg-stone-800">
                                        {k}: {String(v)}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>

                    {work.tags.length ? (
                        <div className="flex flex-wrap gap-1.5">
                            {work.tags.map((tag) => (
                                <Link key={tag} to={`/explore?tag=${encodeURIComponent(tag)}`} className="rounded-full border border-stone-200 px-2.5 py-0.5 text-xs text-stone-600 hover:border-violet-400 dark:border-stone-700 dark:text-stone-300">
                                    #{tag}
                                </Link>
                            ))}
                        </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2">
                        <Button icon={<Heart className="size-4" color={work.liked_by_me ? "#f43f5e" : "currentColor"} fill={work.liked_by_me ? "#f43f5e" : "none"} />} onClick={() => void toggle("like")} data-testid="work-like">
                            {compactCount(work.like_count)}
                        </Button>
                        <Button icon={<Star className="size-4" color={work.favorited_by_me ? "#f59e0b" : "currentColor"} fill={work.favorited_by_me ? "#f59e0b" : "none"} />} onClick={() => void toggle("favorite")} data-testid="work-favorite">
                            {compactCount(work.favorite_count)}
                        </Button>
                        <Dropdown
                            trigger={["click"]}
                            menu={{
                                items: [
                                    { key: "link", icon: <Link2 className="size-4" />, label: t("community.copyLink"), onClick: share.copy },
                                    { key: "poster", icon: <ImageIcon className="size-4" />, label: t("community.poster.action"), onClick: () => setPosterOpen(true) },
                                    ...(share.signedIn ? [] : [{ key: "invite", disabled: true, label: <span className="block max-w-56 whitespace-normal text-xs">{t("community.inviteSignInHint")}</span> }]),
                                ],
                            }}
                        >
                            <Button icon={<Share2 className="size-4" />} data-testid="work-share">
                                {t("community.share")}
                            </Button>
                        </Dropdown>
                        {!work.is_mine ? <Button type="text" icon={<Flag className="size-4" />} aria-label={t("community.report.action")} title={t("community.report.action")} onClick={() => setReporting(true)} /> : null}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
                        <span className="flex items-center gap-1">
                            <Eye className="size-3.5" />
                            {t("community.views", { count: work.view_count })}
                        </span>
                        <span>{t("community.remixes", { count: work.remix_count })}</span>
                        <span>{new Date(work.created_at).toLocaleDateString()}</span>
                    </div>

                    {work.is_mine ? (
                        <div className="flex flex-wrap gap-2 border-t border-stone-200 pt-3 dark:border-stone-800">
                            <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
                                {t("community.edit")}
                            </Button>
                            <Button size="small" icon={<FolderPlus className="size-3.5" />} onClick={() => setManaging(true)}>
                                {t("community.collections.manage")}
                            </Button>
                            <Popconfirm
                                title={t("community.deleteConfirm")}
                                okText={t("community.delete")}
                                okButtonProps={{ danger: true }}
                                cancelText={t("common.cancel")}
                                onConfirm={async () => {
                                    try {
                                        await deleteWork(work.id);
                                        message.success(t("community.deleted"));
                                        navigate(`/u/${work.author.handle}`);
                                    } catch (err) {
                                        message.error((err as Error).message);
                                    }
                                }}
                            >
                                <Button size="small" danger icon={<Trash2 className="size-3.5" />}>
                                    {t("community.delete")}
                                </Button>
                            </Popconfirm>
                        </div>
                    ) : null}
                </aside>
            </div>

            {more.length ? (
                <div className="mx-auto mt-10 max-w-7xl">
                    <h2 className="mb-3 text-base font-semibold">{t("community.moreFrom", { name: authorName(work.author) })}</h2>
                    <WorkGrid works={more} showAuthor={false} />
                </div>
            ) : null}

            {editing ? <EditWorkDialog work={work} onClose={() => setEditing(false)} onSaved={(w) => (setWork({ ...work, ...w }), setEditing(false))} /> : null}
            {posterOpen ? <SharePosterDialog work={work} url={share.url} invited={share.invited} onClose={() => setPosterOpen(false)} /> : null}
            {reporting ? <ReportDialog workId={work.id} onClose={() => setReporting(false)} /> : null}
            {managing ? <CollectionsDialog work={work} onClose={() => setManaging(false)} /> : null}
        </div>
    );
}

function EditWorkDialog({ work, onClose, onSaved }: { work: Work; onClose: () => void; onSaved: (w: Work) => void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [title, setTitle] = useState(work.title);
    const [description, setDescription] = useState(work.description);
    const [showPrompt, setShowPrompt] = useState(work.show_prompt);
    const [tags, setTags] = useState(work.tags);
    const [visibility, setVisibility] = useState<WorkVisibility>(work.visibility);
    const [saving, setSaving] = useState(false);
    const save = async () => {
        setSaving(true);
        try {
            onSaved(await updateWork(work.id, { title, description, show_prompt: showPrompt, tags, visibility }));
        } catch (err) {
            message.error((err as Error).message);
        } finally {
            setSaving(false);
        }
    };
    return (
        <Modal open title={t("community.edit")} onCancel={onClose} onOk={() => void save()} okText={t("common.save")} cancelText={t("common.cancel")} confirmLoading={saving} destroyOnHidden>
            <div className="grid gap-3 text-sm">
                <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder={t("community.publish.title")} />
                <Input.TextArea value={description} maxLength={1000} autoSize={{ minRows: 2, maxRows: 5 }} onChange={(e) => setDescription(e.target.value)} placeholder={t("community.publish.description")} />
                <Select mode="tags" value={tags} maxCount={6} onChange={setTags} placeholder={t("community.publish.tagsPlaceholder")} />
                <Segmented block value={visibility} onChange={(v) => setVisibility(v as WorkVisibility)} options={(["public", "unlisted", "private"] as const).map((v) => ({ value: v, label: t(`community.visibility.${v}`) }))} />
                <span className="flex items-center gap-2">
                    <Switch size="small" checked={showPrompt} onChange={setShowPrompt} />
                    {t("community.publish.showPrompt")}
                </span>
            </div>
        </Modal>
    );
}

function ReportDialog({ workId, onClose }: { workId: number; onClose: () => void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [reason, setReason] = useState<string>("");
    const [detail, setDetail] = useState("");
    const [sending, setSending] = useState(false);
    const send = async () => {
        if (!reason) return;
        setSending(true);
        try {
            await reportWork(workId, reason, detail);
            message.success(t("community.report.sent"));
            onClose();
        } catch (err) {
            message.error((err as Error).message);
        } finally {
            setSending(false);
        }
    };
    return (
        <Modal open title={t("community.report.title")} onCancel={onClose} onOk={() => void send()} okText={t("community.report.submit")} cancelText={t("common.cancel")} okButtonProps={{ disabled: !reason }} confirmLoading={sending} destroyOnHidden>
            <Radio.Group value={reason} onChange={(e) => setReason(e.target.value)} className="grid gap-1.5">
                {REPORT_REASONS.map((r) => (
                    <Radio key={r} value={r}>
                        {t(`community.report.reasons.${r}`)}
                    </Radio>
                ))}
            </Radio.Group>
            <Input.TextArea className="mt-3" value={detail} maxLength={500} autoSize={{ minRows: 2, maxRows: 4 }} placeholder={t("community.report.detail")} onChange={(e) => setDetail(e.target.value)} />
        </Modal>
    );
}

function CollectionsDialog({ work, onClose }: { work: Work; onClose: () => void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [collections, setCollections] = useState<Collection[] | null>(null);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    useEffect(() => {
        Promise.all([listCollections(work.author.handle), workCollections(work.id)])
            .then(([list, ids]) => {
                setCollections(list);
                setSelected(new Set(ids));
            })
            .catch((err) => message.error((err as Error).message));
    }, [message, work.author.handle, work.id]);
    const toggle = async (id: number, on: boolean) => {
        try {
            await setCollectionItem(id, work.id, on);
            setSelected((current) => {
                const next = new Set(current);
                if (on) next.add(id);
                else next.delete(id);
                return next;
            });
        } catch (err) {
            message.error((err as Error).message);
        }
    };
    return (
        <Modal open title={t("community.collections.manage")} onCancel={onClose} footer={null} destroyOnHidden>
            {collections === null ? (
                <Spin />
            ) : collections.length ? (
                <div className="grid gap-2">
                    {collections.map((c) => (
                        <Checkbox key={c.id} checked={selected.has(c.id)} onChange={(e) => void toggle(c.id, e.target.checked)}>
                            {c.title} <span className="text-xs text-stone-500">({c.works_count})</span>
                        </Checkbox>
                    ))}
                </div>
            ) : (
                <Empty description={t("community.collections.emptyMine")} />
            )}
        </Modal>
    );
}
