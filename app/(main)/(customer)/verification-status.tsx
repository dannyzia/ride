/**
 * F-03 — My verification status (applicant side; admin side = F-30).
 * docs/FeatureList/USER-FLOWS.md v2 §F-03 is the UI contract.
 *
 * Per pending/rejected gated role (shop / fleet / delivery-man):
 *   submitted (timestamp) → docs received → under review (expected within 24h)
 *   → decision:
 *     approve  → Active — the role appears in the Login-as chooser
 *     reject   → STRUCTURED: failed field + example of an acceptable document
 *                + one-tap "Fix & resubmit" prefilled path (max 3, then
 *                admin unblock — the button disables at the cap).
 *
 * The admin-only internal note never reaches this screen: GET /api/user/roles
 * strips it server-side (lib/launchRoles.ts applicantReject).
 *
 * Copy is plain English, matching the register wizards it sits beside.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors } from '@/theme/goRide';
import CustomButton from '@/components/CustomButton';
import { API_URL } from '@/lib/config';
import { logger } from '@/lib/logger';
import { useIsDark } from '@/lib/useAppearance';

interface StatusRole {
  role: 'shop_owner' | 'fleet_owner' | 'delivery_man';
  status: 'active' | 'pending' | 'suspended';
  reason: string | null;
  submitted_at: string | null;
  resubmit_count: number;
  reject: { code: string | null; field: string | null; example: string | null } | null;
}

const ROLE_LABEL: Record<StatusRole['role'], string> = {
  shop_owner: 'Shop Owner',
  fleet_owner: 'Fleet Owner',
  delivery_man: 'Delivery Man',
};
const RESUBMIT_ROUTE: Record<StatusRole['role'], string> = {
  shop_owner: '/(auth)/register-shop-owner',
  fleet_owner: '/(auth)/register-fleet-owner',
  delivery_man: '/(auth)/register-delivery-man',
};
const MAX_RESUBMITS = 3; // F-03: max 3, then admin unblock

export default function VerificationStatusScreen() {
  const router = useRouter();
  const isDark = useIsDark();
  const bg = isDark ? colors.bgDark : colors.bgLight;
  const textPrimary = isDark ? colors.textPrimaryDark : colors.textPrimaryLight;
  const textSecondary = isDark ? colors.textSecondaryDark : colors.textSecondaryLight;
  const surfaceBg = isDark ? colors.surfaceElevatedDark : colors.surfaceLight;
  const borderColor = isDark ? colors.borderDark : colors.borderLight;
  const [roles, setRoles] = useState<StatusRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyRole, setBusyRole] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`${API_URL}/api/user/roles`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to load');
      setRoles(
        ((data.roles ?? []) as Array<StatusRole & { role: string }>).filter((r) =>
          ['shop_owner', 'fleet_owner', 'delivery_man'].includes(r.role),
        ),
      );
    } catch (e) {
      setError('Could not load your verification status. Please try again.');
      logger.error('[verification-status] load failed', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resubmit = async (kind: StatusRole['role']) => {
    setBusyRole(kind);
    setError('');
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      const res = await fetch(`${API_URL}/api/user/roles/resubmit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
        body: JSON.stringify({ kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Resubmit failed');
      // One-tap path continues into the wizard, prefilled with prior answers
      // (the wizard seeds its fields from GET /api/user/roles on this param).
      router.push(`${RESUBMIT_ROUTE[kind]}?resubmit=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Resubmit failed');
      logger.error('[verification-status] resubmit failed', e);
    } finally {
      setBusyRole(null);
    }
  };

  const submitted = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString('en-BD', { timeZone: 'Asia/Dhaka' }) : '—';

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Text className="text-[22px] font-JakartaBold font-bold" style={{ color: textPrimary }}>
          Verification status
        </Text>

        {loading ? (
          <Text style={{ color: textSecondary }}>Loading…</Text>
        ) : roles.length === 0 ? (
          <Text style={{ color: textSecondary }}>No gated roles yet.</Text>
        ) : (
          roles.map((r) => (
            <View
              key={r.role}
              className="rounded-xl border p-4"
              style={{ backgroundColor: surfaceBg, borderColor, gap: 6 }}
            >
              <Text className="text-[16px] font-JakartaBold font-bold" style={{ color: textPrimary }}>
                {ROLE_LABEL[r.role]}
              </Text>
              <Text style={{ color: textSecondary }}>Submitted: {submitted(r.submitted_at)}</Text>
              <Text style={{ color: textSecondary }}>Documents received ✓</Text>

              {r.status === 'active' ? (
                <Text className="font-JakartaBold" style={{ color: colors.primary }}>
                  Active — this role now appears in your Login-as choices.
                </Text>
              ) : r.status === 'pending' ? (
                <Text style={{ color: textSecondary }}>
                  Under review — expected within 24 hours. You will be notified.
                </Text>
              ) : (
                <View style={{ gap: 4 }}>
                  <Text className="font-JakartaBold" style={{ color: colors.danger }}>
                    Needs fixes{r.reason ? ` — ${r.reason}` : ''}
                  </Text>
                  {r.reject?.field ? (
                    <Text style={{ color: textSecondary }}>Failed field: {r.reject.field}</Text>
                  ) : null}
                  {r.reject?.example ? (
                    <Text style={{ color: textSecondary }}>Example of an acceptable document: {r.reject.example}</Text>
                  ) : null}

                  {r.resubmit_count >= MAX_RESUBMITS ? (
                    <Text style={{ color: colors.danger }}>
                      Resubmit limit reached ({r.resubmit_count}/{MAX_RESUBMITS}) — please contact support.
                    </Text>
                  ) : (
                    <CustomButton
                      title={busyRole === r.role ? 'Resubmitting…' : `Fix & resubmit (${r.resubmit_count}/${MAX_RESUBMITS})`}
                      onPress={() => resubmit(r.role)}
                      disabled={busyRole !== null}
                     testID="customer.verification-status.resubmit"/>
                  )}
                </View>
              )}
            </View>
          ))
        )}

        {error ? (
          <Text className="text-[14px] font-JakartaBold" style={{ color: colors.danger }}>
            {error}
          </Text>
        ) : null}

        <TouchableOpacity onPress={() => router.back()} className="items-center py-3" testID="customer.verification-status.el-1">
          <Text className="text-[14px] font-JakartaBold" style={{ color: colors.primary }}>
            Back
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
