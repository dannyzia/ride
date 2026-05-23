import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage, ref, uploadBytesResumable, uploadBytes, getDownloadURL } from 'firebase/storage';
import Constants from 'expo-constants';

const {
  EXPO_PUBLIC_FIREBASE_API_KEY: FIREBASE_API_KEY,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: FIREBASE_STORAGE_BUCKET,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: FIREBASE_MESSAGING_SENDER_ID,
  EXPO_PUBLIC_FIREBASE_APP_ID: FIREBASE_APP_ID,
} = Constants.expoConfig?.extra || {};

if (!FIREBASE_API_KEY || !FIREBASE_PROJECT_ID || !FIREBASE_STORAGE_BUCKET || !FIREBASE_MESSAGING_SENDER_ID || !FIREBASE_APP_ID) {
  throw new Error('Missing Firebase configuration. Check your environment variables.');
}

const firebaseConfig = {
  apiKey: FIREBASE_API_KEY,
  projectId: FIREBASE_PROJECT_ID,
  storageBucket: FIREBASE_STORAGE_BUCKET,
  messagingSenderId: FIREBASE_MESSAGING_SENDER_ID,
  appId: FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const storage = getStorage(app);
const auth = getAuth(app);

export { storage, ref, uploadBytesResumable, uploadBytes, getDownloadURL, auth, firebaseConfig };
