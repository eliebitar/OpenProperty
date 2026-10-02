import { useEffect, useState } from "react";
import { ArrowLeft, Building2, MapPin, Pencil, Plus, Wrench, User, UserPlus, Sparkles, KeyRound, Calendar } from "lucide-react";
import { useApp } from "@/context";
import { api } from "@/api";
import { cn, colorClasses, formatDate, formatMoney } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PropertyDialog } from "./property-dialog";
import { UnitDialog } from "./unit-dialog";
import { WorkOrderDialog } from "../maintenance/work-order-dialog";
import { OperatingCostsSection } from "./operating-costs-section";
import type { Property, Unit, WorkOrder, OperatingCostsSummary } from "@/types";
import { PageShell } from "@/components/page-shell";

const TYPE_LABEL: Record<string, string> = {
  single_family: "Single-family",
  multi_family: "Multi-family",
  condo: "Condo",
  townhouse: "Townhouse",
  commercial: "Commercial",
  airbnb: "Airbnb / Vacation",
};

const STATUS_TONE: Record<string, string> = {
  vacant: "bg-warning-tint text-warning",
  occupied: "bg-success-tint text-success",
  turnover: "bg-info-tint text-info",
  unavailable: "bg-muted text-muted-foreground",
};

export function PropertyPage({ id, navigate }: { id: number; navigate: (to: string) => void }) {
  const app = useApp();
  const [property, setProperty] = useState<Property | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [operatingSummary, setOperatingSummary] = useState<OperatingCostsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingProperty, setEditingProperty] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | undefined>(undefined);
  const [unitDialogOpen, setUnitDialogOpen] = useState(false);
  const [woDialogOpen, setWoDialogOpen] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const [{ property: p }, ulist, wlist, opData] = await Promise.all([
        api<{ property: Property }>("GET", `/api/properties/${id}`),
        app.listUnits(id),
        app.listWorkOrders({ property_id: id }),
        api<{ summary: OperatingCostsSummary }>(
          "GET",
          `/api/properties/${id}/operating-costs-summary?year=${new Date().getFullYear()}`
        ).catch(() => ({ summary: null })),
      ]);
      setProperty(p);
      setUnits(ulist);
      setWorkOrders(wlist);
      setOperatingSummary(opData?.summary ?? null);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        Loading property…
      </div>
    );
  }
  if (!property) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground">Property not found.</p>
        <Button variant="outline" onClick={() => navigate("/properties")}>Back to properties</Button>
      </div>
    );
  }

  const palette = colorClasses(property.color);
  const occupied = units.filter((u) => u.status === "occupied").length;
  const totalRent = units.reduce((sum, u) => sum + (u.market_rent ?? 0), 0);
  const openWorkOrders = workOrders.filter((w) => w.status !== "completed" && w.status !== "cancelled");

  return (
    <PageShell
      title={
        <button
          type="button"
          onClick={() => navigate("/properties")}
          className="inline-flex items-center gap-1.5 text-[1.375rem] font-semibold leading-tight tracking-[-0.01em] transition-colors duration-150 hover:text-muted-foreground"
        >
          <ArrowLeft className="size-4 text-muted-foreground" aria-hidden />
          Properties
        </button>
      }
      width="max-w-7xl"
    >
        <header className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={cn("flex size-12 items-center justify-center rounded-md", palette.bg, palette.text)}>
              <Building2 className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-[1.375rem] font-semibold leading-tight tracking-[-0.01em]">{property.name}</h1>
                <span className="rounded-full border bg-muted/30 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {TYPE_LABEL[property.type] ?? property.type}
                </span>
              </div>
              {(property.address || property.city) && (
                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {[property.address, property.city, property.state, property.zip].filter(Boolean).join(", ")}
                </p>
              )}
            </div>
          </div>
          <Button variant="outline" onClick={() => setEditingProperty(true)}>
            <Pencil className="mr-1 h-4 w-4" /> Edit property
          </Button>
        </header>

        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <SummaryCard label="Units" value={String(units.length)} />
          <SummaryCard label="Occupied" value={`${occupied}/${units.length}`} />
          <SummaryCard label="Market rent" value={formatMoney(totalRent, app.settings.currency)} />
          <SummaryCard label="Open work orders" value={String(openWorkOrders.length)} tone={openWorkOrders.length > 0 ? "warn" : "default"} />
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[1.0625rem] font-semibold leading-tight">Units</h2>
            <Button size="sm" onClick={() => { setEditingUnit(undefined); setUnitDialogOpen(true); }}>
              <Plus className="mr-1 h-4 w-4" /> New unit
            </Button>
          </div>
          {units.some((u) => u.type === "airbnb") && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-rose-500/20 bg-rose-500/5 p-3 text-xs">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 items-center justify-center rounded-md bg-rose-500/10 text-rose-500">
                  <Sparkles className="size-4" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">Airbnb Short-Term Rental Listings</p>
                  <p className="text-muted-foreground">
                    This property has {units.filter((u) => u.type === "airbnb").length} short-term rental unit(s). Track bookings, turnovers, and STR payouts in the Airbnb Hub.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs h-7 gap-1"
                onClick={() => navigate("/airbnb")}
              >
                Open Airbnb Hub →
              </Button>
            </div>
          )}
          {units.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              No units yet. Add one to start tracking leases and rent.
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {units.map((u) => {
                const isAirbnb = u.type === "airbnb";
                const unitSummary = operatingSummary?.units.find((ou) => ou.unit_id === u.id);
                const coldRent = u.active_rent ?? u.market_rent ?? 0;
                const monthlyOpAdvance = ((u.active_operating_advance ?? 0) + (u.active_heating_advance ?? 0)) || (u.monthly_operating_cost ?? 0);
                const warmRent = coldRent + monthlyOpAdvance;
                const currentYear = new Date().getFullYear();

                return (
                  <Card
                    key={u.id}
                    className="cursor-pointer p-4 transition-colors duration-150 hover:bg-muted/40 flex flex-col justify-between"
                    onClick={() => {
                      navigate(`/units/${u.id}`);
                    }}
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-semibold text-base">{u.name}</h3>
                            {isAirbnb && (
                              <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25 text-[10px] px-1.5 py-0 h-4">
                                Airbnb
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {u.bedrooms} bd · {u.bathrooms} ba{isAirbnb ? ` · Up to ${u.airbnb_max_guests || 2} guests` : ""}{u.sqft ? ` · ${u.sqft} m²` : ""}
                          </p>
                        </div>
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_TONE[u.status])}>
                          {u.status}
                        </span>
                      </div>

                      {/* Pricing Breakdown: Airbnb vs Long-term */}
                      {isAirbnb ? (
                        <div className="mt-3 space-y-2">
                          <div className="grid grid-cols-3 gap-1.5 rounded-md border border-rose-500/20 bg-rose-500/5 p-2 text-xs">
                            <div>
                              <span className="text-[10px] text-muted-foreground block font-medium">Nightly Rate</span>
                              <span className="font-mono font-semibold tabular-nums text-foreground">
                                {formatMoney(u.airbnb_nightly_rate ?? (u.market_rent || 0), app.settings.currency)}
                              </span>
                            </div>
                            <div>
                              <span className="text-[10px] text-muted-foreground block font-medium">Cleaning</span>
                              <span className="font-mono font-semibold tabular-nums text-foreground">
                                {formatMoney(u.airbnb_cleaning_fee ?? 0, app.settings.currency)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] text-muted-foreground block font-medium">Min Stay</span>
                              <span className="font-mono font-semibold tabular-nums text-foreground">
                                {u.airbnb_min_nights ?? 1} {Number(u.airbnb_min_nights ?? 1) === 1 ? "night" : "nights"}
                              </span>
                            </div>
                          </div>

                          {u.current_airbnb_guest_name ? (
                            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-xs flex items-center justify-between">
                              <div>
                                <span className="text-[10px] uppercase font-semibold text-rose-600 dark:text-rose-400 block">
                                  Current Guest
                                </span>
                                <span className="font-semibold text-foreground">{u.current_airbnb_guest_name}</span>
                              </div>
                              {u.current_airbnb_check_out && (
                                <span className="text-[11px] text-muted-foreground font-mono">
                                  Out: {formatDate(u.current_airbnb_check_out)}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="rounded-md border border-dashed p-1.5 text-center text-[11px] text-muted-foreground">
                              {u.airbnb_upcoming_bookings_count
                                ? `${u.airbnb_upcoming_bookings_count} upcoming reservation(s) scheduled`
                                : "No active guest · Ready for booking"}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-md border bg-muted/20 p-2 text-xs">
                          <div>
                            <span className="text-[10px] text-muted-foreground block font-medium">Cold Rent</span>
                            <span className="font-mono font-semibold tabular-nums text-foreground">
                              {formatMoney(coldRent, app.settings.currency)}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block font-medium">Nebenkosten</span>
                            <span className="font-mono font-semibold tabular-nums text-foreground">
                              +{formatMoney(monthlyOpAdvance, app.settings.currency)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-muted-foreground block font-medium">Warm Rent</span>
                            <span className="font-mono font-bold tabular-nums text-primary">
                              {formatMoney(warmRent, app.settings.currency)}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Yearly Operating Cost Settlement Comparison */}
                      {unitSummary && (
                        <div className="mt-2.5 rounded-md border bg-card p-2 text-xs space-y-1.5 shadow-sm">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="font-semibold text-foreground">Yearly Settlement ({currentYear})</span>
                            <span className="font-mono">{unitSummary.sqft} m² ({unitSummary.sqft_share_pct}%)</span>
                          </div>
                          <div className="grid grid-cols-2 gap-1 py-1 border-y border-dashed text-[11px]">
                            <div>
                              <span className="text-muted-foreground text-[10px] block">Paid Already:</span>
                              <span className="font-mono font-semibold text-foreground">
                                {formatMoney(unitSummary.annual_advance, app.settings.currency)}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-muted-foreground text-[10px] block">Actual Cost:</span>
                              <span className="font-mono font-semibold text-foreground">
                                {formatMoney(unitSummary.allocated_cost, app.settings.currency)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between pt-0.5">
                            <span className="text-[10px] uppercase font-semibold text-muted-foreground">
                              {unitSummary.is_vacant
                                ? "Vacancy"
                                : unitSummary.balance < 0
                                ? "Refund"
                                : unitSummary.balance > 0
                                ? "Balance Due"
                                : "Status"}
                            </span>
                            {unitSummary.is_vacant ? (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground font-mono">
                                Owner: {formatMoney(unitSummary.allocated_cost, app.settings.currency)}
                              </Badge>
                            ) : unitSummary.balance < 0 ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-mono font-semibold">
                                Gets back: {formatMoney(Math.abs(unitSummary.balance), app.settings.currency)}
                              </Badge>
                            ) : unitSummary.balance > 0 ? (
                              <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] font-mono font-semibold">
                                Needs to pay: {formatMoney(unitSummary.balance, app.settings.currency)}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] font-mono">
                                Balanced (€0.00)
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Footer Row */}
                    <div className="mt-3 flex items-center justify-between border-t pt-2.5 text-xs">
                      {isAirbnb ? (
                        <>
                          <span className="text-muted-foreground text-[11px] flex items-center gap-1">
                            <Sparkles className="size-3 text-rose-500" /> Short-term rental
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-[11px] px-2 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/units/${u.id}`);
                            }}
                          >
                            Unit Details & Stays →
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-muted-foreground text-[11px]">Tenant:</span>
                          {u.active_tenant_name ? (
                            <span className="font-medium text-foreground flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              {u.active_tenant_name}
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 text-[11px] px-2 gap-1 text-primary hover:text-primary hover:bg-primary/5"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingUnit(u);
                                setUnitDialogOpen(true);
                              }}
                            >
                              <UserPlus className="h-3 w-3" /> Assign tenant
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[1.0625rem] font-semibold leading-tight">Work orders</h2>
            <Button size="sm" variant="outline" onClick={() => setWoDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> New work order
            </Button>
          </div>
          {workOrders.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">No work orders for this property.</Card>
          ) : (
            <Card className="divide-y">
              {workOrders.map((w) => (
                <div key={w.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{w.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[w.unit_name, w.vendor_name, formatDate(w.created_at)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="neutral" className="capitalize">{w.priority}</Badge>
                    <Badge variant="secondary" className="capitalize">{w.status.replace("_", " ")}</Badge>
                  </div>
                </div>
              ))}
            </Card>
          )}
        </section>

        <OperatingCostsSection propertyId={property.id} />

      <PropertyDialog
        open={editingProperty}
        onOpenChange={(o) => { setEditingProperty(o); if (!o) load(); }}
        property={property}
      />
      <UnitDialog
        open={unitDialogOpen}
        onOpenChange={(o) => { setUnitDialogOpen(o); if (!o) load(); }}
        propertyId={property.id}
        unit={editingUnit}
      />
      <WorkOrderDialog
        open={woDialogOpen}
        onOpenChange={(o) => { setWoDialogOpen(o); if (!o) load(); }}
        defaults={{ property_id: property.id }}
      />
    </PageShell>
  );
}

function SummaryCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warn" }) {
  return (
    <Card className="p-4">
      <div className="stat-label">{label}</div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", tone === "warn" && "text-warning")}>{value}</div>
    </Card>
  );
}
