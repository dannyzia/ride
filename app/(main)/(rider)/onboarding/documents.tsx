import { colors } from '@/theme/goRide';
import { useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { AntDesign } from '@expo/vector-icons';
import { uploadImage } from '@/lib/imageToURL';
import { useDriverFlowStore } from '@/store/useDriverFlowStore';

const REQUIRED_DOCUMENTS = [
  { key: 'nid_front', label: 'NID (Front)', description: 'Front side of your National ID Card' },
  { key: 'nid_back', label: 'NID (Back)', description: 'Back side of your National ID Card' },
  { key: 'driving_license', label: 'Driving License', description: 'Valid driving license for your vehicle type' },
  { key: 'vehicle_registration', label: 'Vehicle Registration', description: 'Vehicle registration paper (if applicable)' },
];

const CONSENT_ITEMS = [
  'I confirm that all submitted documents are genuine and belong to me.',
  'I agree to the Terms of Service and Privacy Policy.',
  'I consent to background verification as required by regulatory authorities.',
  'I understand that submitting false documents will result in permanent account rejection.',
];

export default function DocumentsScreen() {
  const { fetchDriver } = useDriverFlowStore();
  const [step, setStep] = useState<'upload' | 'consent'>('upload');
  const [documents, setDocuments] = useState<Record<string, string | null>>({
    nid_front: null,
    nid_back: null,
    driving_license: null,
    vehicle_registration: null,
  });
  const [uploading, setUploading] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [consentChecked, setConsentChecked] = useState<boolean[]>(CONSENT_ITEMS.map(() => false));

  const pickDocument = async (docKey: string) => {
    setUploading(docKey);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        const uri = result.assets[0].uri;
        const fileName = `${docKey}_${Date.now()}.jpg`;
        const imageUrl = await uploadImage(uri, fileName);
        setDocuments(prev => ({ ...prev, [docKey]: imageUrl }));
      }
    } catch (error: any) {
      Alert.alert('Upload Failed', error.message || 'Could not upload document. Please try again.');
    } finally {
      setUploading(null);
    }
  };

  const allDocumentsUploaded = REQUIRED_DOCUMENTS.every(d => documents[d.key] !== null);

  const toggleConsent = (index: number) => {
    setConsentChecked(prev => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const allConsentGiven = consentChecked.every(Boolean);

  const handleSubmit = async () => {
    if (!allDocumentsUploaded || !allConsentGiven) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/driver/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documents }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Submission failed');
      }

      await fetchDriver();
      Alert.alert('Documents Submitted', 'Your documents have been submitted for verification. You will be notified once approved.', [
        { text: 'OK', onPress: () => router.replace('/(main)/(rider)/home') },
      ]);
    } catch (error: any) {
      Alert.alert('Submission Failed', error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-goBgColor">
      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between mt-4 mb-6">
          <TouchableOpacity onPress={() => router.back()}>
            <AntDesign name="arrowleft" size={24} color={colors.adminSubtle} />
          </TouchableOpacity>
          <Text className="text-primaryTextColor text-lg font-bold">
            {step === 'upload' ? 'Upload Documents' : 'Owner Consent'}
          </Text>
          <TouchableOpacity onPress={() => setStep(step === 'upload' ? 'consent' : 'upload')}>
            <Text className="text-accentColor text-sm">{step === 'upload' ? 'Next' : 'Back'}</Text>
          </TouchableOpacity>
        </View>

        {/* Step Indicator */}
        <View className="flex-row justify-center mb-6">
          <View className={`w-3 h-3 rounded-full mx-1 ${step === 'upload' ? 'bg-accentColor' : 'bg-borderColor'}`} />
          <View className={`w-3 h-3 rounded-full mx-1 ${step === 'consent' ? 'bg-accentColor' : 'bg-borderColor'}`} />
        </View>

        {step === 'upload' && (
          <>
            <Text className="text-secondaryTextColor text-sm mb-5">
              Upload clear photos of the following documents. Accepted formats: JPG, PNG.
            </Text>

            {REQUIRED_DOCUMENTS.map(doc => (
              <View key={doc.key} className="bg-cardBgColor rounded-xl p-4 mb-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-3">
                    <Text className="text-primaryTextColor font-semibold text-base">{doc.label}</Text>
                    <Text className="text-secondaryTextColor text-xs mt-1">{doc.description}</Text>
                  </View>
                  {documents[doc.key] ? (
                    <TouchableOpacity
                      onPress={() => pickDocument(doc.key)}
                      className="bg-success-500/20 rounded-lg px-3 py-2"
                    >
                      <View className="flex-row items-center">
                        <AntDesign name="check" size={14} color={colors.checkGreen} />
                        <Text className="text-success-500 text-xs ml-1">Done</Text>
                      </View>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      onPress={() => pickDocument(doc.key)}
                      disabled={uploading === doc.key}
                      className="bg-accentColor/20 rounded-lg px-4 py-2"
                    >
                      {uploading === doc.key ? (
                        <ActivityIndicator size="small" color={colors.adminAccent} />
                      ) : (
                        <Text className="text-accentColor text-sm font-medium">Upload</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
                {documents[doc.key] && (
                  <Image source={{ uri: documents[doc.key]! }} className="w-full h-32 rounded-lg mt-3" resizeMode="cover" />
                )}
              </View>
            ))}
          </>
        )}

        {step === 'consent' && (
          <>
            <Text className="text-secondaryTextColor text-sm mb-5">
              Please review and confirm each statement before submitting.
            </Text>

            {CONSENT_ITEMS.map((item, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => toggleConsent(index)}
                className="bg-cardBgColor rounded-xl p-4 mb-3 flex-row items-start"
              >
                <View className={`w-5 h-5 rounded border-2 mr-3 mt-0.5 items-center justify-center ${consentChecked[index] ? 'bg-accentColor border-accentColor' : 'border-borderColor'}`}>
                  {consentChecked[index] && <AntDesign name="check" size={12} color={colors.darkSurface} />}
                </View>
                <Text className="text-primaryTextColor flex-1 text-sm leading-5">{item}</Text>
              </TouchableOpacity>
            ))}

            {/* Submit */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!allConsentGiven || submitting}
              className={`rounded-full py-4 mt-6 items-center ${allConsentGiven && !submitting ? 'bg-general-400' : 'bg-borderColor'}`}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.surfaceLight} />
              ) : (
                <Text className={`text-base font-bold ${allConsentGiven ? 'text-white' : 'text-secondaryTextColor'}`}>
                  Submit Documents
                </Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
