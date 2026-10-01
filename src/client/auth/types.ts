export interface KeycloakConfig {
  enabled: boolean;
  url: string;
  realm: string;
  clientId: string;
  authRequired: boolean;
}

export interface AuthUser {
  id: string;
  username: string;
  email?: string;
  name?: string;
  givenName?: string;
  familyName?: string;
  roles: string[];
  realmRoles: string[];
  clientRoles: string[];
  token: string;
  tokenExp?: number;
}

export interface AuthContextValue {
  isInitialized: boolean;
  isEnabled: boolean;
  isAuthRequired: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  token: string | null;
  config: KeycloakConfig | null;
  error: string | null;
  login: (redirectUri?: string) => Promise<void>;
  logout: (redirectUri?: string) => Promise<void>;
  register: () => Promise<void>;
  manageAccount: () => Promise<void>;
  hasRole: (role: string) => boolean;
  refreshToken: () => Promise<string | null>;
  reloadConfig: () => Promise<void>;
}
