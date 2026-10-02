import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import Keycloak from "keycloak-js";
import { api, setTokenProvider } from "../api";
import { createKeycloakInstance, extractUserFromKeycloak } from "./keycloak";
import type { KeycloakConfig, AuthUser, AuthContextValue } from "./types";

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<KeycloakConfig | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kcRef = useRef<Keycloak | null>(null);
  const refreshIntervalRef = useRef<number | null>(null);

  // Load configuration from API (and environment variable fallbacks)
  const loadConfig = useCallback(async (): Promise<KeycloakConfig> => {
    let serverConfig: Partial<KeycloakConfig> = {};
    try {
      serverConfig = await api<KeycloakConfig>("GET", "/api/auth/config");
    } catch (err) {
      console.warn("Could not fetch Keycloak config from server, using env / defaults:", err);
    }

    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};

    const url = env.VITE_KEYCLOAK_URL || serverConfig.url || "http://localhost:8080";
    const realm = env.VITE_KEYCLOAK_REALM || serverConfig.realm || "openproperty";
    const clientId = env.VITE_KEYCLOAK_CLIENT_ID || serverConfig.clientId || "openproperty-client";

    const finalConfig: KeycloakConfig = {
      enabled: true,
      url,
      realm,
      clientId,
      authRequired: true,
    };

    setConfig(finalConfig);
    return finalConfig;
  }, []);

  // Initialize Keycloak client if enabled
  const initKeycloak = useCallback(async (cfg: KeycloakConfig) => {
    if (!cfg.enabled) {
      setTokenProvider(null);
      setIsAuthenticated(false);
      setUser(null);
      setToken(null);
      setIsInitialized(true);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const kc = createKeycloakInstance(cfg);
      kcRef.current = kc;

      // Register token provider with the API layer with auto-refresh
      setTokenProvider(async () => {
        if (!kc.authenticated) return null;
        try {
          // If token expires within 30 seconds, refresh it
          await kc.updateToken(30);
          return kc.token || null;
        } catch {
          return kc.token || null;
        }
      });

      // Token expiration events
      kc.onTokenExpired = async () => {
        try {
          await kc.updateToken(60);
          if (kc.token) {
            setToken(kc.token);
            setUser(extractUserFromKeycloak(kc));
          }
        } catch (err) {
          console.warn("Keycloak token refresh failed:", err);
        }
      };

      kc.onAuthLogout = () => {
        setIsAuthenticated(false);
        setUser(null);
        setToken(null);
      };

      const authenticated = await kc.init({
        onLoad: cfg.authRequired ? "login-required" : "check-sso",
        checkLoginIframe: false,
        pkceMethod: "S256",
        enableLogging: true,
      });

      setIsAuthenticated(authenticated);
      if (authenticated && kc.token) {
        setToken(kc.token);
        setUser(extractUserFromKeycloak(kc));
        try {
          localStorage.removeItem("openproperty:simulated_user");
        } catch {
          /* ignore */
        }
      } else {
        setUser(null);
        setToken(null);
      }

      // Periodic token freshness check (every 30 seconds)
      if (refreshIntervalRef.current) {
        window.clearInterval(refreshIntervalRef.current);
      }
      refreshIntervalRef.current = window.setInterval(async () => {
        if (kc.authenticated) {
          try {
            const refreshed = await kc.updateToken(40);
            if (refreshed && kc.token) {
              setToken(kc.token);
              setUser(extractUserFromKeycloak(kc));
            }
          } catch {
            // Token refresh failed or expired
          }
        }
      }, 30000);

      setIsInitialized(true);
    } catch (err) {
      console.error("Failed to initialize Keycloak:", err);
      setError(
        (err as Error).message ||
          "Could not connect to Keycloak server. Please check the URL and Realm in Settings.",
      );
      setIsAuthenticated(false);
      setUser(null);
      setToken(null);
      setIsInitialized(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial boot
  useEffect(() => {
    let mounted = true;
    (async () => {
      const cfg = await loadConfig();
      if (mounted) {
        await initKeycloak(cfg);
      }
    })();

    return () => {
      mounted = false;
      if (refreshIntervalRef.current) {
        window.clearInterval(refreshIntervalRef.current);
      }
    };
  }, [loadConfig, initKeycloak]);

  // Method handlers
  const login = useCallback(async (redirectUri?: string) => {
    if (!kcRef.current) {
      if (config) {
        const kc = createKeycloakInstance(config);
        kcRef.current = kc;
        await kc.login({ redirectUri: redirectUri || window.location.href });
      }
      return;
    }
    await kcRef.current.login({
      redirectUri: redirectUri || window.location.href,
    });
  }, [config]);

  const logout = useCallback(async (redirectUri?: string) => {
    if (!kcRef.current) return;
    await kcRef.current.logout({
      redirectUri: redirectUri || window.location.origin,
    });
  }, []);

  const register = useCallback(async () => {
    if (!kcRef.current) return;
    await kcRef.current.register({
      redirectUri: window.location.href,
    });
  }, []);

  const manageAccount = useCallback(async () => {
    if (!kcRef.current) return;
    await kcRef.current.accountManagement();
  }, []);

  const hasRole = useCallback(
    (role: string): boolean => {
      if (!user) return false;
      return user.roles.includes(role);
    },
    [user],
  );

  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!kcRef.current || !kcRef.current.authenticated) return null;
    try {
      await kcRef.current.updateToken(-1); // Force token update
      const newToken = kcRef.current.token || null;
      setToken(newToken);
      setUser(extractUserFromKeycloak(kcRef.current));
      return newToken;
    } catch {
      return null;
    }
  }, []);

  const reloadConfig = useCallback(async () => {
    const cfg = await loadConfig();
    await initKeycloak(cfg);
  }, [loadConfig, initKeycloak]);

  const value: AuthContextValue = {
    isInitialized,
    isEnabled: config?.enabled ?? false,
    isAuthRequired: config?.authRequired ?? false,
    isAuthenticated,
    isLoading,
    user,
    token,
    config,
    error,
    login,
    logout,
    register,
    manageAccount,
    hasRole,
    refreshToken,
    reloadConfig,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
