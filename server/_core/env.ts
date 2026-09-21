export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.EXTERNAL_DATABASE_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  ocrSpaceApiKey: process.env.OCR_SPACE_API_KEY ?? "",
};

/** Fails closed before production starts without its required server settings. */
export function validateProductionEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return;

  const required = ["JWT_SECRET", "EXTERNAL_DATABASE_URL"];
  const missing = required.filter(name => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }

  if (env.JWT_SECRET!.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters in production");
  }

  try {
    const databaseUrl = new URL(env.EXTERNAL_DATABASE_URL!);
    if (!databaseUrl.hostname || !databaseUrl.username || !databaseUrl.pathname || databaseUrl.pathname === "/") {
      throw new Error("invalid database URL");
    }
  } catch {
    throw new Error("EXTERNAL_DATABASE_URL must be a valid database connection URL");
  }
}
