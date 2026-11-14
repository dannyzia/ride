import { fail } from '@sveltejs/kit';
import { site } from '#lib/site';
import type { Actions } from './$types';

/**
 * Server-side actions for the public account-deletion page.
 *
 * The browser never talks to the Ride API directly: this module posts to the
 * Expo API routes (`/api/user/delete-otp`, `/api/user/delete-confirm`) from the
 * SvelteKit server, so no CORS surface is added and the API origin stays a
 * server-only detail. Both endpoints are public and authorize purely on the
 * SMS code sent to the number registered to the account.
 */

const apiBase = site.rideApiUrl.replace(/\/+$/, '');
const apiConfigured = apiBase.length > 0;

/** Normalize 01XXXXXXXXX / 8801XXXXXXXXX / +8801XXXXXXXXX → +8801XXXXXXXXX. */
function normalizeBdPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('880')) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) return `+880${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('1')) return `+880${digits}`;
  return null;
}

async function callApi(path: string, payload: Record<string, unknown>) {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: response.ok, status: response.status, body };
}

const UNREACHABLE =
  'We could not reach Ride just now. Please try again in a moment, or email us below.';

export const actions = {
  send: async ({ request }: Parameters<NonNullable<Actions['send']>>[0]) => {
    if (!apiConfigured) {
      return fail(503, {
        step: 'request',
        error: 'The web deletion form is not available on this deployment. Please email us below.'
      });
    }

    const data = await request.formData();
    const phone = normalizeBdPhone(String(data.get('phone') ?? ''));
    if (!phone) {
      return fail(400, {
        step: 'request',
        error: 'Enter the Bangladeshi mobile number registered to your Ride account.'
      });
    }

    try {
      const result = await callApi('/api/user/delete-otp', { phone });
      if (!result.ok) {
        return fail(result.status === 429 ? 429 : 502, {
          step: 'request',
          error:
            result.status === 429
              ? 'Too many codes requested for this number. Please wait a few minutes and try again.'
              : UNREACHABLE
        });
      }
      return { step: 'confirm', sessionId: String(result.body.sessionId ?? ''), phone };
    } catch {
      return fail(502, { step: 'request', error: UNREACHABLE });
    }
  },

  confirm: async ({ request }: Parameters<NonNullable<Actions['confirm']>>[0]) => {
    const data = await request.formData();
    const sessionId = String(data.get('sessionId') ?? '');
    const phone = String(data.get('phone') ?? '');
    const otp = String(data.get('otp') ?? '').replace(/\D/g, '');

    if (!apiConfigured) {
      return fail(503, {
        step: 'request',
        error: 'The web deletion form is not available on this deployment. Please email us below.'
      });
    }
    if (!sessionId) {
      return fail(400, { step: 'request', error: 'Your verification expired. Request a new code.' });
    }
    if (!/^\d{6}$/.test(otp)) {
      return fail(400, {
        step: 'confirm',
        sessionId,
        phone,
        error: 'Enter the 6-digit code from the SMS.'
      });
    }

    try {
      const result = await callApi('/api/user/delete-confirm', { sessionId, otp });

      if (result.ok) return { step: 'done' };

      // 409 = the account exists and was verified, but the stored preconditions
      // (unpaid dues or a live booking) block deletion. The API returns the
      // amount in integer paisa; render it as BDT.
      if (result.status === 409) {
        return fail(409, {
          step: 'blocked',
          error: String(result.body.message ?? 'This account cannot be deleted yet.'),
          amount_bdt: typeof result.body.amount_bdt === 'number' ? result.body.amount_bdt : null
        });
      }

      if (result.status === 400) {
        return fail(400, {
          step: 'confirm',
          sessionId,
          phone,
          error: 'That code did not match. Check the SMS and try again, or request a new code.'
        });
      }

      if (result.status === 404) {
        return fail(404, {
          step: 'request',
          error: 'No active Ride account matches that number.'
        });
      }

      return fail(502, { step: 'confirm', sessionId, phone, error: UNREACHABLE });
    } catch {
      return fail(502, { step: 'confirm', sessionId, phone, error: UNREACHABLE });
    }
  }
} satisfies Actions;
