import { View, Text, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import React, { useState, useEffect, useRef } from 'react';
import { auth } from '@/lib/firebase';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_SERVER_URL;

interface ChatMessage {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

interface ChatProps {
  rideId: string;
  visible: boolean;
  onClose: () => void;
}

export default function Chat({ rideId, visible, onClose }: ChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const fetchMessages = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(`${API_URL}/api/chat/message?ride_id=${rideId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {}
  };

  useEffect(() => {
    if (visible) fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [visible, rideId]);

  const handleSend = async () => {
    if (!input.trim()) return;
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      await fetch(`${API_URL}/api/chat/message`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ride_id: rideId, content: input.trim() }),
      });
      setInput('');
      fetchMessages();
    } catch {}
  };

  const currentUserId = auth.currentUser?.uid;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white"
    >
      <View className="flex-row justify-between items-center px-4 py-3 border-b border-gray-200">
        <Text className="text-lg font-JakartaSemiBold">Chat</Text>
        <TouchableOpacity onPress={onClose}>
          <Text className="text-primary-500">Close</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        className="flex-1 px-4"
        renderItem={({ item }) => {
          const isMine = item.sender_id === currentUserId;
          return (
            <View className={`my-1 max-w-[80%] ${isMine ? 'self-end' : 'self-start'}`}>
              <View className={`rounded-xl px-4 py-2 ${isMine ? 'bg-primary-500' : 'bg-gray-100'}`}>
                <Text className={`${isMine ? 'text-white' : 'text-gray-800'}`}>
                  {item.content}
                </Text>
              </View>
              <Text className={`text-xs text-gray-400 mt-1 ${isMine ? 'text-right' : 'text-left'}`}>
                {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text className="text-center text-gray-400 mt-10">No messages yet</Text>
        }
      />

      <View className="flex-row items-center border-t border-gray-200 px-4 py-3">
        <TextInput
          className="flex-1 bg-gray-100 rounded-full px-4 py-2 mr-2"
          placeholder="Type a message..."
          placeholderTextColor="#9CA3AF"
          value={input}
          onChangeText={setInput}
        />
        <TouchableOpacity onPress={handleSend} className="bg-primary-500 rounded-full w-10 h-10 items-center justify-center">
          <Text className="text-white text-lg">→</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
