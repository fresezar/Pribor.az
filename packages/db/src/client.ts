import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Tekil bağlantı havuzu. Kullanım:
 *   import { db } from "@pribor/db";
 *   const rows = await db.query.listings.findMany({ with: { reAttrs: true } });
 */
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgres://pribor:pribor_dev@localhost:5432/pribor",
  max: 10,
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { pool };
