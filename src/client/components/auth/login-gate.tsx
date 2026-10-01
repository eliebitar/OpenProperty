import { useState } from "react";
import { Shield, KeyRound, ArrowRight, RefreshCw, AlertCircle, Building2 } from "lucide-react";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function LoginGate({ children }: { children: React.ReactNode }) {
  const { isEnabled, isAuthRequired, isAuthenticated, isLoading, error, login, config } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // If user is already authenticated
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // If loading authentication state
  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 shadow-xl shadow-sky-500/20">
            <Building2 className="h-8 w-8 text-white animate-pulse" />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin text-sky-500" />
            <span>Connecting to Keycloak…</span>
          </div>
        </div>
      </div>
    );
  }

  const handleLogin = async () => {
    try {
      setIsLoggingIn(true);
      await login();
    } catch (err) {
      console.error("Login failed:", err);
      setIsLoggingIn(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background px-4 py-12 text-foreground">
      {/* Background ambient gradient glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-96 w-[600px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-sky-500/15 to-indigo-500/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-1/2 -z-10 h-96 w-[600px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-indigo-500/15 to-purple-500/15 blur-3xl" />

      <Card className="relative w-full max-w-md overflow-hidden border-border/70 bg-card/95 p-8 shadow-2xl backdrop-blur-xl">
        {/* Brand header */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/25">
            <Building2 className="h-7 w-7 text-white" />
            <div className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-background shadow-xs">
              <Shield className="h-3.5 w-3.5 text-sky-500" />
            </div>
          </div>

          <h1 className="text-2xl font-bold tracking-tight text-foreground">OpenProperty</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enterprise Property & Asset Management
          </p>

          <div className="mt-3 flex items-center gap-1.5">
            <Badge variant="outline" className="border-sky-300 dark:border-sky-800 text-sky-600 dark:text-sky-400 font-mono text-xs">
              Keycloak Single Sign-On
            </Badge>
          </div>
        </div>

        {/* Error message if connection failed */}
        {error && (
          <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              <p className="font-semibold">Authentication Error</p>
              <p className="opacity-90">{error}</p>
            </div>
          </div>
        )}

        {/* Info box */}
        <div className="mt-6 space-y-3 rounded-lg border border-border/60 bg-muted/40 p-4 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Identity Provider</span>
            <span className="font-medium text-foreground">Keycloak OIDC</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Realm</span>
            <span className="font-mono text-foreground">{config?.realm}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Client ID</span>
            <span className="font-mono text-foreground">{config?.clientId}</span>
          </div>
        </div>

        {/* Action button */}
        <div className="mt-6 space-y-3">
          <Button
            size="lg"
            className="w-full justify-center gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 font-medium text-white shadow-md hover:from-sky-500 hover:to-indigo-500"
            onClick={handleLogin}
            disabled={isLoggingIn}
          >
            {isLoggingIn ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Redirecting to Keycloak…</span>
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4" />
                <span>Sign in with Keycloak</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <p className="text-center text-[11px] text-muted-foreground">
            You will be securely redirected to the Keycloak authentication portal.
          </p>
        </div>
      </Card>
    </div>
  );
}
