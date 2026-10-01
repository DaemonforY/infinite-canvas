export type ReferenceImage = {
    id: string;
    name: string;
    type: string;
    dataUrl: string;
    url?: string;
    storageKey?: string;
    /** File size, shown on the reference thumbnail. */
    bytes?: number;
    /** Id of the copy stored on the user's account (account sync); "-" = too large to sync. */
    blobId?: string;
};
