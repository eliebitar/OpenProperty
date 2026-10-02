import { useEffect, useState } from "react";
import { Building2, MapPin, Plus, Trash2, Sparkles, AlertTriangle } from "lucide-react";
import { useApp } from "@/context";
import { cn, colorClasses } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PropertyDialog } from "./property-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Property, DemoDataStatus } from "@/types";
import { PageShell } from "@/components/page-shell";

const TYPE_LABEL: Record<string, string> = {
  single_family: "Single-family",
  multi_family: "Multi-family",
  condo: "Condo",
  townhouse: "Townhouse",
  commercial: "Commercial",
};

export function PropertiesList({ navigate }: { navigate: (to: string) => void }) {
  const app = useApp();
  const { properties } = app;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Property | undefined>(undefined);
  const [demoStatus, setDemoStatus] = useState<DemoDataStatus | null>(null);
  const [confirmDemoOpen, setConfirmDemoOpen] = useState(false);
  const [deletingDemo, setDeletingDemo] = useState(false);

  async function loadDemoStatus() {
    try {
      const s = await app.getDemoDataStatus();
      setDemoStatus(s);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadDemoStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [properties.length]);

  async function handleDeleteDemo() {
    try {
      setDeletingDemo(true);
      await app.deleteDemoData();
      await loadDemoStatus();
      setConfirmDemoOpen(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setDeletingDemo(false);
    }
  }

  const totalUnits = properties.reduce((sum, p) => sum + (p.unit_count ?? 0), 0);
  const occupied = properties.reduce((sum, p) => sum + (p.occupied_count ?? 0), 0);

  return (
    <PageShell
      title="Properties"
      meta={`${properties.length} ${properties.length === 1 ? "property" : "properties"} · ${totalUnits} ${totalUnits === 1 ? "unit" : "units"} · ${occupied}/${totalUnits || 0} occupied`}
      actions={
        <div className="flex items-center gap-2">
          {demoStatus?.hasDemoData && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDemoOpen(true)}
              className="text-xs text-rose-600 dark:text-rose-400 border-rose-500/30 hover:bg-rose-500/10 gap-1.5"
            >
              <Trash2 className="size-3.5" /> Delete Dummy Data
            </Button>
          )}
          {properties.length > 0 && (
            <Button onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
              <Plus className="h-4 w-4" />
              New property
            </Button>
          )}
        </div>
      }
    >
      {demoStatus?.hasDemoData && (
        <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <Sparkles className="size-4 shrink-0 text-amber-500" />
            <span>
              <strong>Sample Data Active:</strong> {demoStatus.counts.properties} demo properties ({demoStatus.demoProperties.join(", ")}) and sample units are loaded.
            </span>
          </div>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white shrink-0"
            onClick={() => setConfirmDemoOpen(true)}
          >
            <Trash2 className="size-3 mr-1" /> Delete Dummy Data Only
          </Button>
        </div>
      )}
      {properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
            <Building2 className="size-8 text-faint" aria-hidden />
            <p className="font-medium">No properties yet</p>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              Add your first property to start managing units, leases, and rent.
            </p>
            <Button className="mt-2" onClick={() => { setEditing(undefined); setDialogOpen(true); }}>
              <Plus className="h-4 w-4" /> New property
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {properties.map((p) => {
              const palette = colorClasses(p.color);
              const occRate = p.unit_count
                ? Math.round(((p.occupied_count ?? 0) / p.unit_count) * 100)
                : 0;
              return (
                <Card
                  key={p.id}
                  className={cn(
                    "group relative cursor-pointer overflow-hidden p-5 transition-colors duration-150 hover:bg-muted",
                  )}
                  onClick={() => navigate(`/properties/${p.id}`)}
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className={cn("flex size-10 items-center justify-center rounded-md", palette.bg, palette.text)}>
                      <Building2 className="size-5" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {demoStatus?.demoProperties.includes(p.name) && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/25">
                          Sample
                        </span>
                      )}
                      <span className="chip">
                        {TYPE_LABEL[p.type] ?? p.type}
                      </span>
                    </div>
                  </div>
                  <h3 className="font-semibold tracking-tight">{p.name}</h3>
                  {(p.address || p.city) && (
                    <p className="mt-1 flex items-center gap-1 truncate text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {[p.address, p.city, p.state].filter(Boolean).join(", ")}
                    </p>
                  )}
                  <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 text-sm">
                    <Stat label="Units" value={p.unit_count ?? 0} />
                    <Stat label="Occupied" value={`${p.occupied_count ?? 0}/${p.unit_count ?? 0}`} />
                    <Stat label="Occupancy" value={`${occRate}%`} />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setEditing(p); setDialogOpen(true); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Edit
                    </button>
                    {p.year_built && (
                      <span className="text-xs text-muted-foreground">Built {p.year_built}</span>
                    )}
                  </div>
                </Card>
              );
          })}
        </div>
      )}

      <PropertyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        property={editing}
      />

      {/* Confirmation Modal to Delete Only Dummy Data */}
      <AlertDialog open={confirmDemoOpen} onOpenChange={setConfirmDemoOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="size-5" />
              Delete Only Dummy Data?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2.5 text-xs text-muted-foreground pt-1">
              <p>
                This will delete the <strong>{demoStatus?.counts.properties || 3} sample properties</strong> ({demoStatus?.demoProperties.join(", ")}), their demo units, and sample Airbnb bookings.
              </p>
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-900 dark:text-emerald-200">
                ✓ <strong>Your real properties are completely safe:</strong> Your real properties, units, tenants, and active leases will remain untouched.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel disabled={deletingDemo}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDemo}
              disabled={deletingDemo}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deletingDemo ? "Deleting…" : "Yes, Delete Dummy Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">{value}</div>
    </div>
  );
}
