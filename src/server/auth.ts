import type { Context, MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify, decodeJwt, type JWTPayload } from "jose";
import { query } from "./db";

export interface KeycloakUser {
  id: string;
  username: string;
  email?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  roles: string[];
  realmRoles: string[];
  clientRoles: string[];
  emailVerified?: boolean;
}

export interface KeycloakConfig {
  enabled: boolean;
  url: string;
  realm: string;
  clientId: string;
  authRequired: boolean;
}

export type ServerEnv = {
  Bindings: {
    DB: D1Database;
    KEYCLOAK_URL?: string;
    KEYCLOAK_REALM?: string;
    KEYCLOAK_CLIENT_ID?: string;
    KEYCLOAK_ENABLED?: string;
    KEYCLOAK_REQUIRED?: string;
  };
  Variables: {
    user?: KeycloakUser | null;
    keycloakConfig?: KeycloakConfig;
  };
};

const DEFAULT_CONFIG: KeycloakConfig = {
  enabled: false,
  url: "http://localhost:8080",
  realm: "openproperty",
  clientId: "openproperty-client",
  authRequired: false,
};

// Cache for remote JWKS sets keyed by jwksUri to reuse across requests
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(jwksUri: string) {
  let jwks = jwksCache.get(jwksUri);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUri));
    jwksCache.set(jwksUri, jwks);
  }
  return jwks;
}

/**
 * Clean base URL by removing trailing slashes
 */
function cleanUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Retrieve the active Keycloak configuration by combining database settings,
 * environment variables, and fallback defaults.
 */
export async function getKeycloakConfig(c: Context<ServerEnv>): Promise<KeycloakConfig> {
  let dbSettings: Record<string, string> = {};
  try {
    const rows = await query<{ key: string; value: string }>(
      "SELECT key, value FROM settings WHERE key LIKE 'keycloak_%'",
    );
    for (const r of rows) {
      dbSettings[r.key] = r.value;
    }
  } catch {
    // Database might not be initialized yet
  }

  // Priority: DB settings -> Environment Bindings -> Process Env -> Defaults
  const env = (c.env || {}) as unknown as Record<string, string | undefined>;
  const proc = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process;
  const procEnv = proc?.env || {};

  const getVal = (dbKey: string, envKey: string, fallback: string): string => {
    if (dbSettings[dbKey] !== undefined && dbSettings[dbKey] !== "") {
      return dbSettings[dbKey];
    }
    const envVal = env[envKey] ?? procEnv[envKey];
    if (envVal !== undefined && envVal !== "") {
      return envVal;
    }
    return fallback;
  };

  const getBool = (dbKey: string, envKey: string, fallback: boolean): boolean => {
    if (dbSettings[dbKey] !== undefined && dbSettings[dbKey] !== "") {
      return dbSettings[dbKey] === "true" || dbSettings[dbKey] === "1";
    }
    const envVal = env[envKey] ?? procEnv[envKey];
    if (envVal !== undefined && envVal !== "") {
      return envVal === "true" || envVal === "1";
    }
    return fallback;
  };

  const enabled = getBool("keycloak_enabled", "KEYCLOAK_ENABLED", DEFAULT_CONFIG.enabled);
  const rawUrl = getVal("keycloak_url", "KEYCLOAK_URL", DEFAULT_CONFIG.url);
  const realm = getVal("keycloak_realm", "KEYCLOAK_REALM", DEFAULT_CONFIG.realm);
  const clientId = getVal("keycloak_client_id", "KEYCLOAK_CLIENT_ID", DEFAULT_CONFIG.clientId);
  const authRequired = getBool("keycloak_required", "KEYCLOAK_REQUIRED", DEFAULT_CONFIG.authRequired);
  return {
    enabled,
    url: cleanUrl(rawUrl),
    realm,
    clientId,
    authRequired,
  };
}

interface KeycloakTokenPayload extends JWTPayload {
  preferred_username?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email_verified?: boolean;
  realm_access?: {
    roles?: string[];
  };
  resource_access?: Record<string, { roles?: string[] }>;
}

/**
 * Verify a Keycloak JWT Bearer token using Keycloak's remote JWKS endpoint.
 */
export async function verifyKeycloakToken(
  token: string,
  config: KeycloakConfig,
): Promise<KeycloakUser> {
  const issuer = `${config.url}/realms/${config.realm}`;
  const jwksUri = `${issuer}/protocol/openid-connect/certs`;

  const JWKS = getJWKS(jwksUri);

  const { payload } = await jwtVerify<KeycloakTokenPayload>(token, JWKS, {
    issuer,
    clockTolerance: 30, // 30 seconds clock skew tolerance
  });

  const realmRoles = payload.realm_access?.roles || [];
  const clientRoles = payload.resource_access?.[config.clientId]?.roles || [];
  const roles = Array.from(new Set([...realmRoles, ...clientRoles]));

  return {
    id: payload.sub || "",
    username: payload.preferred_username || payload.sub || "user",
    email: payload.email,
    name: payload.name,
    givenName: payload.given_name,
    familyName: payload.family_name,
    roles,
    realmRoles,
    clientRoles,
    emailVerified: payload.email_verified,
  };
}

/**
 * Authentication middleware for Hono routes.
 *
 * Automatically verifies Bearer token when Keycloak is enabled.
 * If authRequired is true, blocks unauthenticated requests with 401.
 */
export const authMiddleware: MiddlewareHandler<ServerEnv> = async (c, next) => {
  const config = await getKeycloakConfig(c);
  c.set("keycloakConfig", config);

  // If Keycloak is completely disabled, pass through
  if (!config.enabled) {
    c.set("user", null);
    return next();
  }

  // Paths that are always public
  const path = c.req.path;
  const isPublicAuthRoute =
    path === "/api/auth/config" ||
    path === "/api/health" ||
    path === "/api/auth/test-connection";

  const authHeader = c.req.header("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;

  if (bearerToken) {
    try {
      const user = await verifyKeycloakToken(bearerToken, config);
      c.set("user", user);
      return next();
    } catch (err) {
      console.warn("Keycloak token verification failed:", (err as Error).message);
      if (config.authRequired && !isPublicAuthRoute) {
        return c.json(
          {
            error: "Invalid or expired token",
            code: "INVALID_TOKEN",
            message: (err as Error).message,
          },
          401,
        );
      }
      c.set("user", null);
      return next();
    }
  }

  // No token provided
  if (config.authRequired && !isPublicAuthRoute) {
    return c.json(
      {
        error: "Authentication required",
        code: "UNAUTHORIZED",
      },
      401,
    );
  }

  c.set("user", null);
  return next();
};

/**
 * Middleware to enforce authenticated user for specific routes.
 */
export const requireAuth: MiddlewareHandler<ServerEnv> = async (c, next) => {
  const user = c.get("user");
  const config = c.get("keycloakConfig");

  if (config?.enabled && !user) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }
  return next();
};

/**
 * Middleware to require a specific Keycloak role.
 */
export const requireRole = (role: string): MiddlewareHandler<ServerEnv> => {
  return async (c, next) => {
    const user = c.get("user");
    const config = c.get("keycloakConfig");

    if (config?.enabled) {
      if (!user) {
        return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
      }
      if (!user.roles.includes(role)) {
        return c.json(
          {
            error: `Forbidden: role '${role}' required`,
            code: "FORBIDDEN",
          },
          403,
        );
      }
    }
    return next();
  };
};
