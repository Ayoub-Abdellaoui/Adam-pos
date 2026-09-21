import { defineConfig } from "drizzle-kit";

const connectionString = process.env.EXTERNAL_DATABASE_URL;
if (!connectionString) {
  throw new Error("EXTERNAL_DATABASE_URL is required to run Drizzle commands");
}

const url = new URL(connectionString);

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\/+/, "")),
    ssl: { rejectUnauthorized: true },
  },
});
