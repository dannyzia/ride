import React, { useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { GiftedChat, Send, Bubble, IMessage, InputToolbar } from 'react-native-gifted-chat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useChatStore, ChatMessage } from '@/store/useChatStore';
import { colors } from '@/theme/goRide';
import { useAppearance } from '@/lib/useAppearance';

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
  const { theme } = useAppearance();
  const isDark = theme === 'dark' || theme === 'system';

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

  const bg = isDark ? colors.bgDark : colors.bgLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;

  const renderBubble = (props: any) => (
    <Bubble
      {...props}
      wrapperStyle={{
        right: { backgroundColor: colors.primary },
        left: { backgroundColor: isDark ? colors.surfaceElevatedDark : colors.gray100 },
      }}
      textStyle={{
        right: { color: colors.white, fontFamily: 'Jakarta-Regular' },
        left: { color: textPrimary, fontFamily: 'Jakarta-Regular' },
      }}
      timeTextStyle={{
        right: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: 'Jakarta-Regular' },
        left: { color: textSecondary, fontSize: 11, fontFamily: 'Jakarta-Regular' },
      }}
    />
  );

  const renderSend = (props: any) => (
    <Send {...props} containerStyle={{ justifyContent: 'center', marginRight: 8 }}>
      <View style={[styles.sendButton, { backgroundColor: colors.primary }]}>
        <Ionicons name="send" size={16} color={colors.white} />
      </View>
    </Send>
  );

  const renderInputToolbar = (props: any) => {
    if (!rideActive) return null;
    return (
      <InputToolbar
        {...props}
        containerStyle={[styles.inputToolbar, { backgroundColor: surfaceBg, borderTopColor: borderColor }]}
        primaryStyle={{ alignItems: 'center' }}
      />
    );
  };

  const renderAvatar = (props: any) => {
    const { currentMessage } = props;
    if (!currentMessage || currentMessage.user?._id === currentUserId) return null;
    const initial = (otherUserName?.[0] ?? '?').toUpperCase();
    return (
      <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
        <Text style={[styles.avatarText, { color: colors.white }]}>{initial}</Text>
      </View>
    );
  };

  // Loading state (initial load only)
  if (loading && messages.length === 0) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top, backgroundColor: bg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // Error state (no messages cached)
  if (error && messages.length === 0) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top, backgroundColor: bg }]}>
        <Ionicons name="alert-circle-outline" size={48} color={colors.danger} />
        <Text style={[styles.errorText, { color: textSecondary }]}>{error}</Text>
        <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]} onPress={() => loadMessages(rideId)}>
          <Text style={[styles.retryText, { color: colors.white }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: surfaceBg, borderBottomColor: borderColor }]}>
        <TouchableOpacity style={styles.backButton} onPress={onBackPress ?? (() => router.back())}>
          <Ionicons name="chevron-back" size={24} color={textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: textPrimary }]} numberOfLines={1}>Chat with {otherUserName}</Text>
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
        messagesContainerStyle={{ paddingBottom: 4, backgroundColor: bg }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
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
    fontFamily: 'Jakarta-SemiBold',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputToolbar: {
    borderTopWidth: 1,
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    fontFamily: 'Jakarta-SemiBold',
    fontSize: 14,
  },
  errorText: {
    fontSize: 15,
    fontFamily: 'Jakarta-Regular',
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 1000,
  },
  retryText: {
    fontFamily: 'Jakarta-SemiBold',
    fontSize: 14,
  },
});
