import { defineConfig } from 'drizzle-kit';

import dotenv from "dotenv";

dotenv.config({ path: './.env.local' });

// The app runtime connects through the transaction-mode pooler (port 6543) for
// high concurrency. drizzle-kit migrations need the session-mode pooler (port
// 5432) instead: transaction mode doesn't preserve session state, which some
// DDL/introspection operations rely on. Derive the session URL from DATABASE_URL
// by switching the pooler port back to 5432 (no-op if DATABASE_URL isn't on 6543).
const appUrl = process.env.DATABASE_URL ?? '';
const migrationUrl = appUrl.includes('pooler.supabase.com:6543')
  ? appUrl.replace('pooler.supabase.com:6543', 'pooler.supabase.com:5432')
  : appUrl;

export default defineConfig({
    out: './src/db/migrations',
    schema: './src/db/schema.ts',
    dialect: 'postgresql',
    dbCredentials: {
        url: migrationUrl,
    },
});
