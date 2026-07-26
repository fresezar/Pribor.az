import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Tekil bağlantı havuzu. Kullanım:
 *   import { db } from "@pribor/db";
 *   const rows = await db.query.listings.findMany({ with: { reAttrs: true } });
 */
const connectionString =
  process.env.DATABASE_URL ?? "postgres://pribor:pribor_dev@localhost:5432/pribor";

/**
 * Yönetilen Postgres (Neon/Supabase/Render…) SSL ister. Bağlantı string'inde
 * sslmode=require varsa ya da bilinen bir bulut host'uysa SSL açılır — bağlantı
 * şifrelidir; cert zinciri doğrulaması sağlayıcılar arası uyum için kapalı.
 * Lokal pgdev'de SSL kapalı kalır.
 */
const needsSSL =
  /sslmode=require|sslmode=verify|\.neon\.tech|\.supabase\.|\.render\.com|\.amazonaws\.com/.test(
    connectionString,
  );

const pool = new Pool({
  connectionString,
  max: 10,
  ssl: needsSSL ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { pool };
