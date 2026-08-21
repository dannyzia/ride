import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { authCleanup } from './authCleanup';
import type { User as SupabaseUser } from '@supabase/supabase-js';

export interface AppUser {
  id: string;
  uid: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  imageUrl: string;
  emailAddresses: { emailAddress: string }[];
  primaryEmailAddress: { emailAddress: string } | null;
  phoneNumbers: { phoneNumber: string }[];
  publicMetadata: Record<string, any>;
  externalAccounts: { imageUrl: string }[];
  reload: () => Promise<void>;
}

function buildAppUser(supabaseUser: SupabaseUser | null): AppUser | null {
  if (!supabaseUser) return null;

  const nameParts = (supabaseUser.user_metadata?.name ?? '').split(' ');
  const firstName = nameParts[0] || null;
  const lastName = nameParts.slice(1).join(' ') || null;

  return {
    id: supabaseUser.id,
    uid: supabaseUser.id,
    firstName,
    lastName,
    fullName: supabaseUser.user_metadata?.name ?? null,
    imageUrl: supabaseUser.user_metadata?.avatar_url ?? '',
    emailAddresses: supabaseUser.email ? [{ emailAddress: supabaseUser.email }] : [],
    primaryEmailAddress: supabaseUser.email ? { emailAddress: supabaseUser.email } : null,
    phoneNumbers: supabaseUser.phone ? [{ phoneNumber: supabaseUser.phone }] : [],
    publicMetadata: {},
    externalAccounts: supabaseUser.user_metadata?.avatar_url ? [{ imageUrl: supabaseUser.user_metadata.avatar_url }] : [],
    reload: async () => {},
  };
}

export function useSession() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Eagerly read the existing session synchronously — avoids a null
    // flash while waiting for the async INITIAL_SESSION onAuthStateChange
    // event.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(buildAppUser(session?.user ?? null));
      setIsLoaded(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(buildAppUser(session?.user ?? null));
      setIsLoaded(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, isLoaded };
}

export function useSessionAuth() {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? null);
      setIsLoggedIn(!!session?.user);
      setIsLoaded(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { userId, isLoaded, isLoggedIn };
}

export function useSignOut() {
  return {
    signOut: async () => {
      // Full teardown (stores + WebSocket) before killing the session —
      // audit H-1: a bare signOut() left the authenticated socket open for
      // the next sign-in to adopt.
      authCleanup();
      await supabase.auth.signOut();
    },
  };
}

export type { SupabaseUser };
