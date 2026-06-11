// Superseded by PortPos (ADR-018). Kept as inert stub to prevent accidental activation.
// Do not import or call — use lib/portpos.ts instead.

export const nagadClient = {
  initPayment: async (..._args: unknown[]) => {
    throw new Error("Nagad is inert — use PortPos instead");
  },
  verifyPayment: async (..._args: unknown[]) => {
    throw new Error("Nagad is inert — use PortPos instead");
  },
};
