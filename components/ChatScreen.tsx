import React, { useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { GiftedChat, Send, Bubble, IMessage, InputToolbar } from 'react-native-gifted-chat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useChatStore, ChatMessage } from '@/store/useChatStore';
import { colors } from '@/theme/goRide';

interface ChatScreenProps {
  rideId: string;
  currentUserId: string;
  otherUserName: string;
  rideActive: boolean;
  onCallPress?: () => void;
  onBackPress?: () => void;
}

export default function ChatScreen({ rideId, currentUserId, otherUserName, rideActive, onCallPress, onBackPress }: ChatScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { messages, loading, error, hasMore, loadMessages, sendMessage, onNewMessage, clearChat } = useChatStore();
  const wsRef = useRef<WebSocket | null>(null);

  // Initial load
  useEffect(() => {
    loadMessages(rideId);
    return () => clearChat();
  }, [rideId]);

  // Listen for chat:message via WS global store
  useEffect(() => {
    const { useWSStore } = require('../store');
    const unsubscribe = useWSStore.subscribe((state: { ws: WebSocket | null }) => {
      wsRef.current = state.ws;
    });
    wsRef.current = useWSStore.getState().ws;
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'chat:message' && data.ride_id === rideId) {
          onNewMessage(data.message as ChatMessage);
        }
      } catch { /* ignore */ }
    };
    ws.addEventListener('message', handler);
    return () => ws.removeEventListener('message', handler);
  }, [rideId, onNewMessage]);

  // Convert store messages to GiftedChat format
  const giftedMessages: IMessage[] = messages.map((m) => ({
    _id: m.id,
    text: m.content,
    createdAt: new Date(m.created_at),
    user: {
      _id: m.sender_id,
      name: m.sender_id !== currentUserId ? otherUserName : '',
    },
  }));

  const onSend = useCallback(async (newMessages: IMessage[]) => {
    const text = newMessages[0]?.text;
    if (!text) return;
    await sendMessage(text);
  }, [sendMessage]);

  const onLoadEarlier = useCallback(async () => {
    if (!hasMore || loading || messages.length === 0) return;
    const oldest = messages[messages.length - 1];
    if (oldest?.created_at) {
      await loadMessages(rideId, oldest.created_at);
    }
  }, [hasMore, loading, messages, rideId, loadMessages]);

  const renderBubble = (props: any) => (
    <Bubble
      {...props}
      wrapperStyle={{
        right: { backgroundColor: colors.primary },
        left: { backgroundColor: colors.borderLight },
      }}
      textStyle={{
        right: { color: colors.textPrimaryDark },
        left: { color: colors.textPrimaryLight },
      }}
      timeTextStyle={{
        right: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
        left: { color: colors.grayMedium, fontSize: 11 },
      }}
    />
  );

  const renderSend = (props: any) => (
    <Send {...props} containerStyle={{ justifyContent: 'center', marginRight: 8 }}>
      <View style={styles.sendButton}>
        <Ionicons name="send" size={16} color={colors.textPrimaryDark} />
      </View>
    </Send>
  );

  const renderInputToolbar = (props: any) => {
    if (!rideActive) return null;
    return (
      <InputToolbar
        {...props}
        containerStyle={styles.inputToolbar}
        primaryStyle={{ alignItems: 'center' }}
      />
    );
  };

  const renderAvatar = (props: any) => {
    const { currentMessage } = props;
    if (!currentMessage || currentMessage.user?._id === currentUserId) return null;
    const initial = (otherUserName?.[0] ?? '?').toUpperCase();
    return (
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{initial}</Text>
      </View>
    );
  };

  // Loading state (initial load only)
  if (loading && messages.length === 0) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Error state (no messages cached)
  if (error && messages.length === 0) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => loadMessages(rideId)}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBackPress ?? (() => router.back())}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimaryLight} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>Chat with {otherUserName}</Text>
        </View>
        {onCallPress ? (
          <TouchableOpacity style={styles.callButton} onPress={onCallPress}>
            <Ionicons name="call" size={22} color={colors.primary} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>

      {/* Chat Messages */}
      <GiftedChat
        messages={giftedMessages}
        onSend={onSend}
        user={{ _id: currentUserId }}
        loadEarlierMessagesProps={{
          isAvailable: hasMore,
          isLoading: loading,
          onPress: onLoadEarlier,
        }}
        renderBubble={renderBubble}
        renderSend={renderSend}
        renderInputToolbar={renderInputToolbar}
        renderAvatar={renderAvatar}
        isSendButtonAlwaysVisible
        isAvatarVisibleForEveryMessage
        messagesContainerStyle={{ paddingBottom: 4 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgLight,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgLight,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.surfaceLight,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimaryLight,
  },
  callButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputToolbar: {
    borderTopWidth: 0,
    paddingHorizontal: 8,
    paddingBottom: 4,
    backgroundColor: colors.surfaceLight,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    color: colors.textPrimaryDark,
    fontWeight: '600',
    fontSize: 14,
  },
  errorText: {
    fontSize: 15,
    color: colors.gray,
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 1000,
    backgroundColor: colors.primary,
  },
  retryText: {
    color: colors.textPrimaryDark,
    fontWeight: '600',
    fontSize: 14,
  },
});
