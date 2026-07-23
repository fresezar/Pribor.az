import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

// Kök .env'i oku (pnpm --filter ile packages/db içinden çalışır)
config({ path: "../../.env" });
config(); // varsa lokal .env de üstüne binsin

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://pribor:pribor_dev@localhost:5432/pribor",
  },
  // PostGIS'in kendi sistem tablolarını (spatial_ref_sys vb.) migration diff'inden hariç tut
  extensionsFilters: ["postgis"],
  verbose: true,
  strict: true,
});
