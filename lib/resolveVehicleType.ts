/**
 * Server-only vehicle type resolution.
 *
 * Extracted from app/api/driver/vehicles+api.ts for testability.
 * This file imports lib/premiumAllowlist (DB-dependent) and is NOT safe
 * for React Native bundles or utils-server.
 *
 * Priority:
 * 1. New client fields (engine_cc/body_type, no vehicle_type) → classify server-side.
 * 2. Legacy vehicle_type field → use directly.
 * 3. Model default_vehicle_type → fallback.
 * 4. Nothing resolvable → throw.
 */
import { classifyVehicle, type VehicleTypeEnum, type BodyTypeEnum } from '@/lib/vehicleTypes';
import { isPremiumAllowlisted } from '@/lib/premiumAllowlist';
import { logger } from '@/lib/logger';

/** Model row shape needed by the resolver. */
export interface DbModelRow {
  default_vehicle_type: string | null;
  typical_cc_min: number | null;
  body_type: string | null;
  passenger_seats: number | null;
}

/** Registration payload shape needed by the resolver. */
export interface VehicleRegistrationData {
  brand: string;
  model: string;
  vehicle_type?: string | null;
  number_of_seats?: number;
  engine_cc?: number | null;
  body_type?: string | null;
}

/** Classification result shape matching §12.3 contract. */
export type ClassificationResult =
  | { outcome: 'classified'; suggested_vehicle_type: VehicleTypeEnum }
  | { outcome: 'manual_review' };

export class ManualReviewRequiredError extends Error {
  constructor() {
    super('Vehicle details need review — please contact support');
    this.name = 'ManualReviewRequiredError';
  }
}

export class EligibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EligibilityError';
  }
}

/**
 * Dependency-injected premium allowlist checker.
 * Default: real DB lookup via isPremiumAllowlisted.
 * Override in tests with a stub.
 */
type PremiumCheckFn = (brand: string, model: string) => Promise<boolean>;

export async function resolveVehicleType(
  data: VehicleRegistrationData,
  dbModel: DbModelRow | undefined,
  premiumCheck: PremiumCheckFn = isPremiumAllowlisted,
): Promise<{ vehicle_type: VehicleTypeEnum; classification: ClassificationResult | null }> {
  const hasNewFields = data.engine_cc != null || data.body_type != null;

  // Path 1: New client — classify server-side
  if (hasNewFields && !data.vehicle_type) {
    // H2: Merge vehicle-model metadata OVER driver claims when client omitted values.
    const resolvedCc = data.engine_cc ?? dbModel?.typical_cc_min ?? undefined;
    const resolvedBodyType = (data.body_type ?? dbModel?.body_type ?? undefined) as BodyTypeEnum | undefined;
    const resolvedSeats = data.number_of_seats ?? dbModel?.passenger_seats ?? undefined;

    const premiumMatch = await premiumCheck(data.brand, data.model);

    const result = classifyVehicle({
      body_type: resolvedBodyType,
      engine_cc: resolvedCc,
      registered_seats: resolvedSeats,
      premium_match: premiumMatch,
    });

    if (result.vehicle_type) {
      logger.info('[resolveVehicleType] server classified', {
        brand: data.brand,
        model: data.model,
        vehicle_type: result.vehicle_type,
        rule: result.rule,
      });
      return {
        vehicle_type: result.vehicle_type,
        classification: { outcome: 'classified', suggested_vehicle_type: result.vehicle_type },
      };
    }

    // C1: Manual review — classification returned null. Use model default IF
    // one exists (that is a proposed type allowed by Phase 2-F). If NO model
    // default exists, REJECT — do NOT invent a type.
    logger.info('[resolveVehicleType] manual review needed', {
      brand: data.brand,
      model: data.model,
      rule: result.rule,
    });

    if (dbModel?.default_vehicle_type) {
      return {
        vehicle_type: dbModel.default_vehicle_type as VehicleTypeEnum,
        classification: { outcome: 'manual_review' },
      };
    }

    throw new ManualReviewRequiredError();
  }

  // Path 2: Legacy client — use provided vehicle_type (no classification for old clients)
  if (data.vehicle_type) {
    return { vehicle_type: data.vehicle_type as VehicleTypeEnum, classification: null };
  }

  // Path 3: No vehicle_type and classifier couldn't resolve → use model default
  if (dbModel?.default_vehicle_type) {
    return { vehicle_type: dbModel.default_vehicle_type as VehicleTypeEnum, classification: null };
  }

  // No classification possible at all
  throw new EligibilityError('vehicle_type is required — please update your app');
}
