/**
 * One error contract for admin API routes.
 *
 * Before this helper, 19 of the 94 admin routes mapped only 401 and let a 403
 * from `requireAdminPermission` fall through to the generic 500 branch. The
 * caller then saw "internal server error" for a permission denial, and real
 * server faults were indistinguishable from RBAC denials in monitoring.
 *
 * Usage:
 *   } catch (err: unknown) {
 *     return adminErrorResponse(err, '[admin/tickets] GET error');
 *   }
 */
import { getErrorStatus } from './errors';
import { logger } from './logger';

const CLIENT_ERRORS: Record<number, { error: string; message: string }> = {
  400: { error: 'bad_request', message: 'Invalid request' },
  401: { error: 'unauthorized', message: 'Authentication required' },
  403: { error: 'forbidden', message: 'Access denied' },
};

export function adminErrorResponse(err: unknown, label: string): Response {
  const status = getErrorStatus(err);
  const clientError = status === undefined ? undefined : CLIENT_ERRORS[status];
  if (clientError && status !== undefined) {
    return Response.json(clientError, { status });
  }
  logger.error(label, err);
  return Response.json(
    { error: 'internal_error', message: 'An internal server error occurred' },
    { status: 500 },
  );
}
