import { useState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser, signOut as firebaseSignOut } from 'firebase/auth';
import { auth } from './firebase';

// Clerk-compatible user type wrapping Firebase User
// Bridges the gap between Clerk's API (used by existing GlideX screens)
// and Firebase Auth (used by Ride app) until Phase 4 full migration.
export interface ClerkCompatUser {
  id: string;
  uid: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string;
  emailAddresses: Array<{ emailAddress: string }>;
  primaryEmailAddress: { emailAddress: string } | null;
  phoneNumbers: Array<{ phoneNumber: string }>;
  publicMetadata: Record<string, any>;
  externalAccounts: Array<{ imageUrl: string }>;
  reload: () => Promise<void>;
}

function buildCompatUser(fbUser: FirebaseUser | null): ClerkCompatUser | null {
  if (!fbUser) return null;

  const nameParts = (fbUser.displayName ?? '').split(' ');
  const firstName = nameParts[0] || null;
  const lastName = nameParts.slice(1).join(' ') || null;

  return {
    id: fbUser.uid,
    uid: fbUser.uid,
    firstName,
    lastName,
    fullName: fbUser.displayName,
    imageUrl: fbUser.photoURL ?? '',
    emailAddresses: fbUser.email ? [{ emailAddress: fbUser.email }] : [],
    primaryEmailAddress: fbUser.email ? { emailAddress: fbUser.email } : null,
    phoneNumbers: fbUser.phoneNumber ? [{ phoneNumber: fbUser.phoneNumber }] : [],
    publicMetadata: {},
    externalAccounts: fbUser.photoURL ? [{ imageUrl: fbUser.photoURL }] : [],
    reload: () => fbUser.reload(),
  };
}

export function useUser() {
  const [user, setUser] = useState<ClerkCompatUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(buildCompatUser(u));
      setIsLoaded(true);
    });
  }, []);

  return { user, isLoaded };
}

export function useAuth() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUserId(u?.uid ?? null);
      setIsSignedIn(!!u);
      setIsLoaded(true);
    });
  }, []);

  return { userId, isLoaded, isSignedIn };
}

export function useClerk() {
  return {
    signOut: async () => { await firebaseSignOut(auth); },
  };
}

export type { FirebaseUser };
