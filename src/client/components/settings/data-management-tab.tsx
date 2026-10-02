import { useEffect, useState } from "react";
import { Trash2, AlertTriangle, CheckCircle2, RotateCcw, Database, ShieldAlert, Sparkles } from "lucide-react";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import type { DemoDataStatus, DeleteDemoDataResult } from "@/types";

export function DataManagementTab() {
  const app = useApp();
  const [status, setStatus] = useState<DemoDataStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);

  async function checkStatus() {
    try {
      setLoading(true);
      const s = await app.getDemoDataStatus();
      setStatus(s);
    } catch (err) {
      console.error("Failed to fetch demo data status", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete() {
    try {
      setDeleting(true);
      const res = await app.deleteDemoData();
      setResultMsg(res.message);
      await checkStatus();
      setConfirmOpen(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  async function handleRestore() {
    try {
      setDeleting(true);
      await app.restoreDemoData();
      setResultMsg("Sample demo data has been restored.");
      await checkStatus();
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-4">
      {resultMsg && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
            <span>{resultMsg}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setResultMsg(null)}
            className="h-6 px-2 text-xs"
          >
            Dismiss
          </Button>
        </div>
      )}

      <Card className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5">
                <Database className="size-4 text-primary" />
                Sample & Dummy Data Management
              </h2>
              {status?.hasDemoData ? (
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[11px] gap-1">
                  <Sparkles className="size-3 text-amber-500" /> Demo Data Present
                </Badge>
              ) : (
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] gap-1">
                  <CheckCircle2 className="size-3 text-emerald-500" /> Clean Portfolio
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              OpenProperty seeds sample demonstration data (Oakwood Estate, Honeybee Hideaway, 308 Mission Apartments, and Suite 4B Airbnb Loft) on initial deployment. Once you have added your real properties, you can remove all dummy data with one click.
            </p>
          </div>
        </div>

        {status?.hasDemoData ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
                <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                <span>Active Demonstration Records Detected</span>
              </div>
              <p className="text-xs text-muted-foreground">
                The following dummy records are currently in your database:
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
                <div className="rounded-md border bg-card p-2">
                  <span className="text-[10px] text-muted-foreground block">Demo Properties</span>
                  <span className="font-semibold text-foreground text-sm">{status.counts.properties}</span>
                  <span className="text-[10px] text-muted-foreground block truncate">
                    {status.demoProperties.join(", ")}
                  </span>
                </div>
                <div className="rounded-md border bg-card p-2">
                  <span className="text-[10px] text-muted-foreground block">Demo Units</span>
                  <span className="font-semibold text-foreground text-sm">{status.counts.units}</span>
                  <span className="text-[10px] text-muted-foreground block">incl. Suite 4B Loft</span>
                </div>
                <div className="rounded-md border bg-card p-2">
                  <span className="text-[10px] text-muted-foreground block">Sample Bookings</span>
                  <span className="font-semibold text-foreground text-sm">{status.counts.bookings}</span>
                  <span className="text-[10px] text-muted-foreground block">Airbnb test stays</span>
                </div>
                <div className="rounded-md border bg-card p-2">
                  <span className="text-[10px] text-muted-foreground block">Demo Vendors</span>
                  <span className="font-semibold text-foreground text-sm">{status.counts.vendors}</span>
                  <span className="text-[10px] text-muted-foreground block">General & Plumber</span>
                </div>
              </div>

              <div className="rounded-md border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                <ShieldAlert className="size-4 text-rose-500 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold block">Safety Guarantee:</strong>
                  Your real properties, units, tenants, leases, and charges (such as <span className="font-semibold underline">Mauerstraße 15</span>) will <strong>NOT</strong> be deleted. Only dummy entities matching the demonstration set will be pruned.
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button
                variant="destructive"
                onClick={() => setConfirmOpen(true)}
                disabled={deleting || loading}
                className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
              >
                <Trash2 className="size-4" />
                {deleting ? "Deleting Dummy Data…" : "Delete Only Dummy Data"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-300 text-sm">
                <CheckCircle2 className="size-4 text-emerald-500" />
                No Dummy Data Present
              </div>
              <p className="text-muted-foreground leading-relaxed">
                Your account is clean and only contains your real properties and live data. Automatic dummy data seeding has been permanently disabled.
              </p>
            </div>

            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRestore}
                disabled={deleting || loading}
                className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
              >
                <RotateCcw className="size-3.5" />
                Restore Sample Data (Sandbox Testing)
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Confirmation Modal */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <AlertTriangle className="size-5" />
              Delete Only Dummy Data?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2.5 text-xs text-muted-foreground pt-1">
              <p>
                This will permanently delete the <strong>3 demo properties</strong> (Oakwood Estate, Honeybee Hideaway, 308 Mission Apartments), their <strong>6 demo units</strong> (including Suite 4B Designer Loft), and sample Airbnb reservations.
              </p>
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-900 dark:text-emerald-200">
                ✓ <strong>Your real data is completely safe:</strong> Any custom properties (e.g. <em>Mauerstraße 15</em>), your real units, real tenants, and leases will remain intact.
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deleting ? "Deleting…" : "Yes, Delete Dummy Data"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
