import { auth } from './firebase';
import Constants from 'expo-constants';

const APP_CHECK_DEBUG = Constants.expoConfig?.extra?.EXPO_PUBLIC_APP_CHECK_DEBUG_TOKEN;

export async function getAppCheckToken(): Promise<string> {
  if (APP_CHECK_DEBUG) return APP_CHECK_DEBUG as string;

  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('No Firebase session');
  return idToken;
}
