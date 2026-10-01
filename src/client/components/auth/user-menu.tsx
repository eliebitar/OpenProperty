import { useState } from "react";
import {
  LogOut,
  User,
  Shield,
  KeyRound,
  ExternalLink,
  RefreshCw,
  LogIn,
  Check,
} from "lucide-react";
import { useAuth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UserMenuProps {
  onNavigateSettings?: () => void;
}

export function UserMenu({ onNavigateSettings }: UserMenuProps) {
  const {
    isEnabled,
    isAuthenticated,
    isLoading,
    user,
    config,
    login,
    logout,
    manageAccount,
    refreshToken,
  } = useAuth();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [justRefreshed, setJustRefreshed] = useState(false);

  // If Keycloak is not enabled
  if (!isEnabled) {
    return (
      <div className="flex items-center justify-between border-t border-border/60 p-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500" title="Local standalone mode" />
          <span className="font-medium text-foreground">Local Mode</span>
        </div>
        {onNavigateSettings && (
          <button
            onClick={onNavigateSettings}
            className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            title="Configure Keycloak Authentication in Settings"
          >
            <KeyRound className="h-3 w-3" />
            <span>Enable Auth</span>
          </button>
        )}
      </div>
    );
  }

  // If Keycloak is enabled and loading
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 border-t border-border/60 p-3 text-xs text-muted-foreground">
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        <span>Authenticating…</span>
      </div>
    );
  }

  // If Keycloak is enabled but user is not logged in
  if (!isAuthenticated || !user) {
    return (
      <div className="border-t border-border/60 p-3">
        <Button
          size="sm"
          className="w-full justify-center gap-2 bg-gradient-to-r from-sky-600 to-indigo-600 text-white shadow-sm hover:from-sky-500 hover:to-indigo-500"
          onClick={() => login()}
        >
          <LogIn className="h-3.5 w-3.5" />
          <span>Sign In with Keycloak</span>
        </Button>
      </div>
    );
  }

  // Initials for avatar
  const initials =
    (user.givenName?.[0] || "") + (user.familyName?.[0] || "") ||
    user.username.slice(0, 2).toUpperCase();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshToken();
    setIsRefreshing(false);
    setJustRefreshed(true);
    setTimeout(() => setJustRefreshed(false), 2000);
  };

  return (
    <div className="border-t border-border/60 p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left text-xs transition-colors hover:bg-muted/80 focus:outline-none">
            {/* Avatar */}
            <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 font-semibold text-white shadow-xs">
              <span>{initials}</span>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-emerald-500" />
            </div>

            {/* User name & role */}
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-foreground">
                {user.name || user.username}
              </div>
              <div className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
                {user.roles.length > 0 ? (
                  <span className="capitalize">{user.roles[0]}</span>
                ) : (
                  <span>Authenticated</span>
                )}
                {user.roles.length > 1 && (
                  <span className="text-[10px] text-muted-foreground/80">
                    +{user.roles.length - 1}
                  </span>
                )}
              </div>
            </div>

            <Shield className="h-3.5 w-3.5 shrink-0 text-sky-500" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" side="top" className="w-64">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-semibold leading-none text-foreground">
                {user.name || user.username}
              </p>
              {user.email && (
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              )}
              <div className="mt-1 flex flex-wrap gap-1">
                <Badge variant="outline" className="text-[10px] text-sky-600 border-sky-300 dark:border-sky-800">
                  Realm: {config?.realm}
                </Badge>
                {user.roles.slice(0, 3).map((r) => (
                  <Badge key={r} variant="neutral" className="text-[10px] capitalize">
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => manageAccount()} className="cursor-pointer">
            <ExternalLink className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
            <span>Keycloak Account Console</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleRefresh} disabled={isRefreshing} className="cursor-pointer">
            {justRefreshed ? (
              <Check className="mr-2 h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <RefreshCw
                className={`mr-2 h-3.5 w-3.5 text-muted-foreground ${
                  isRefreshing ? "animate-spin" : ""
                }`}
              />
            )}
            <span>{justRefreshed ? "Session Refreshed" : "Refresh Token"}</span>
          </DropdownMenuItem>

          {onNavigateSettings && (
            <DropdownMenuItem onClick={onNavigateSettings} className="cursor-pointer">
              <KeyRound className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              <span>Authentication Settings</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => logout()}
            className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <LogOut className="mr-2 h-3.5 w-3.5" />
            <span>Sign Out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
