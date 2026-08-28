import fs from "fs";
import path from "path";

// Load DATABASE_URL from .env.local if not already in the environment.
// Imported FIRST by import-vehicle-models.ts so process.env.DATABASE_URL
// is set BEFORE ../src/db/index.ts reads it (ESM hoists imports, so the
// main module's body code would run too late).
if (!process.env.DATABASE_URL) {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^DATABASE_URL=(.*)$/);
      if (match) {
        process.env.DATABASE_URL = match[1].trim();
        break;
      }
    }
  }
}
