/**
 * tx.ts — shared transaction-handle type for scheduler Phase 1 (ADR).
 * PgTx is the drizzle transaction callback's first parameter — pass it into
 * the marketplace scan functions so their queries run on the budgeted
 * transaction (SET LOCAL statement_timeout applies to the connection doing
 * the work).
 */
import { db } from "../src/db";

export type PgTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Either the global drizzle client or an open transaction handle. */
export type DbClient = typeof db | PgTx;
