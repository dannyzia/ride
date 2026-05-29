import { colors } from '@/theme/goRide';
import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert, RefreshControl, Modal, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';

interface PendingDocument {
  id: string;
  driver_id: string;
  driver_name: string;
  document_type: string;
  image_url: string;
  status: string;
  created_at: string;
}

export default function VerificationScreen() {
  const [docs, setDocs] = useState<PendingDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<PendingDocument | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/documents/pending');
      if (res.ok) {
        const data = await res.json();
        setDocs(Array.isArray(data) ? data : (data.docs ?? []));
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  const handleApprove = async (docId: string) => {
    setActioning(docId);
    try {
      const res = await fetch('/api/admin/documents/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: docId }),
      });
      if (res.ok) {
        const data = await res.json();
        setDocs(prev => prev.filter(d => d.id !== docId));
        if (data.vehicle_age_days !== undefined && data.vehicle_age_days < 365) {
          Alert.alert(
            'BRTA Warning',
            `⚠️ Vehicle is less than 1 year old (${data.vehicle_age_days} days). Verify BRTA registration manually.`,
          );
        }
      } else {
        const err = await res.json();
        Alert.alert('Failed', err.message || 'Approval failed');
      }
    } catch {
      Alert.alert('Error', 'Could not approve document');
    } finally {
      setActioning(null);
    }
  };

  const handleReject = async () => {
    if (!showReject || !rejectReason.trim()) {
      Alert.alert('Validation', 'Please enter a rejection reason');
      return;
    }
    setActioning(showReject);
    try {
      const res = await fetch('/api/admin/documents/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: showReject, reason: rejectReason.trim() }),
      });
      if (res.ok) {
        setDocs(prev => prev.filter(d => d.id !== showReject));
        setShowReject(null);
        setRejectReason('');
      } else {
        const err = await res.json();
        Alert.alert('Failed', err.message || 'Rejection failed');
      }
    } catch {
      Alert.alert('Error', 'Could not reject document');
    } finally {
      setActioning(null);
    }
  };

  const renderDoc = ({ item }: { item: PendingDocument }) => (
    <View className="bg-cardBgColor rounded-2xl p-5 mb-3">
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-1">
          <Text className="text-primaryTextColor font-semibold text-base">{item.driver_name}</Text>
          <Text className="text-secondaryTextColor text-sm capitalize">{item.document_type.replace(/_/g, ' ')}</Text>
        </View>
        <View className="bg-warning-500/20 rounded-full px-3 py-1">
          <Text className="text-warning-500 text-xs font-medium">pending</Text>
        </View>
      </View>

      {item.image_url && (
        <TouchableOpacity onPress={() => setPreviewDoc(item)} className="mb-4">
          <Image source={{ uri: item.image_url }} style={{ width: '100%', height: 120 }} resizeMode="cover" className="rounded-xl" />
        </TouchableOpacity>
      )}

      <View className="flex-row gap-3">
        <TouchableOpacity
          onPress={() => handleApprove(item.id)}
          disabled={actioning === item.id}
          className="flex-1 bg-general-400 rounded-full py-3 items-center"
        >
          {actioning === item.id ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text className="text-white font-semibold">Approve</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setShowReject(item.id)}
          disabled={actioning === item.id}
          className="flex-1 bg-danger-500 rounded-full py-3 items-center"
        >
          <Text className="text-white font-semibold">Reject</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-bgColor">
      <View className="flex-row items-center px-5 py-4">
        <TouchableOpacity onPress={() => router.back()}>
          <AntDesign name="arrowleft" size={24} color={colors.adminSubtle} />
        </TouchableOpacity>
        <Text className="text-primaryTextColor text-lg font-bold ml-4">Document Verification</Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={colors.adminAccent} />
        </View>
      ) : docs.length === 0 ? (
        <View className="flex-1 items-center justify-center px-8">
          <AntDesign name="checksquareo" size={64} color={colors.adminIconDark} />
          <Text className="text-secondaryTextColor text-base mt-4 text-center">No pending documents.</Text>
        </View>
      ) : (
        <FlatList
          data={docs}
          keyExtractor={item => item.id}
          renderItem={renderDoc}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPending(); }} tintColor={colors.adminAccent} />}
        />
      )}

      {/* Image Preview Modal */}
      <Modal visible={!!previewDoc} transparent animationType="fade">
        <View className="flex-1 bg-black/90 items-center justify-center">
          {previewDoc?.image_url && (
            <Image source={{ uri: previewDoc.image_url }} style={{ width: '90%', aspectRatio: 16 / 9 }} resizeMode="contain" />
          )}
          <TouchableOpacity onPress={() => setPreviewDoc(null)} className="mt-6 bg-general-400 rounded-full px-6 py-3">
            <Text className="text-white font-semibold">Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Reject Reason Modal */}
      <Modal visible={!!showReject} transparent animationType="slide">
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-cardBgColor rounded-t-3xl p-6">
            <Text className="text-primaryTextColor text-lg font-bold mb-4">Rejection Reason</Text>
            <TextInput
              className="bg-hoverBgColor text-primaryTextColor rounded-xl px-4 py-3 mb-4"
              placeholder="Enter reason..."
              placeholderTextColor={colors.textDisabledDark}
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <View className="flex-row gap-3">
              <TouchableOpacity onPress={() => { setShowReject(null); setRejectReason(''); }} className="flex-1 bg-hoverBgColor rounded-full py-3 items-center">
                <Text className="text-primaryTextColor font-semibold">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleReject} disabled={actioning === showReject} className="flex-1 bg-danger-500 rounded-full py-3 items-center">
                {actioning === showReject ? <ActivityIndicator size="small" color="#FFF" /> : <Text className="text-white font-semibold">Reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
