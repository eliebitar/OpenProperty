import { useEffect, useState } from "react";
import { User, UserPlus, UserCheck, XCircle, FileText, ChevronDown, ChevronUp, Receipt, CheckCircle2, AlertCircle } from "lucide-react";
import { useApp } from "@/context";
import { api } from "@/api";
import { cn, toIsoDate, formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LeaseDialog } from "@/components/leases/lease-dialog";
import { NebenkostenStatementDialog } from "./nebenkosten-statement-dialog";
import type { Unit, UnitStatus, Tenant, OperatingCostsSummary, UnitOperatingCostBreakdown } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: number;
  unit?: Unit;
  onSaved?: () => void;
}

const STATUSES: { value: UnitStatus; label: string }[] = [
  { value: "vacant", label: "Vacant" },
  { value: "occupied", label: "Occupied" },
  { value: "turnover", label: "Turnover" },
  { value: "unavailable", label: "Unavailable" },
];

export function UnitDialog({ open, onOpenChange, propertyId, unit, onSaved }: Props) {
  const app = useApp();
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("residential");
  const [confirming, setConfirming] = useState(false);
  const [bedrooms, setBedrooms] = useState("1");
  const [bathrooms, setBathrooms] = useState("1");
  const [sqft, setSqft] = useState("");
  const [marketRent, setMarketRent] = useState("0");
  const [monthlyOperatingCost, setMonthlyOperatingCost] = useState("0");
  const [status, setStatus] = useState<UnitStatus>("vacant");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Tenant assignment state
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantMode, setSelectedTenantMode] = useState<"none" | "existing" | "new">("none");
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [isChangingTenant, setIsChangingTenant] = useState(false);
  const [fullLeaseOpen, setFullLeaseOpen] = useState(false);

  // New tenant quick add state
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // Lease term state for assignment
  const [leaseStart, setLeaseStart] = useState("");
  const [leaseEnd, setLeaseEnd] = useState("");
  const [leaseRent, setLeaseRent] = useState("");
  const [operatingAdvance, setOperatingAdvance] = useState("0");
  const [heatingAdvance, setHeatingAdvance] = useState("0");

  // Yearly operating costs settlement comparison state
  const [settlementYear, setSettlementYear] = useState<number>(new Date().getFullYear());
  const [costsSummary, setCostsSummary] = useState<OperatingCostsSummary | null>(null);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [statementUnitBreakdown, setStatementUnitBreakdown] = useState<UnitOperatingCostBreakdown | null>(null);
  const [statementDialogOpen, setStatementDialogOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(unit?.name ?? "");
    setType(unit?.type ?? "residential");
    setBedrooms(String(unit?.bedrooms ?? 1));
    setBathrooms(String(unit?.bathrooms ?? 1));
    setSqft(unit?.sqft ? String(unit.sqft) : "");
    setMarketRent(String(unit?.market_rent ?? 0));
    setMonthlyOperatingCost(String(unit?.monthly_operating_cost ?? 0));
    setStatus(unit?.status ?? "vacant");
    setNotes(unit?.notes ?? "");

    // Default dates
    const today = toIsoDate(new Date());
    const oneYear = new Date();
    oneYear.setFullYear(oneYear.getFullYear() + 1);
    setLeaseStart(today);
    setLeaseEnd(toIsoDate(oneYear));
    setLeaseRent(String(unit?.market_rent ?? 0));
    setOperatingAdvance(String(unit?.monthly_operating_cost ?? 0));
    setHeatingAdvance("0");

    setSelectedTenantMode("none");
    setSelectedTenantId("");
    setIsChangingTenant(false);
    setNewFirstName("");
    setNewLastName("");
    setNewEmail("");
    setNewPhone("");

    // Load tenants list
    (async () => {
      try {
        const list = await app.listTenants();
        setTenants(list);
      } catch (err) {
        console.error("Failed to load tenants", err);
      }
    })();
  }, [open, unit, app]);

  // Load operating costs summary for yearly settlement comparison
  useEffect(() => {
    if (!open || !unit?.id) {
      setCostsSummary(null);
      return;
    }
    let cancelled = false;
    setLoadingCosts(true);
    api<{ summary: OperatingCostsSummary }>(
      "GET",
      `/api/properties/${propertyId}/operating-costs-summary?year=${settlementYear}`
    )
      .then((data) => {
        if (!cancelled) setCostsSummary(data.summary);
      })
      .catch((err) => {
        console.error("Failed to load costs summary", err);
      })
      .finally(() => {
        if (!cancelled) setLoadingCosts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, unit?.id, propertyId, settlementYear]);

  async function unassignTenant() {
    if (!unit) return;
    if (!confirm(`Are you sure you want to unassign ${unit.active_tenant_name} and end the active lease?`)) return;
    setSaving(true);
    try {
      await api("POST", `/api/units/${unit.id}/unassign-tenant`);
      setStatus("vacant");
      setIsChangingTenant(false);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const willAssignTenant =
        (selectedTenantMode === "existing" && selectedTenantId) ||
        (selectedTenantMode === "new" && newFirstName.trim() && newLastName.trim());

      const finalStatus = willAssignTenant ? "occupied" : status;

      const payload = {
        property_id: propertyId,
        name: name.trim(),
        type,
        bedrooms: parseFloat(bedrooms) || 0,
        bathrooms: parseFloat(bathrooms) || 0,
        sqft: sqft ? parseInt(sqft, 10) : null,
        market_rent: parseFloat(marketRent) || 0,
        monthly_operating_cost: parseFloat(monthlyOperatingCost) || 0,
        status: finalStatus,
        notes: notes.trim() || null,
      };

      let savedUnit: Unit;
      if (unit) {
        savedUnit = await app.updateUnit(unit.id, payload);
      } else {
        savedUnit = await app.createUnit(payload);
      }

      // Sync active lease rent and operating prepayments if unit is already leased
      if (unit?.active_lease_id && !willAssignTenant) {
        await app.updateLease(unit.active_lease_id, {
          monthly_rent: parseFloat(marketRent) || 0,
          operating_cost_advance: parseFloat(monthlyOperatingCost) || 0,
        });
      }

      // Handle tenant assignment if requested
      if (willAssignTenant) {
        let tenantIdToAssign: number;

        if (selectedTenantMode === "new") {
          const createdTenant = await app.createTenant({
            first_name: newFirstName.trim(),
            last_name: newLastName.trim(),
            email: newEmail.trim() || null,
            phone: newPhone.trim() || null,
          });
          tenantIdToAssign = createdTenant.id;
        } else {
          tenantIdToAssign = Number(selectedTenantId);
        }

        await api("POST", `/api/units/${savedUnit.id}/assign-tenant`, {
          tenant_id: tenantIdToAssign,
          start_date: leaseStart,
          end_date: leaseEnd,
          monthly_rent: parseFloat(leaseRent) || savedUnit.market_rent || 0,
          operating_cost_advance: parseFloat(operatingAdvance) || 0,
          heating_cost_advance: parseFloat(heatingAdvance) || 0,
        });
      }

      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!unit) return;
    try {
      await app.deleteUnit(unit.id);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  const currency = app.settings.currency || "EUR";
  const hasActiveTenant = !!unit?.active_tenant_name && !isChangingTenant;
  const unitBreakdown = costsSummary?.units.find((u) => u.unit_id === unit?.id);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{unit ? `Edit ${unit.name}` : "New unit"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-1">
            {/* Basic unit specs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="unit-name">Unit Name / Number</Label>
                <Input
                  id="unit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Apt 1, Store Ground Floor"
                />
              </div>
              <div>
                <Label>Unit Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="residential">Residential (Wohnung)</SelectItem>
                    <SelectItem value="commercial">Commercial (Gewerbe / Laden)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="unit-beds">Bedrooms</Label>
                <Input
                  id="unit-beds"
                  type="number"
                  step="0.5"
                  value={bedrooms}
                  onChange={(e) => setBedrooms(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="unit-baths">Bathrooms</Label>
                <Input
                  id="unit-baths"
                  type="number"
                  step="0.5"
                  value={bathrooms}
                  onChange={(e) => setBathrooms(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="unit-sqft">Floor Space (m² / sqft)</Label>
                <Input
                  id="unit-sqft"
                  type="number"
                  placeholder="e.g. 75"
                  value={sqft}
                  onChange={(e) => setSqft(e.target.value)}
                />
              </div>
            </div>

            {/* Occupancy Status & Warm Rent Header Preview */}
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <Label>Occupancy Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as UnitStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col justify-end">
                <Label className="text-xs text-muted-foreground pb-1">Warm Rent Preview</Label>
                <div className="flex h-9 items-center justify-between rounded-md border border-input bg-primary/5 px-3 py-1 text-sm font-semibold font-mono text-primary">
                  <span className="text-xs font-normal text-muted-foreground">Warmmiete:</span>
                  <span>{formatMoney((parseFloat(marketRent) || 0) + (parseFloat(monthlyOperatingCost) || 0), currency)}/mo</span>
                </div>
              </div>
            </div>

            {/* Monthly Rent & Operating Prepayments (3 Columns) */}
            <div className="rounded-lg border bg-muted/10 p-3 space-y-2">
              <div className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Monthly Rent & Operating Prepayment (Miete & Nebenkosten)</span>
                <span className="text-[11px] font-normal text-muted-foreground">Base recurring rate</span>
              </div>
              <div className="grid grid-cols-3 gap-2.5 items-end">
                <div className="flex flex-col justify-end">
                  <Label htmlFor="unit-rent" className="text-xs min-h-[2rem] flex items-end pb-1 font-medium">
                    Cold Rent / Kaltmiete ({currency})
                  </Label>
                  <Input
                    id="unit-rent"
                    type="number"
                    value={marketRent}
                    onChange={(e) => {
                      setMarketRent(e.target.value);
                      if (!leaseRent || leaseRent === "0") setLeaseRent(e.target.value);
                    }}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <Label htmlFor="unit-op-cost" className="text-xs min-h-[2rem] flex items-end pb-1 font-medium">
                    Monthly Nebenkosten ({currency})
                  </Label>
                  <Input
                    id="unit-op-cost"
                    type="number"
                    value={monthlyOperatingCost}
                    onChange={(e) => {
                      setMonthlyOperatingCost(e.target.value);
                      if (!operatingAdvance || operatingAdvance === "0") setOperatingAdvance(e.target.value);
                    }}
                    placeholder="0"
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="flex flex-col justify-end">
                  <Label className="text-xs min-h-[2rem] flex items-end pb-1 font-medium text-muted-foreground">
                    Total Gross (Warmmiete)
                  </Label>
                  <div className="flex h-8 w-full items-center justify-center rounded-md border border-input bg-muted/30 px-2 text-xs font-bold font-mono text-foreground">
                    {formatMoney((parseFloat(marketRent) || 0) + (parseFloat(monthlyOperatingCost) || 0), currency)}
                    <span className="text-[10px] font-normal text-muted-foreground ml-1">/mo</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── TENANT ASSIGNMENT SECTION ────────────────────────────────── */}
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-sm">Tenant & Occupancy</span>
                </div>
                {unit?.active_lease_id && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setFullLeaseOpen(true)}
                  >
                    <FileText className="h-3.5 w-3.5" /> Full Lease
                  </Button>
                )}
              </div>

              {hasActiveTenant ? (
                /* Unit currently has an active tenant */
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-md border bg-card p-3">
                    <div className="flex items-center gap-2.5">
                      <div className="rounded-full bg-primary/10 p-2 text-primary">
                        <UserCheck className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{unit.active_tenant_name}</p>
                        <p className="text-xs text-muted-foreground">Active lease holder</p>
                      </div>
                    </div>
                    <Badge variant="default" className="text-xs">
                      Occupied
                    </Badge>
                  </div>

                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsChangingTenant(true)}
                      className="text-xs"
                    >
                      Change Tenant
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={unassignTenant}
                      disabled={saving}
                      className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      Unassign / End Lease
                    </Button>
                  </div>
                </div>
              ) : (
                /* Unit is vacant or user clicked 'Change Tenant' */
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Select a Tenant to Assign to this Unit</Label>
                    <div className="mt-1 flex gap-2">
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                        value={
                          selectedTenantMode === "new"
                            ? "__new__"
                            : selectedTenantMode === "existing"
                            ? selectedTenantId
                            : "__none__"
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === "__none__") {
                            setSelectedTenantMode("none");
                            setSelectedTenantId("");
                          } else if (val === "__new__") {
                            setSelectedTenantMode("new");
                            setSelectedTenantId("");
                          } else {
                            setSelectedTenantMode("existing");
                            setSelectedTenantId(val);
                            if (!leaseRent || leaseRent === "0") setLeaseRent(marketRent);
                          }
                        }}
                      >
                        <option value="__none__">-- None (Keep Vacant) --</option>
                        <option value="__new__">+ Quick Add New Tenant...</option>
                        {tenants.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.first_name} {t.last_name} {t.email ? `(${t.email})` : ""}
                          </option>
                        ))}
                      </select>

                      {isChangingTenant && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsChangingTenant(false)}
                          className="text-xs"
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Quick Add New Tenant Form */}
                  {selectedTenantMode === "new" && (
                    <div className="rounded-md border bg-card p-3 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                        <UserPlus className="h-3.5 w-3.5" /> Quick New Tenant Details
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label htmlFor="new-first" className="text-xs">
                            First Name *
                          </Label>
                          <Input
                            id="new-first"
                            value={newFirstName}
                            onChange={(e) => setNewFirstName(e.target.value)}
                            placeholder="e.g. Anna"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label htmlFor="new-last" className="text-xs">
                            Last Name *
                          </Label>
                          <Input
                            id="new-last"
                            value={newLastName}
                            onChange={(e) => setNewLastName(e.target.value)}
                            placeholder="e.g. Schmidt"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label htmlFor="new-email" className="text-xs">
                            Email
                          </Label>
                          <Input
                            id="new-email"
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="anna@example.com"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label htmlFor="new-phone" className="text-xs">
                            Phone
                          </Label>
                          <Input
                            id="new-phone"
                            value={newPhone}
                            onChange={(e) => setNewPhone(e.target.value)}
                            placeholder="+49 170 1234567"
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Lease Terms if a tenant is being assigned */}
                  {(selectedTenantMode === "existing" || selectedTenantMode === "new") && (
                    <div className="rounded-md border bg-card p-3 space-y-3">
                      <p className="text-xs font-semibold text-foreground">
                        Initial Lease Terms & Operating Cost Advances (Nebenkosten)
                      </p>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label htmlFor="lease-start" className="text-xs">
                            Start Date
                          </Label>
                          <Input
                            id="lease-start"
                            type="date"
                            value={leaseStart}
                            onChange={(e) => setLeaseStart(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label htmlFor="lease-end" className="text-xs">
                            End Date
                          </Label>
                          <Input
                            id="lease-end"
                            type="date"
                            value={leaseEnd}
                            onChange={(e) => setLeaseEnd(e.target.value)}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2.5 items-end">
                        <div className="flex flex-col justify-end">
                          <Label htmlFor="lease-rent" className="text-xs min-h-[2rem] flex items-end pb-1 font-medium">
                            Cold Rent ({currency})
                          </Label>
                          <Input
                            id="lease-rent"
                            type="number"
                            value={leaseRent || marketRent}
                            onChange={(e) => setLeaseRent(e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <Label htmlFor="lease-op" className="text-xs min-h-[2rem] flex items-end pb-1 font-medium">
                            Operating Adv. ({currency})
                          </Label>
                          <Input
                            id="lease-op"
                            type="number"
                            placeholder="0"
                            value={operatingAdvance}
                            onChange={(e) => setOperatingAdvance(e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                        <div className="flex flex-col justify-end">
                          <Label htmlFor="lease-heat" className="text-xs min-h-[2rem] flex items-end pb-1 font-medium">
                            Heating Adv. ({currency})
                          </Label>
                          <Input
                            id="lease-heat"
                            type="number"
                            placeholder="0"
                            value={heatingAdvance}
                            onChange={(e) => setHeatingAdvance(e.target.value)}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>

                      <p className="text-[11px] text-muted-foreground">
                        Saving will create an active lease and automatically set this unit to{" "}
                        <span className="font-semibold text-foreground">Occupied</span>.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── YEARLY OPERATING COST SETTLEMENT COMPARISON ──────────────── */}
            {unit && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-primary" />
                    <div>
                      <h4 className="font-semibold text-sm">Yearly Operating Cost Settlement (Nebenkosten)</h4>
                      <p className="text-[11px] text-muted-foreground">
                        Comparison of tenant prepayments vs. space-allocated yearly expenses
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="settlement-year" className="text-xs text-muted-foreground">Year:</Label>
                    <select
                      id="settlement-year"
                      className="h-7 rounded border border-input bg-background px-2 text-xs font-mono"
                      value={settlementYear}
                      onChange={(e) => setSettlementYear(Number(e.target.value))}
                    >
                      {[2024, 2025, 2026, 2027].map((yr) => (
                        <option key={yr} value={yr}>{yr}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {loadingCosts ? (
                  <div className="py-4 text-center text-xs text-muted-foreground">Loading operating cost settlement...</div>
                ) : unitBreakdown ? (
                  <div className="space-y-3">
                    {/* Share info */}
                    <div className="flex items-center justify-between text-xs bg-muted/30 rounded px-2.5 py-1.5 border">
                      <span className="text-muted-foreground">
                        Floor Space: <strong className="text-foreground font-mono">{unitBreakdown.sqft} m²</strong>
                        {costsSummary && costsSummary.total_sqft > 0 && (
                          <span> ({unitBreakdown.sqft_share_pct}% of total {costsSummary.total_sqft} m²)</span>
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        Status: <strong className="text-foreground">{unitBreakdown.is_vacant ? "Vacant (Leerstand)" : unitBreakdown.tenant_name || "Occupied"}</strong>
                      </span>
                    </div>

                    {/* 3 Metrics Cards */}
                    <div className="grid grid-cols-3 gap-2">
                      {/* Metric 1: Prepayments Paid */}
                      <div className="rounded-md border bg-muted/15 p-2.5 flex flex-col justify-between">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                          Paid by Tenant
                        </span>
                        <div className="my-1 text-base font-bold font-mono tabular-nums text-foreground">
                          {formatMoney(unitBreakdown.annual_advance, currency)}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          {formatMoney(unitBreakdown.monthly_advance, currency)}/mo × 12
                        </span>
                      </div>

                      {/* Metric 2: Actual Costs */}
                      <div className="rounded-md border bg-muted/15 p-2.5 flex flex-col justify-between">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                          Actual Yearly Cost
                        </span>
                        <div className="my-1 text-base font-bold font-mono tabular-nums text-foreground">
                          {formatMoney(unitBreakdown.allocated_cost, currency)}
                        </div>
                        <span className="text-[10px] text-muted-foreground">
                          Space apportioned share
                        </span>
                      </div>

                      {/* Metric 3: Difference / Balance */}
                      <div
                        className={cn(
                          "rounded-md border p-2.5 flex flex-col justify-between",
                          unitBreakdown.is_vacant
                            ? "bg-muted/30 border-muted"
                            : unitBreakdown.balance < 0
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-300"
                            : unitBreakdown.balance > 0
                            ? "bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-300"
                            : "bg-muted/20"
                        )}
                      >
                        <span className="text-[10px] uppercase font-semibold tracking-wider">
                          {unitBreakdown.is_vacant
                            ? "Vacancy Cost"
                            : unitBreakdown.balance < 0
                            ? "Tenant Gets Back"
                            : unitBreakdown.balance > 0
                            ? "Tenant Needs to Pay"
                            : "Difference"}
                        </span>
                        <div className="my-1 text-base font-bold font-mono tabular-nums">
                          {unitBreakdown.is_vacant
                            ? formatMoney(unitBreakdown.allocated_cost, currency)
                            : unitBreakdown.balance < 0
                            ? `-${formatMoney(Math.abs(unitBreakdown.balance), currency)}`
                            : unitBreakdown.balance > 0
                            ? `+${formatMoney(unitBreakdown.balance, currency)}`
                            : "€0.00"}
                        </div>
                        <span className="text-[10px] font-medium">
                          {unitBreakdown.is_vacant
                            ? "Absorbed by landlord"
                            : unitBreakdown.balance < 0
                            ? "Guthaben (Refund owed)"
                            : unitBreakdown.balance > 0
                            ? "Nachzahlung (Balance due)"
                            : "Settled"}
                        </span>
                      </div>
                    </div>

                    {/* Explanatory sentence banner */}
                    <div
                      className={cn(
                        "rounded-md p-2.5 text-xs flex items-start gap-2",
                        unitBreakdown.is_vacant
                          ? "bg-muted/40 text-muted-foreground border"
                          : unitBreakdown.balance < 0
                          ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                          : unitBreakdown.balance > 0
                          ? "bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                          : "bg-muted/40 text-muted-foreground border"
                      )}
                    >
                      {unitBreakdown.is_vacant ? (
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                      ) : unitBreakdown.balance < 0 ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                      )}
                      <div>
                        {costsSummary && costsSummary.costs.length === 0 ? (
                          <p>
                            No property expenses entered yet for {settlementYear}. Enter building invoices (heating, water, trash, taxes) in the property Operating Costs section to compute the yearly reconciliation.
                          </p>
                        ) : unitBreakdown.is_vacant ? (
                          <p>
                            This unit was vacant. The space-apportioned operating cost of{" "}
                            <strong>{formatMoney(unitBreakdown.allocated_cost, currency)}</strong> is covered by the owner.
                          </p>
                        ) : unitBreakdown.balance < 0 ? (
                          <p>
                            The tenant paid <strong>{formatMoney(unitBreakdown.annual_advance, currency)}</strong> in advances against{" "}
                            <strong>{formatMoney(unitBreakdown.allocated_cost, currency)}</strong> in actual costs. The tenant{" "}
                            <strong className="underline">gets back {formatMoney(Math.abs(unitBreakdown.balance), currency)}</strong> (Guthaben).
                          </p>
                        ) : unitBreakdown.balance > 0 ? (
                          <p>
                            The tenant paid <strong>{formatMoney(unitBreakdown.annual_advance, currency)}</strong> in advances against{" "}
                            <strong>{formatMoney(unitBreakdown.allocated_cost, currency)}</strong> in actual costs. The tenant{" "}
                            <strong className="underline">needs to pay an additional {formatMoney(unitBreakdown.balance, currency)}</strong> (Nachzahlung) to cover the yearly cost.
                          </p>
                        ) : (
                          <p>Prepayments matched the actual yearly costs exactly.</p>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => {
                          setStatementUnitBreakdown(unitBreakdown);
                          setStatementDialogOpen(true);
                        }}
                      >
                        <FileText className="h-3.5 w-3.5" /> View Itemized Statement (Abrechnung)
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="py-2 text-center text-xs text-muted-foreground">
                    No operating costs data available for {settlementYear}.
                  </div>
                )}
              </div>
            )}

            <div>
              <Label htmlFor="unit-notes">Notes</Label>
              <Textarea
                id="unit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Internal notes about the unit..."
              />
            </div>
          </div>

          <DialogFooter className="mt-3">
            {unit && (
              <Button
                type="button"
                variant="destructive"
                className="sm:mr-auto"
                onClick={() => setConfirming(true)}
              >
                Delete Unit
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save} disabled={saving || !name.trim()}>
              {saving ? "Saving..." : unit ? "Save Changes" : "Create Unit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {unit && (
        <ConfirmDelete
          open={confirming}
          onOpenChange={setConfirming}
          title={`Delete unit "${unit.name}"?`}
          description="Its leases and rent history will be permanently deleted. This action cannot be undone."
          onConfirm={remove}
        />
      )}

      {/* Full lease dialog fallback */}
      {unit?.active_lease_id && (
        <LeaseDialog
          open={fullLeaseOpen}
          onOpenChange={(o) => {
            setFullLeaseOpen(o);
            if (!o) onSaved?.();
          }}
          defaults={{ unit_id: unit.id }}
          onSaved={() => {
            setFullLeaseOpen(false);
            onSaved?.();
          }}
        />
      )}

      {/* Nebenkosten itemized statement dialog */}
      {statementUnitBreakdown && costsSummary && (
        <NebenkostenStatementDialog
          open={statementDialogOpen}
          onOpenChange={setStatementDialogOpen}
          unit={statementUnitBreakdown}
          propertyName={costsSummary.property_name}
          year={settlementYear}
          totalPropertySqft={costsSummary.total_sqft}
        />
      )}
    </>
  );
}
