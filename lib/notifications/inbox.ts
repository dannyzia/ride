/**
 * Notification inbox store — mirrors the server inbox (list + unread count)
 * and persists the last-seen timestamp in AsyncStorage.
 *
 * Role endpoints share one response shape, so the store is parameterized by
 * the endpoint base ('/api/rider/notifications' | '/api/driver/notifications')
 * instead of duplicating a store per role.
 */
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "@/lib/config";
import { supabase } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const LAST_SEEN_KEY = "@inbox_last_seen_at";

export interface InboxNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
  time_ago: string;
}

export type InboxEndpointBase = "/api/rider/notifications" | "/api/driver/notifications";

interface InboxStore {
  items: InboxNotification[];
  unreadCount: number;
  nextCursor: string | null;
  loading: boolean;
  lastSeenAt: string | null;
  fetch: (endpointBase: InboxEndpointBase, opts?: { reset?: boolean }) => Promise<void>;
  loadMore: (endpointBase: InboxEndpointBase) => Promise<void>;
  markRead: (endpointBase: InboxEndpointBase, id: string) => Promise<void>;
  markAllRead: (endpointBase: InboxEndpointBase) => Promise<void>;
  softDelete: (endpointBase: InboxEndpointBase, id: string) => Promise<void>;
  /** Push a foreground-received notification into the store (optimistic). */
  upsertIncoming: (n: InboxNotification) => void;
  hydrateLastSeen: () => Promise<void>;
  touchLastSeen: () => Promise<void>;
}

interface InboxResponse {
  notifications?: InboxNotification[];
  unread_count?: number;
  next_cursor?: string | null;
}

async function authHeaders(): Promise<Record<string, string> | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return null;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export const useInboxStore = create<InboxStore>((set, get) => ({
  items: [],
  unreadCount: 0,
  nextCursor: null,
  loading: false,
  lastSeenAt: null,

  hydrateLastSeen: async () => {
    try {
      set({ lastSeenAt: await AsyncStorage.getItem(LAST_SEEN_KEY) });
    } catch (e) {
      logger.warn("[inbox] failed to load last-seen", e);
    }
  },

  touchLastSeen: async () => {
    const nowIso = new Date().toISOString();
    set({ lastSeenAt: nowIso, unreadCount: 0 });
    try {
      await AsyncStorage.setItem(LAST_SEEN_KEY, nowIso);
    } catch (e) {
      logger.warn("[inbox] failed to persist last-seen", e);
    }
  },

  fetch: async (endpointBase, opts = {}) => {
    const reset = opts.reset ?? true;
    if (reset) set({ loading: true });
    try {
      const headers = await authHeaders();
      if (!headers) {
        set({ loading: false });
        return;
      }
      const res = await fetch(`${API_URL}${endpointBase}?limit=20`, { headers });
      if (!res.ok) {
        set({ loading: false });
        return;
      }
      const data = (await res.json()) as InboxResponse;
      set({
        items: data.notifications ?? [],
        unreadCount: data.unread_count ?? 0,
        nextCursor: data.next_cursor ?? null,
        loading: false,
      });
    } catch (e) {
      logger.error("[inbox] fetch failed", e);
      set({ loading: false });
    }
  },

  loadMore: async (endpointBase) => {
    const { nextCursor, loading, items } = get();
    if (!nextCursor || loading) return;
    set({ loading: true });
    try {
      const headers = await authHeaders();
      if (!headers) {
        set({ loading: false });
        return;
      }
      const url = `${API_URL}${endpointBase}?limit=20&before=${encodeURIComponent(nextCursor)}`;
      const res = await fetch(url, { headers });
      if (!res.ok) {
        set({ loading: false });
        return;
      }
      const data = (await res.json()) as InboxResponse;
      const incoming = data.notifications ?? [];
      const seen = new Set(items.map((i) => i.id));
      set({
        items: [...items, ...incoming.filter((i) => !seen.has(i.id))],
        nextCursor: data.next_cursor ?? null,
        loading: false,
      });
    } catch (e) {
      logger.error("[inbox] loadMore failed", e);
      set({ loading: false });
    }
  },

  markRead: async (endpointBase, id) => {
    const { items, unreadCount } = get();
    // Optimistic read update; the server call is fire-and-forget.
    set({
      items: items.map((i) =>
        i.id === id && !i.read_at
          ? { ...i, read_at: new Date().toISOString() }
          : i,
      ),
      unreadCount: Math.max(0, unreadCount - 1),
    });
    try {
      const headers = await authHeaders();
      if (!headers) return;
      await fetch(`${API_URL}${endpointBase}/${id}/read`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({}),
      });
    } catch (e) {
      logger.warn("[inbox] markRead failed", e);
    }
  },

  markAllRead: async (endpointBase) => {
    const nowIso = new Date().toISOString();
    const { items } = get();
    set({
      items: items.map((i) => (i.read_at ? i : { ...i, read_at: nowIso })),
      unreadCount: 0,
    });
    try {
      const headers = await authHeaders();
      if (!headers) return;
      await fetch(`${API_URL}${endpointBase}/read-all`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({}),
      });
    } catch (e) {
      logger.warn("[inbox] markAllRead failed", e);
    }
  },

  softDelete: async (endpointBase, id) => {
    const { items, unreadCount } = get();
    const target = items.find((i) => i.id === id);
    set({
      items: items.filter((i) => i.id !== id),
      unreadCount: target && !target.read_at ? Math.max(0, unreadCount - 1) : unreadCount,
    });
    try {
      const headers = await authHeaders();
      if (!headers) return;
      await fetch(`${API_URL}${endpointBase}/${id}`, {
        method: "DELETE",
        headers,
      });
    } catch (e) {
      logger.warn("[inbox] softDelete failed", e);
    }
  },

  upsertIncoming: (n) => {
    const { items, unreadCount } = get();
    if (items.some((i) => i.id === n.id)) return;
    set({
      items: [n, ...items],
      unreadCount: n.read_at ? unreadCount : unreadCount + 1,
    });
  },
}));
