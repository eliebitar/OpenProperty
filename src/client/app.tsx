import { useEffect } from "react";
import { AppNav, reportLocation, type AppNavItem } from "@clawnify/app/client";
import { AuthProvider, useAuth } from "./auth";
import { UserMenu } from "./components/auth/user-menu";
import { LoginGate } from "./components/auth/login-gate";
import { useAppState } from "./hooks/use-app-state";
import { useRouter, type Route } from "./hooks/use-router";
import { AppContext } from "./context";
import { ErrorBanner } from "./components/error-banner";
import { DashboardPage } from "./components/dashboard/dashboard-page";
import { PropertiesList } from "./components/properties/properties-list";
import { PropertyPage } from "./components/properties/property-page";
import { UnitPage } from "./components/properties/unit-page";
import { TenantsList } from "./components/tenants/tenants-list";
import { TenantPage } from "./components/tenants/tenant-page";
import { LeasesPage } from "./components/leases/leases-page";
import { RentPage } from "./components/rent/rent-page";
import { AirbnbPage } from "./components/airbnb/airbnb-page";
import { MaintenancePage } from "./components/maintenance/maintenance-page";
import { SettingsPage } from "./components/settings/settings-page";
import { OrganizationPage } from "./components/organization/organization-page";
import { CleanerPage } from "./components/cleaner/cleaner-page";
import { Sparkles } from "lucide-react";

/**
 * The navigation, defined once.
 *
 * Opened directly, <AppNav> paints this as the app's own rail; inside the
 * Clawnify dashboard it paints nothing and hands the same list to the host, so
 * the user sees one nav rather than two. Every record type owns a colour and
 * keeps it on its tile wherever the type appears.
 *
 * Icons come from the platform's TILE_ICONS library — a name outside it draws
 * as a plain dot in the dashboard.
 */
const PORTFOLIO: AppNavItem[] = [
  // Not drawn as a row: the app's name opens it (the brand row standalone, the
  // app's own header in the dashboard).
  { id: "dashboard", label: "Dashboard", href: "/dashboard", home: true },
  { id: "properties", label: "Properties", href: "/properties", icon: "building-2", color: "green" },
  { id: "tenants", label: "Tenants", href: "/tenants", icon: "users", color: "blue" },
  { id: "leases", label: "Leases", href: "/leases", icon: "clipboard-list", color: "violet" },
  { id: "airbnb", label: "Airbnb", href: "/airbnb", icon: "home", color: "pink" },
];
const OPERATIONS: AppNavItem[] = [
  { id: "cleaner", label: "Cleaning Schedule", href: "/cleaner", icon: "sparkles", color: "teal" },
  { id: "rent", label: "Rent", href: "/rent", icon: "dollar-sign", color: "amber" },
  { id: "maintenance", label: "Maintenance", href: "/maintenance", icon: "list-checks", color: "orange" },
];
const ADMIN: AppNavItem[] = [
  { id: "organization", label: "Organization", href: "/organization", icon: "shield", color: "violet" },
  { id: "settings", label: "Settings", href: "/settings", icon: "settings" },
];

const CLEANER_NAV: AppNavItem[] = [
  { id: "cleaner", label: "My Cleaning Tasks", href: "/cleaner", icon: "sparkles", color: "teal", home: true },
];

/** A record page keeps its collection's row lit. */
function activeFor(route: Route): string {
  if (route.name === "property" || route.name === "unit") return "properties";
  if (route.name === "tenant") return "tenants";
  return route.name;
}

export function App() {
  return (
    <AuthProvider>
      <LoginGate>
        <AppContent />
      </LoginGate>
    </AuthProvider>
  );
}

function AppContent() {
  const state = useAppState();
  const auth = useAuth();
  const { path, route, navigate } = useRouter();

  // Determine if the current logged-in user is a cleaner
  const userRole = state.activeOrganization?.user_role;
  const isCleaner =
    userRole === "cleaner" ||
    auth.user?.roles?.includes("cleaner") ||
    state.organizationMembers.some(
      (m) =>
        m.role === "cleaner" &&
        (m.email.toLowerCase() === auth.user?.email?.toLowerCase() ||
         m.email.toLowerCase() === state.simulatedUser?.toLowerCase())
    );

  // Lets the dashboard restore this exact screen on reload.
  useEffect(() => {
    reportLocation(path);
  }, [path]);

  // When a cleaner logs in or tries to access any non-cleaner page, redirect to /cleaner
  useEffect(() => {
    if (!state.loading && isCleaner && route.name !== "cleaner") {
      navigate("/cleaner");
    }
  }, [state.loading, isCleaner, route.name, navigate]);

  // For cleaners: hide all portfolio, operations, and admin pages; only show My Cleaning Tasks
  const groups = isCleaner
    ? [{ items: CLEANER_NAV }]
    : [
        { items: PORTFOLIO },
        { label: "Operations", items: OPERATIONS },
        { label: "Admin", items: ADMIN },
      ];

  return (
    <AppContext.Provider value={state}>
      <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-background text-foreground md:flex-row">
        {/* flex, so the SDK's <aside> stretches to the row height as a direct
            child would. Below md the SDK lays it out as a scrolling strip, which
            the flex-col above puts ABOVE the content rather than beside it. */}
        <div className="flex shrink-0">
          <AppNav
            title="OpenProperty"
            icon="home"
            groups={groups}
            active={isCleaner ? "cleaner" : activeFor(route)}
            onNavigate={(item) => navigate(item.href ?? (isCleaner ? "/cleaner" : "/dashboard"))}
          >
            <UserMenu onNavigateSettings={isCleaner ? undefined : () => navigate("/settings")} />
          </AppNav>
        </div>
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Quick exit bar when simulating cleaner in local development mode */}
          {state.simulatedUser && isCleaner && (
            <div className="flex shrink-0 items-center justify-between border-b border-teal-500/20 bg-teal-500/10 px-4 py-1.5 text-xs text-teal-800 dark:text-teal-300">
              <div className="flex items-center gap-1.5 font-medium">
                <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                <span>Simulating Cleaner View: <strong>{state.simulatedUser}</strong></span>
              </div>
              <button
                type="button"
                onClick={() => state.switchSimulatedUser(null)}
                className="cursor-pointer rounded bg-teal-600 px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-teal-700 transition-colors shadow-2xs"
              >
                Exit Cleaner View &rarr;
              </button>
            </div>
          )}

          {state.loading ? (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              Loading…
            </div>
          ) : isCleaner ? (
            <CleanerPage navigate={navigate} />
          ) : (
            <>
              {route.name === "dashboard" && <DashboardPage navigate={navigate} />}
              {route.name === "properties" && <PropertiesList navigate={navigate} />}
              {route.name === "property" && <PropertyPage id={route.id} navigate={navigate} />}
              {route.name === "unit" && <UnitPage id={route.id} propertyId={route.propertyId} navigate={navigate} />}
              {route.name === "tenants" && <TenantsList navigate={navigate} />}
              {route.name === "tenant" && <TenantPage id={route.id} navigate={navigate} />}
              {route.name === "leases" && <LeasesPage navigate={navigate} />}
              {route.name === "rent" && <RentPage navigate={navigate} />}
              {route.name === "airbnb" && <AirbnbPage navigate={navigate} />}
              {route.name === "cleaner" && <CleanerPage navigate={navigate} />}
              {route.name === "maintenance" && <MaintenancePage />}
              {route.name === "organization" && <OrganizationPage navigate={navigate} />}
              {route.name === "settings" && <SettingsPage />}
              {route.name === "not-found" && (
                <Placeholder title="Not found" message="That page doesn't exist." />
              )}
            </>
          )}
        </main>
        <ErrorBanner />
      </div>
    </AppContext.Provider>
  );
}

function Placeholder({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 p-12 text-center">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
