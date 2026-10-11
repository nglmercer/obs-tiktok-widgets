export declare const CONTRACT_VERSION: 1;
export interface TikTokUser {
    id?: string;
    nickname?: string;
    unique_id?: string;
    avatar_url?: string;
    sec_uid?: string;
}
export interface ChatData {
    user: TikTokUser;
    comment: string;
}
export interface GiftData {
    user: TikTokUser;
    gift_id: string;
    gift_name: string;
    repeat_count: string;
    combo_count?: string;
    group_id: string;
    repeat_end: boolean;
    diamond_count?: string;
    gift_image_url?: string;
}
export interface TikTokEvent<T = Record<string, unknown>> {
    version: 1;
    type: string;
    room?: string;
    method?: string;
    messageId?: string;
    isHistory?: boolean;
    sourceTimestamp?: string | null;
    sourceTimestampUnit?: 'server-defined';
    receivedTimestamp?: string;
    data: T;
    native?: Record<string, unknown>;
    rawPayload?: string;
    synthetic?: boolean;
}
export interface EventMap {
    chat: ChatData;
    gift: GiftData;
    like: {
        count: string;
        total: string;
        user?: TikTokUser;
    };
    roomUser: {
        total: string;
    };
    state: {
        state: string;
        username?: string;
        error?: string;
    };
    follow: {
        user: TikTokUser;
    };
    [key: string]: unknown;
}
