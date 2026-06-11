// Superseded by PortPos (ADR-018). Kept as inert stub to prevent accidental activation.
// Do not import or call — use lib/portpos.ts instead.

export const bkashClient = {
  getToken: async (..._args: unknown[]) => {
    throw new Error("bkash is inert — use PortPos instead");
  },
  createPayment: async (..._args: unknown[]) => {
    throw new Error("bkash is inert — use PortPos instead");
  },
  queryPayment: async (..._args: unknown[]) => {
    throw new Error("bkash is inert — use PortPos instead");
  },
  executePayment: async (..._args: unknown[]) => {
    throw new Error("bkash is inert — use PortPos instead");
  },
};
