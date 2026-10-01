import { useState, useEffect } from "react";
import {
  Shield,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Copy,
  Check,
  Server,
  Lock,
  User,
  LogIn,
  LogOut,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "@/auth";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function AuthSettingsTab() {
  const {
    isEnabled,
    isAuthRequired,
    isAuthenticated,
    user,
    config,
    login,
    logout,
    manageAccount,
    refreshToken,
    reloadConfig,
  } = useAuth();

  // Form state
  const [url, setUrl] = useState(config?.url || "http://localhost:8080");
  const [realm, setRealm] = useState(config?.realm || "openproperty");
  const [clientId, setClientId] = useState(config?.clientId || "openproperty-client");
  const [enabled, setEnabled] = useState(isEnabled);
  const [authRequired, setAuthRequired] = useState(isAuthRequired);

  // Sync form when config loads
  useEffect(() => {
    if (config) {
      setUrl(config.url);
      setRealm(config.realm);
      setClientId(config.clientId);
      setEnabled(config.enabled);
      setAuthRequired(config.authRequired);
    }
  }, [config]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    error?: string;
    issuer?: string;
    jwks_uri?: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api<{
        ok: boolean;
        error?: string;
        issuer?: string;
        jwks_uri?: string;
      }>("POST", "/api/auth/test-connection", { url, realm });
      setTestResult(res);
    } catch (err) {
      setTestResult({
        ok: false,
        error: (err as Error).message || "Failed to reach server",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      await api("PUT", "/api/settings", {
        keycloak_url: url.trim(),
        keycloak_realm: realm.trim(),
        keycloak_client_id: clientId.trim(),
        keycloak_enabled: enabled ? "true" : "false",
        keycloak_required: authRequired ? "true" : "false",
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Trigger client auth context reload
      await reloadConfig();
    } catch (err) {
      alert(`Failed to save settings: ${(err as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const redirectUri = typeof window !== "undefined" ? `${window.location.origin}/*` : "http://localhost:5173/*";
  const webOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";

  return (
    <div className="space-y-6">
      {/* ── Active Session Card ────────────────────────────────────── */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-md">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold">Keycloak Single Sign-On</h3>
                {enabled ? (
                  isAuthenticated ? (
                    <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                      Connected & Authenticated
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                      SSO Enabled (Not Logged In)
                    </Badge>
                  )
                ) : (
                  <Badge variant="neutral">Disabled (Local Mode)</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Enterprise OpenID Connect (OIDC) identity management with role-based access control.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {enabled && (
              isAuthenticated ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => manageAccount()}
                    className="gap-1.5"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Account Console</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => logout()}
                    className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => login()}
                  className="gap-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 text-white hover:from-sky-500 hover:to-indigo-500"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Sign In with Keycloak</span>
                </Button>
              )
            )}
          </div>
        </div>

        {/* User profile details when authenticated */}
        {isAuthenticated && user && (
          <div className="mt-6 grid grid-cols-1 gap-3 rounded-lg border border-border/60 bg-muted/30 p-4 sm:grid-cols-3">
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                User
              </span>
              <p className="font-semibold text-sm">{user.name || user.username}</p>
              {user.email && (
                <p className="text-xs text-muted-foreground">{user.email}</p>
              )}
            </div>
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Subject ID (sub)
              </span>
              <p className="truncate font-mono text-xs text-muted-foreground" title={user.id}>
                {user.id}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Assigned Roles
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {user.roles.length > 0 ? (
                  user.roles.map((r) => (
                    <Badge key={r} variant="neutral" className="text-[10px] capitalize">
                      {r}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-muted-foreground">Standard User</span>
                )}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* ── Configuration Form ────────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-6 flex items-center justify-between border-b pb-4">
          <div>
            <h3 className="text-base font-semibold">Keycloak Connection Settings</h3>
            <p className="text-xs text-muted-foreground">
              Configure your Keycloak server endpoint, realm, and client ID.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testing || !url}
            className="gap-1.5"
          >
            {testing ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Server className="h-3.5 w-3.5 text-sky-500" />
            )}
            <span>{testing ? "Testing…" : "Test Connection"}</span>
          </Button>
        </div>

        {/* Connection test result banner */}
        {testResult && (
          <div
            className={`mb-6 flex items-start gap-2.5 rounded-lg border p-3.5 text-xs ${
              testResult.ok
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-destructive/30 bg-destructive/10 text-destructive"
            }`}
          >
            {testResult.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            )}
            <div className="space-y-1">
              <p className="font-semibold">
                {testResult.ok
                  ? "Keycloak connection successful!"
                  : "Connection failed"}
              </p>
              {testResult.ok ? (
                <div className="space-y-0.5 opacity-90">
                  <p>Issuer: <span className="font-mono">{testResult.issuer}</span></p>
                  <p>JWKS URI: <span className="font-mono">{testResult.jwks_uri}</span></p>
                </div>
              ) : (
                <p className="opacity-90">{testResult.error}</p>
              )}
            </div>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="keycloak-url">Keycloak Server URL</Label>
              <Input
                id="keycloak-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:8080 or https://auth.example.com"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Base URL of your Keycloak server without trailing slash.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="keycloak-realm">Realm Name</Label>
              <Input
                id="keycloak-realm"
                value={realm}
                onChange={(e) => setRealm(e.target.value)}
                placeholder="openproperty"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                The Keycloak realm where users and clients are defined.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="keycloak-client">Client ID</Label>
            <Input
              id="keycloak-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="openproperty-client"
              required
            />
            <p className="text-[11px] text-muted-foreground">
              The public OpenID Connect client configured in your Keycloak realm.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 rounded-lg border border-border/60 bg-muted/20 p-4 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium">Enable Keycloak SSO</span>
                <p className="text-xs text-muted-foreground">
                  Activate Keycloak authentication client and verify tokens on backend API routes.
                </p>
              </div>
            </label>

            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={authRequired}
                onChange={(e) => setAuthRequired(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium">Enforce Login (Login Required)</span>
                <p className="text-xs text-muted-foreground">
                  Require users to log in before viewing or interacting with OpenProperty data.
                </p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <Check className="h-4 w-4" /> Settings saved successfully
              </span>
            )}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </form>
      </Card>

      {/* ── Keycloak Setup Guide ──────────────────────────────────── */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-sky-500" />
          <h3 className="text-sm font-semibold">Keycloak Client Setup Instructions</h3>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          When configuring your client in the Keycloak Admin Console, ensure these values match your deployment:
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-3">
            <div>
              <span className="text-[11px] font-medium text-muted-foreground block">
                Valid Redirect URIs
              </span>
              <span className="font-mono text-xs text-foreground font-medium">{redirectUri}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(redirectUri, "redirectUri")}
              className="gap-1 h-8"
            >
              {copiedField === "redirectUri" ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">{copiedField === "redirectUri" ? "Copied" : "Copy"}</span>
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/40 p-3">
            <div>
              <span className="text-[11px] font-medium text-muted-foreground block">
                Web Origins
              </span>
              <span className="font-mono text-xs text-foreground font-medium">{webOrigin}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleCopy(webOrigin, "webOrigin")}
              className="gap-1 h-8"
            >
              {copiedField === "webOrigin" ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span className="text-xs">{copiedField === "webOrigin" ? "Copied" : "Copy"}</span>
            </Button>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-xs space-y-2">
            <h4 className="font-semibold text-foreground">Recommended Keycloak Client Settings:</h4>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">Client type:</strong> OpenID Connect</li>
              <li><strong className="text-foreground">Client authentication:</strong> Off (Public client for browser SPAs)</li>
              <li><strong className="text-foreground">Authentication flow:</strong> Standard flow (Authorization Code with PKCE)</li>
              <li><strong className="text-foreground">PKCE Code Challenge:</strong> S256</li>
              <li><strong className="text-foreground">Proof Key for Code Exchange:</strong> Enforced</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
