import { useEffect, useState } from "react";
import { App, Button, Empty, Input, Modal, Popconfirm, Segmented, Spin } from "antd";
import { Pencil, Share2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AuthorAvatar } from "@/components/community/author-avatar";
import { useShareLink } from "@/components/community/use-share-link";
import { useWorksFeed } from "@/components/community/use-works-feed";
import { WorkGrid } from "@/components/community/work-grid";
import { authorName, deleteCollection, getCollection, updateCollection, type Collection } from "@/services/api/community";

export default function CollectionPage() {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const navigate = useNavigate();
    const id = Number(useParams().id);
    const [collection, setCollection] = useState<Collection | null>(null);
    const [error, setError] = useState("");
    const [editing, setEditing] = useState(false);
    const feed = useWorksFeed({ collection: id }, Boolean(collection));
    const share = useShareLink(`/c/${id}`, { syncAddressBar: collection?.visibility === "public" });

    useEffect(() => {
        setCollection(null);
        setError("");
        getCollection(id)
            .then((c) => {
                setCollection(c);
                document.title = c.title;
            })
            .catch((err) => setError((err as Error).message));
    }, [id]);

    if (error) {
        return (
            <div className="flex h-full items-center justify-center">
                <Empty description={error} />
            </div>
        );
    }
    if (!collection) {
        return (
            <div className="flex h-full items-center justify-center">
                <Spin />
            </div>
        );
    }
    return (
        <div className="h-full overflow-y-auto bg-background px-3 py-6 text-stone-900 sm:px-6 dark:text-stone-100" data-testid="collection-page">
            <div className="mx-auto max-w-7xl">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="m-0 text-2xl font-semibold">{collection.title}</h1>
                        {collection.description ? <p className="mt-1 text-sm text-stone-600 dark:text-stone-300">{collection.description}</p> : null}
                        {collection.author ? (
                            <Link to={`/u/${collection.author.handle}`} className="mt-2 flex items-center gap-2 text-sm !text-stone-500 hover:!text-stone-800 dark:hover:!text-stone-200">
                                <AuthorAvatar author={collection.author} size={22} />
                                {authorName(collection.author)} · {t("community.collections.count", { count: collection.works_count })}
                            </Link>
                        ) : null}
                    </div>
                    <div className="flex gap-2">
                        {collection.visibility === "public" ? (
                            <Button icon={<Share2 className="size-4" />} onClick={share.copy}>
                                {t("community.share")}
                            </Button>
                        ) : null}
                        {collection.is_mine ? (
                            <>
                                <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
                                    {t("community.edit")}
                                </Button>
                                <Popconfirm
                                    title={t("community.collections.deleteConfirm")}
                                    okText={t("community.delete")}
                                    okButtonProps={{ danger: true }}
                                    cancelText={t("common.cancel")}
                                    onConfirm={async () => {
                                        await deleteCollection(collection.id);
                                        navigate(collection.author ? `/u/${collection.author.handle}` : "/explore");
                                    }}
                                >
                                    <Button danger icon={<Trash2 className="size-4" />}>
                                        {t("community.delete")}
                                    </Button>
                                </Popconfirm>
                            </>
                        ) : null}
                    </div>
                </div>
                <div className="mt-6">
                    {!feed.works.length && !feed.loading ? <Empty description={t("community.collections.noWorks")} className="py-12" /> : <WorkGrid works={feed.works} />}
                    {feed.loading ? (
                        <div className="flex justify-center py-6">
                            <Spin />
                        </div>
                    ) : feed.hasMore ? (
                        <div className="flex justify-center py-6">
                            <Button onClick={feed.loadMore}>{t("community.loadMore")}</Button>
                        </div>
                    ) : null}
                </div>
            </div>
            {editing ? <EditCollection collection={collection} onClose={() => setEditing(false)} onSaved={(c) => (setCollection(c), setEditing(false), message.success(t("community.profile.saved")))} /> : null}
        </div>
    );
}

function EditCollection({ collection, onClose, onSaved }: { collection: Collection; onClose: () => void; onSaved: (c: Collection) => void }) {
    const { t } = useTranslation();
    const { message } = App.useApp();
    const [title, setTitle] = useState(collection.title);
    const [description, setDescription] = useState(collection.description);
    const [visibility, setVisibility] = useState(collection.visibility);
    return (
        <Modal
            open
            title={t("community.edit")}
            onCancel={onClose}
            okText={t("common.save")}
            cancelText={t("common.cancel")}
            onOk={async () => {
                try {
                    onSaved(await updateCollection(collection.id, { title, description, visibility }));
                } catch (err) {
                    message.error((err as Error).message);
                }
            }}
            destroyOnHidden
        >
            <div className="grid gap-3">
                <Input value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
                <Input.TextArea value={description} maxLength={300} autoSize={{ minRows: 2, maxRows: 4 }} onChange={(e) => setDescription(e.target.value)} placeholder={t("community.publish.description")} />
                <Segmented
                    block
                    value={visibility}
                    onChange={(v) => setVisibility(v as "public" | "private")}
                    options={[
                        { value: "public", label: t("community.visibility.public") },
                        { value: "private", label: t("community.visibility.private") },
                    ]}
                />
            </div>
        </Modal>
    );
}
