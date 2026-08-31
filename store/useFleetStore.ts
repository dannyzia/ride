import { create } from "zustand";

/**
 * Client-side "Current Mode" switch — Phase 2 foundation for role-switching.
 *
 * A single account can hold MULTIPLE capabilities (rider/driver from
 * users.role, plus fleet staff roles from fleet_members). This store decides
 * which surface the UI shows. Switching happens ENTIRELY in local state —
 * it NEVER calls a logout, NEVER re-authenticates, and NEVER mutates the
 * immutable users.role on the server ("Switch to Fleet view" must never hit
 * the role-setting endpoint).
 */
export type ActiveMode = "RIDER" | "DRIVER" | "FLEET";

export const INITIAL_ACTIVE_MODE: ActiveMode = "RIDER";

/** A fleet the current user is an active member of (server-read). */
export interface FleetCapability {
  fleet_id: string;
  role: string;
  name: string;
  status: string;
}

interface FleetStoreState {
  /** Which surface is active right now. Persisted locally only. */
  activeMode: ActiveMode;
  /** Fleet currently in view when activeMode === 'FLEET'. */
  activeFleetId: string | null;
  /** The caller's role within activeFleetId (for UI gating). */
  activeFleetRole: string | null;
  /** Fleets the user belongs to — used to pick a fleet when entering FLEET. */
  myFleets: FleetCapability[];
  /** Plain local switch (e.g. RIDER → DRIVER → FLEET). No server side-effects. */
  setActiveMode: (mode: ActiveMode) => void;
  /** Enter a specific fleet (mode becomes FLEET) and record the caller's role. */
  enterFleet: (fleetId: string, role: string) => void;
  /** Refresh the list of fleets the user can switch into. */
  setMyFleets: (fleets: FleetCapability[]) => void;
  /** Leave the fleet view (back to a base mode) without clearing capability list. */
  exitFleet: (fallback: ActiveMode) => void;
  reset: () => void;
}

const initial = {
  activeMode: INITIAL_ACTIVE_MODE,
  activeFleetId: null,
  activeFleetRole: null,
  myFleets: [] as FleetCapability[],
};

export const useFleetStore = create<FleetStoreState>((set) => ({
  ...initial,
  setActiveMode: (mode) => set({ activeMode: mode }),
  enterFleet: (fleetId, role) =>
    set({ activeMode: "FLEET", activeFleetId: fleetId, activeFleetRole: role }),
  setMyFleets: (myFleets) => set({ myFleets }),
  exitFleet: (fallback) =>
    set({ activeMode: fallback, activeFleetId: null, activeFleetRole: null }),
  reset: () => set(initial),
}));