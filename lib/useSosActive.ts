import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { API_URL } from "@/lib/config";
import { logger } from "@/lib/logger";

export interface SosActiveAlert {
  id: string;
  status: "open" | "acknowledged";
  ride_id: string | null;
  latitude: string;
  longitude: string;
  message: string | null;
  contacts_notified: string[];
  created_at: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

interface UseSosActiveResult {
  active: boolean;
  alert: SosActiveAlert | null;
  loading: boolean;
  resolving: boolean;
  resolveAlert: () => Promise<boolean>;
  refetch: () => Promise<void>;
}

const POLL_INTERVAL_MS = 10_000;

/**
 * Fetches the caller's most recent open/acknowledged SOS alert on mount,
 * then polls every 10 seconds. Exposes a resolveAlert function that calls
 * POST /api/sos/resolve and refreshes the state.
 */
export function useSosActive(): UseSosActiveResult {
  const [active, setActive] = useState(false);
  const [alert, setAlert] = useState<SosActiveAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const mountedRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActive = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;

      const res = await fetch(`${API_URL}/api/sos/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const data = await res.json();
      if (!mountedRef.current) return;

      setActive(data.active === true);
      setAlert(data.alert ?? null);
    } catch (err) {
      logger.warn("[useSosActive] fetch failed", err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  // Initial fetch + poll
  useEffect(() => {
    mountedRef.current = true;
    fetchActive();

    pollRef.current = setInterval(fetchActive, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchActive]);

  const resolveAlert = useCallback(async (): Promise<boolean> => {
    if (!alert?.id || resolving) return false;
    setResolving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return false;

      const res = await fetch(`${API_URL}/api/sos/resolve`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ alert_id: alert.id }),
      });

      if (res.ok) {
        await fetchActive();
        return true;
      }
      return false;
    } catch (err) {
      logger.error("[useSosActive] resolve failed", err);
      return false;
    } finally {
      if (mountedRef.current) setResolving(false);
    }
  }, [alert?.id, resolving, fetchActive]);

  return { active, alert, loading, resolving, resolveAlert, refetch: fetchActive };
}
