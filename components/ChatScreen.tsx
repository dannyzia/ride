import React, { useEffect, useCallback, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { GiftedChat, Send, Bubble, IMessage, InputToolbar } from 'react-native-gifted-chat';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useChatStore, ChatMessage } from '@/store/useChatStore';

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
        right: { backgroundColor: '#0CC25F' },
        left: { backgroundColor: '#E8E8E8' },
      }}
      textStyle={{
        right: { color: '#FFFFFF' },
        left: { color: '#212121' },
      }}
      timeTextStyle={{
        right: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
        left: { color: '#999', fontSize: 11 },
      }}
    />
  );

  const renderSend = (props: any) => (
    <Send {...props} containerStyle={{ justifyContent: 'center', marginRight: 8 }}>
      <View style={styles.sendButton}>
        <Ionicons name="send" size={16} color="#FFFFFF" />
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
        <ActivityIndicator size="large" color="#0CC25F" />
      </View>
    );
  }

  // Error state (no messages cached)
  if (error && messages.length === 0) {
    return (
      <View style={[styles.centerContainer, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color="#E31D1C" />
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
          <Ionicons name="chevron-back" size={24} color="#212121" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>Chat with {otherUserName}</Text>
        </View>
        {onCallPress ? (
          <TouchableOpacity style={styles.callButton} onPress={onCallPress}>
            <Ionicons name="call" size={22} color="#0CC25F" />
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
    backgroundColor: '#F7FCFF',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7FCFF',
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DADADA',
    backgroundColor: '#FFFFFF',
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
    color: '#212121',
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
    backgroundColor: '#0CC25F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputToolbar: {
    borderTopWidth: 0,
    paddingHorizontal: 8,
    paddingBottom: 4,
    backgroundColor: '#FFFFFF',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0CC25F',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  errorText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginTop: 12,
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 1000,
    backgroundColor: '#0CC25F',
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
});
