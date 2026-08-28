require("dotenv").config({ path: ".env.local" });
import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!);
sql`SELECT 1 as ok`.then((r: any) => {
  console.log("DB OK:", r[0]);
  return sql.end();
}).catch((e: any) => {
  console.error("DB FAIL:", e.message);
  process.exit(1);
});
