import { create } from 'zustand';

export interface ChatMessage {
  id: string;
  ride_id: string;
  sender_id: string;
  sender_role: string;
  content: string;
  created_at: string;
}

interface ChatStore {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  rideId: string | null;

  loadMessages: (rideId: string, before?: string) => Promise<void>;
  sendMessage: (content: string) => Promise<ChatMessage | null>;
  onNewMessage: (msg: ChatMessage) => void;
  clearChat: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  loading: false,
  error: null,
  hasMore: false,
  rideId: null,

  loadMessages: async (rideId: string, before?: string) => {
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (before) params.set('before', before);
      const url = `/api/ride/${rideId}/messages${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.json();
        set({ error: body.error ?? 'load_failed', loading: false });
        return;
      }
      const data = await res.json();
      const loaded = (data.messages as ChatMessage[]).reverse();

      set((state) => {
        if (before) {
          // Prepend older messages to the GiftedChat array (newest-first)
          return {
            messages: [...loaded, ...state.messages],
            hasMore: data.has_more,
            loading: false,
            rideId,
          };
        }
        return {
          messages: loaded,
          hasMore: data.has_more,
          loading: false,
          rideId,
        };
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },

  sendMessage: async (content: string) => {
    const { rideId } = get();
    if (!rideId) return null;
    try {
      const res = await fetch(`/api/ride/${rideId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) return null;
      const msg = (await res.json()) as ChatMessage;
      set((state) => ({ messages: [msg, ...state.messages] }));
      return msg;
    } catch {
      return null;
    }
  },

  onNewMessage: (msg: ChatMessage) => {
    const { rideId } = get();
    if (msg.ride_id !== rideId) return;
    set((state) => {
      if (state.messages.some((m) => m.id === msg.id)) return state;
      return { messages: [msg, ...state.messages] };
    });
  },

  clearChat: () =>
    set({
      messages: [],
      loading: false,
      error: null,
      hasMore: false,
      rideId: null,
    }),
}));
