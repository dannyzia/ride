/**
 * tests/api/admin/maps-engine.test.ts
 *
 * Verifies the Maps & Location Engine admin API:
 * 1. GET returns dpMaps configuration and health probe matrix
 * 2. PATCH updates platform_config and writes config_audit_log
 * 3. POST rollback atomically reverts routing to shadow and search to vendor_only
 * 4. Validation rejects unknown keys and invalid modes
 * 5. RBAC enforcement
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockPermissionCheck = jest.fn<any>();
jest.mock('@/lib/adminRbac', () => ({
  requireAdminPermission: jest.fn(() => mockPermissionCheck),
  isOwner: (u: { role: string }) => u.role === 'owner',
}));

const mockSelect = jest.fn<any>();
const mockInsert = jest.fn<any>();
const mockUpdate = jest.fn<any>();

jest.mock('@/src/db', () => ({
  db: {
    select: () => mockSelect(),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import { GET, PATCH, POST, DEFAULT_MAPS_CONFIG } from '@/app/api/admin/maps-engine+api';

describe('Admin Maps Engine API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPermissionCheck.mockResolvedValue({
      supabaseUser: { id: 'admin-1111' },
      dbUser: { id: 'admin-1111', role: 'admin' },
    });
  });

  describe('GET /api/admin/maps-engine', () => {
    it('returns default config when no DB rows exist', async () => {
      mockSelect.mockReturnValue({
        from: jest.fn<any>().mockReturnValue({
          where: jest.fn<any>().mockResolvedValue([]),
        }),
      });

      const res = await GET(new Request('http://localhost/api/admin/maps-engine'));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.config.routing_provider_mode).toBe(DEFAULT_MAPS_CONFIG.routing_provider_mode);
      expect(body.config.search_provider_mode).toBe(DEFAULT_MAPS_CONFIG.search_provider_mode);
      expect(body.services_health).toHaveProperty('osrm_car');
      expect(body.services_health).toHaveProperty('barikoi');
    });

    it('merges DB platform_config rows with defaults', async () => {
      mockSelect.mockReturnValue({
        from: jest.fn<any>().mockReturnValue({
          where: jest.fn<any>().mockResolvedValue([
            { key: 'routing_provider_mode', value: 'primary' },
            { key: 'search_provider_mode', value: 'dpmaps_primary' },
            { key: 'dpmaps_osrm_timeout_ms', value: '250' },
          ]),
        }),
      });

      const res = await GET(new Request('http://localhost/api/admin/maps-engine'));
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.config.routing_provider_mode).toBe('primary');
      expect(body.config.search_provider_mode).toBe('dpmaps_primary');
      expect(body.config.dpmaps_osrm_timeout_ms).toBe('250');
      // Unmodified keys retain default
      expect(body.config.dpmaps_barikoi_timeout_ms).toBe('400');
    });

    it('returns 401 when unauthenticated', async () => {
      mockPermissionCheck.mockRejectedValue({ status: 401 });
      const res = await GET(new Request('http://localhost/api/admin/maps-engine'));
      expect(res.status).toBe(401);
    });

    it('returns 403 when permission denied', async () => {
      mockPermissionCheck.mockRejectedValue({ status: 403 });
      const res = await GET(new Request('http://localhost/api/admin/maps-engine'));
      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /api/admin/maps-engine', () => {
    it('rejects unknown configuration keys', async () => {
      const req = new Request('http://localhost/api/admin/maps-engine', {
        method: 'PATCH',
        body: JSON.stringify({
          updates: [{ key: 'non_existent_key', value: 'foo' }],
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toContain('Unknown config key');
    });

    it('rejects invalid routing_provider_mode', async () => {
      const req = new Request('http://localhost/api/admin/maps-engine', {
        method: 'PATCH',
        body: JSON.stringify({
          updates: [{ key: 'routing_provider_mode', value: 'invalid_mode' }],
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.message).toContain('Invalid routing_provider_mode');
    });

    it('updates config and writes audit log', async () => {
      // Mock existing row lookup
      mockSelect.mockReturnValue({
        from: jest.fn<any>().mockReturnValue({
          where: jest.fn<any>().mockReturnValue({
            limit: jest.fn<any>().mockResolvedValue([{ key: 'routing_provider_mode', value: 'shadow' }]),
          }),
        }),
      });

      const updateSetMock = jest.fn<any>().mockReturnValue({
        where: jest.fn<any>().mockResolvedValue({}),
      });
      mockUpdate.mockReturnValue({ set: updateSetMock });

      const insertValuesMock = jest.fn<any>().mockResolvedValue({});
      mockInsert.mockReturnValue({ values: insertValuesMock });

      const req = new Request('http://localhost/api/admin/maps-engine', {
        method: 'PATCH',
        body: JSON.stringify({
          updates: [
            { key: 'routing_provider_mode', value: 'primary' },
            { key: 'dpmaps_osrm_timeout_ms', value: '350' },
          ],
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.updated_keys).toEqual(['routing_provider_mode', 'dpmaps_osrm_timeout_ms']);

      // Verified audit log insertion
      expect(insertValuesMock).toHaveBeenCalled();
    });

    it('normalizes numeric routing mode string to canonical names', async () => {
      mockSelect.mockReturnValue({
        from: jest.fn<any>().mockReturnValue({
          where: jest.fn<any>().mockReturnValue({
            limit: jest.fn<any>().mockResolvedValue([]),
          }),
        }),
      });

      const insertValuesMock = jest.fn<any>().mockResolvedValue({});
      mockInsert.mockReturnValue({ values: insertValuesMock });

      const req = new Request('http://localhost/api/admin/maps-engine', {
        method: 'PATCH',
        body: JSON.stringify({
          updates: [{ key: 'routing_provider_mode', value: '2' }],
        }),
      });

      const res = await PATCH(req);
      expect(res.status).toBe(200);

      // Value was normalized to 'primary'
      expect(insertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'routing_provider_mode',
          value: 'primary',
        }),
      );
    });
  });

  describe('POST /api/admin/maps-engine (Emergency Rollback)', () => {
    it('rejects invalid action names', async () => {
      const req = new Request('http://localhost/api/admin/maps-engine', {
        method: 'POST',
        body: JSON.stringify({ action: 'do_nothing' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('executes rollback and reverts modes to shadow and vendor_only', async () => {
      mockSelect.mockReturnValue({
        from: jest.fn<any>().mockReturnValue({
          where: jest.fn<any>().mockReturnValue({
            limit: jest.fn<any>().mockResolvedValue([{ key: 'routing_provider_mode', value: 'primary' }]),
          }),
        }),
      });

      const updateSetMock = jest.fn<any>().mockReturnValue({
        where: jest.fn<any>().mockResolvedValue({}),
      });
      mockUpdate.mockReturnValue({ set: updateSetMock });

      const insertValuesMock = jest.fn<any>().mockResolvedValue({});
      mockInsert.mockReturnValue({ values: insertValuesMock });

      const req = new Request('http://localhost/api/admin/maps-engine', {
        method: 'POST',
        body: JSON.stringify({ action: 'rollback', target_mode: 'shadow' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.routing_provider_mode).toBe('shadow');
      expect(body.search_provider_mode).toBe('vendor_only');
      expect(body.message).toContain('Emergency rollback executed');
    });
  });
});

