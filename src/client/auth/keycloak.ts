import Keycloak from "keycloak-js";
import type { KeycloakConfig, AuthUser } from "./types";

let keycloakInstance: Keycloak | null = null;
let currentConfig: KeycloakConfig | null = null;

export function getKeycloakInstance(): Keycloak | null {
  return keycloakInstance;
}

export function createKeycloakInstance(config: KeycloakConfig): Keycloak {
  if (
    keycloakInstance &&
    currentConfig &&
    currentConfig.url === config.url &&
    currentConfig.realm === config.realm &&
    currentConfig.clientId === config.clientId
  ) {
    return keycloakInstance;
  }

  currentConfig = config;
  keycloakInstance = new Keycloak({
    url: config.url,
    realm: config.realm,
    clientId: config.clientId,
  });

  return keycloakInstance;
}

export function extractUserFromKeycloak(kc: Keycloak): AuthUser | null {
  if (!kc.authenticated || !kc.token) return null;

  const parsed = kc.tokenParsed as Record<string, unknown> | undefined;
  if (!parsed) return null;

  const realmAccess = parsed.realm_access as { roles?: string[] } | undefined;
  const realmRoles = realmAccess?.roles || [];

  const resourceAccess = parsed.resource_access as
    | Record<string, { roles?: string[] }>
    | undefined;
  const clientRoles = (currentConfig?.clientId && resourceAccess?.[currentConfig.clientId]?.roles) || [];

  const roles = Array.from(new Set([...realmRoles, ...clientRoles]));

  return {
    id: (parsed.sub as string) || "",
    username: (parsed.preferred_username as string) || (parsed.sub as string) || "user",
    email: parsed.email as string | undefined,
    name: parsed.name as string | undefined,
    givenName: parsed.given_name as string | undefined,
    familyName: parsed.family_name as string | undefined,
    roles,
    realmRoles,
    clientRoles,
    token: kc.token,
    tokenExp: typeof parsed.exp === "number" ? parsed.exp : undefined,
  };
}
