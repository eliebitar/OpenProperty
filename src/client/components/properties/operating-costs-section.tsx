import { useEffect, useState } from "react";
import { Plus, Receipt, Download, FileText, AlertTriangle, Building2, CheckCircle2, ChevronDown, ChevronUp, Pencil } from "lucide-react";
import { api } from "@/api";
import { useApp } from "@/context";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OperatingCostDialog } from "./operating-cost-dialog";
import { NebenkostenStatementDialog } from "./nebenkosten-statement-dialog";
import { UnitDialog } from "./unit-dialog";
import type { OperatingCostsSummary, UnitOperatingCostBreakdown, Unit } from "@/types";

export function OperatingCostsSection({ propertyId }: { propertyId: number }) {
  const app = useApp();
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [summary, setSummary] = useState<OperatingCostsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<UnitOperatingCostBreakdown | null>(null);
  const [statementDialogOpen, setStatementDialogOpen] = useState(false);
  const [showCostsLedger, setShowCostsLedger] = useState(true);
  const [editingSqftUnitId, setEditingSqftUnitId] = useState<number | null>(null);
  const [editingSqftValue, setEditingSqftValue] = useState("");
  const [assigningUnit, setAssigningUnit] = useState<Unit | undefined>(undefined);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  async function openAssignDialog(unitId: number) {
    try {
      const data = await api<{ unit: Unit }>("GET", `/api/units/${unitId}`);
      setAssigningUnit(data.unit);
      setAssignDialogOpen(true);
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  const currency = app.settings.currency || "EUR";

  async function loadSummary() {
    setLoading(true);
    try {
      const data = await api<{ summary: OperatingCostsSummary }>(
        "GET",
        `/api/properties/${propertyId}/operating-costs-summary?year=${year}`
      );
      setSummary(data.summary);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, [propertyId, year]);

  async function generateStatements() {
    if (!summary || summary.costs.length === 0) return;
    setGenerating(true);
    try {
      const res = await api<{ generated: number; year: number }>(
        "POST",
        "/api/nebenkosten-statements/generate",
        { property_id: propertyId, year }
      );
      alert(`Successfully generated and saved ${res.generated} statements for ${res.year}.`);
      loadSummary();
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function deleteCost(id: number) {
    if (!confirm("Are you sure you want to delete this property cost?")) return;
    try {
      await api("DELETE", `/api/operating-costs/${id}`);
      loadSummary();
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  async function saveUnitSpace(unitId: number) {
    const val = parseFloat(editingSqftValue);
    if (isNaN(val) || val < 0) {
      setEditingSqftUnitId(null);
      return;
    }
    try {
      await api("PUT", `/api/units/${unitId}`, { sqft: val });
      setEditingSqftUnitId(null);
      loadSummary();
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  const unitsWithMissingSpace = summary?.units.filter((u) => !u.sqft || u.sqft <= 0) || [];
  const totalAdvancesCollected = summary?.units.reduce((sum, u) => sum + (u.annual_advance || 0), 0) || 0;
  const netTenantBalance = (summary?.total_property_costs || 0) - totalAdvancesCollected;

  return (
    <section className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-[1.125rem] font-semibold leading-tight">
              Operating Costs & Space Allocation (Nebenkosten)
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter total building costs and apportion them to units according to floor space (§ 556a BGB).
            </p>
          </div>
          <select
            className="rounded-md border bg-background px-2.5 py-1 text-sm font-medium focus:ring-1 focus:ring-primary shadow-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[year - 2, year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={generateStatements}
            disabled={generating || !summary || summary.costs.length === 0}
            className="gap-1.5"
          >
            <Download className="h-4 w-4" />
            {generating ? "Calculating..." : "Generate Statements"}
          </Button>
          <Button size="sm" onClick={() => setCostDialogOpen(true)} className="gap-1.5">
            <Plus className="h-4 w-4" /> Enter Property Cost
          </Button>
        </div>
      </div>

      {/* KPI Overview Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="p-3.5">
            <span className="text-xs font-medium text-muted-foreground">Total Property Costs</span>
            <div className="text-xl font-bold font-mono mt-1 text-foreground">
              {formatMoney(summary.total_property_costs, currency)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {summary.costs.length} item{summary.costs.length === 1 ? "" : "s"} entered for {year}
            </p>
          </Card>

          <Card className="p-3.5">
            <span className="text-xs font-medium text-muted-foreground">Total Building Space</span>
            <div className="text-xl font-bold font-mono mt-1 text-foreground">
              {summary.total_sqft} m²
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {summary.total_residential_sqft} m² residential · {summary.total_commercial_sqft} m² commercial
            </p>
          </Card>

          <Card className="p-3.5">
            <span className="text-xs font-medium text-muted-foreground">Cost per Area (Rate)</span>
            <div className="text-xl font-bold font-mono mt-1 text-foreground">
              {formatMoney(summary.cost_per_sqft, currency)} / m²
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              ~ {formatMoney(summary.cost_per_sqft / 12, currency)} / m² / month
            </p>
          </Card>

          <Card className="p-3.5">
            <span className="text-xs font-medium text-muted-foreground">Advances vs. Balance</span>
            <div
              className={`text-xl font-bold font-mono mt-1 ${
                netTenantBalance > 0
                  ? "text-red-600 dark:text-red-400"
                  : netTenantBalance < 0
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-foreground"
              }`}
            >
              {netTenantBalance > 0 ? `+ ${formatMoney(netTenantBalance, currency)}` : formatMoney(netTenantBalance, currency)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Advances paid: {formatMoney(totalAdvancesCollected, currency)}
            </p>
          </Card>
        </div>
      )}

      {/* Warning if any unit is missing square footage */}
      {unitsWithMissingSpace.length > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50/70 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="flex-1">
            <span className="font-semibold">Attention: </span>
            {unitsWithMissingSpace.length} unit{unitsWithMissingSpace.length === 1 ? "" : "s"} (
            {unitsWithMissingSpace.map((u) => u.unit_name).join(", ")}) do not have their floor space (m²)
            configured. Enter the space below so costs are distributed properly.
          </div>
        </div>
      )}

      {/* Unit Apportionment Calculation Table */}
      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3 bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Unit Space Breakdown & Cost Apportionment</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            Calculated automatically per m² based on property expenses
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/50 border-b text-muted-foreground font-medium">
              <tr>
                <th className="py-2.5 px-4">Unit</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Floor Space</th>
                <th className="py-2.5 px-4">Tenant / Occupant</th>
                <th className="py-2.5 px-3 text-right">Apportioned Cost</th>
                <th className="py-2.5 px-3 text-right">Annual Advance</th>
                <th className="py-2.5 px-3 text-right">Settlement Balance</th>
                <th className="py-2.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {!summary || summary.units.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-muted-foreground">
                    No units found in this property.
                  </td>
                </tr>
              ) : (
                summary.units.map((u) => {
                  const isNachzahlung = u.balance > 0;
                  const isGuthaben = u.balance < 0;

                  return (
                    <tr key={u.unit_id} className="hover:bg-muted/30 transition-colors">
                      {/* Unit name */}
                      <td className="py-3 px-4 font-semibold text-foreground">
                        {u.unit_name}
                      </td>

                      {/* Unit type */}
                      <td className="py-3 px-3">
                        <Badge
                          variant={u.unit_type === "commercial" ? "secondary" : "outline"}
                          className="text-[11px] font-normal"
                        >
                          {u.unit_type === "commercial" ? "Commercial (Gewerbe)" : "Residential"}
                        </Badge>
                      </td>

                      {/* Floor space with inline quick-edit */}
                      <td className="py-3 px-3">
                        {editingSqftUnitId === u.unit_id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.1"
                              className="w-16 h-7 rounded border px-1.5 text-xs font-mono bg-background"
                              value={editingSqftValue}
                              onChange={(e) => setEditingSqftValue(e.target.value)}
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveUnitSpace(u.unit_id);
                                if (e.key === "Escape") setEditingSqftUnitId(null);
                              }}
                            />
                            <Button size="sm" className="h-7 px-2 text-xs" onClick={() => saveUnitSpace(u.unit_id)}>
                              Save
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group">
                            {u.sqft > 0 ? (
                              <div>
                                <span className="font-mono font-medium">{u.sqft} m²</span>
                                <span className="text-[10px] text-muted-foreground ml-1.5">
                                  ({u.sqft_share_pct}%)
                                </span>
                              </div>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-medium">Missing</span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingSqftUnitId(u.unit_id);
                                setEditingSqftValue(u.sqft ? String(u.sqft) : "");
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-foreground"
                              title="Edit floor space"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Tenant */}
                      <td className="py-3 px-4">
                        {u.tenant_name ? (
                          <span className="font-medium text-foreground">{u.tenant_name}</span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <span className="italic text-muted-foreground">Vacant</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-[11px] px-2 text-primary hover:text-primary gap-1"
                              onClick={() => openAssignDialog(u.unit_id)}
                            >
                              + Assign
                            </Button>
                          </div>
                        )}
                      </td>

                      {/* Apportioned Cost */}
                      <td className="py-3 px-3 text-right font-mono font-semibold text-foreground">
                        {formatMoney(u.allocated_cost, currency)}
                      </td>

                      {/* Annual Advance */}
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                        {formatMoney(u.annual_advance, currency)}
                        {u.monthly_advance > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            ({formatMoney(u.monthly_advance, currency)}/mo)
                          </div>
                        )}
                      </td>

                      {/* Balance / Result */}
                      <td className="py-3 px-3 text-right">
                        {u.is_vacant ? (
                          <Badge variant="outline" className="text-[11px] text-muted-foreground">
                            {formatMoney(u.allocated_cost, currency)} (Leerstand)
                          </Badge>
                        ) : (
                          <Badge
                            variant={isNachzahlung ? "destructive" : isGuthaben ? "default" : "outline"}
                            className="font-mono text-[11px]"
                          >
                            {isNachzahlung && `+${formatMoney(u.balance, currency)} (Nachzahlung)`}
                            {isGuthaben && `-${formatMoney(Math.abs(u.balance), currency)} (Guthaben)`}
                            {!isNachzahlung && !isGuthaben && "Ausgeglichen"}
                          </Badge>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => {
                            setSelectedUnit(u);
                            setStatementDialogOpen(true);
                          }}
                        >
                          <FileText className="h-3 w-3" /> Statement
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {summary && summary.units.length > 0 && (
              <tfoot className="border-t bg-muted/40 font-semibold text-xs">
                <tr>
                  <td colSpan={2} className="py-2.5 px-4">Total Apportioned</td>
                  <td className="py-2.5 px-3 font-mono">{summary.total_sqft} m² (100%)</td>
                  <td className="py-2.5 px-4 text-muted-foreground">
                    {summary.units.filter((u) => !u.is_vacant).length} Occupied · {summary.units.filter((u) => u.is_vacant).length} Vacant
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-foreground font-bold">
                    {formatMoney(summary.total_property_costs, currency)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                    {formatMoney(totalAdvancesCollected, currency)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold">
                    <span
                      className={
                        netTenantBalance > 0
                          ? "text-red-600 dark:text-red-400"
                          : netTenantBalance < 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : ""
                      }
                    >
                      {netTenantBalance > 0 ? `+${formatMoney(netTenantBalance, currency)}` : formatMoney(netTenantBalance, currency)}
                    </span>
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Property Operating Costs Invoices Ledger */}
      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => setShowCostsLedger(!showCostsLedger)}
          className="w-full border-b px-4 py-3 bg-muted/20 flex items-center justify-between hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">
              Entered Property Invoices & Expenses for Complete Building ({summary?.costs.length || 0})
            </h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{showCostsLedger ? "Hide Ledger" : "Show Ledger"}</span>
            {showCostsLedger ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </button>

        {showCostsLedger && (
          <div className="p-0">
            {!summary || summary.costs.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <Receipt className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="font-medium text-foreground">No property costs entered yet for {year}.</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click "Enter Property Cost" above to add heating, water, property tax, or total invoices.
                </p>
                <Button size="sm" onClick={() => setCostDialogOpen(true)} className="mt-3 gap-1.5">
                  <Plus className="h-4 w-4" /> Enter First Cost
                </Button>
              </div>
            ) : (
              <div className="divide-y text-xs">
                {summary.costs.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3.5 hover:bg-muted/10">
                    <div className="flex items-center gap-3">
                      <div className="rounded-md bg-muted p-2">
                        <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{c.cost_type}</p>
                          {c.is_commercial_only && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300">
                              Commercial Vorwegabzug
                            </Badge>
                          )}
                        </div>
                        {c.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{c.notes}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {formatMoney(c.amount, currency)}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteCost(c.id)}
                        className="text-destructive h-7 text-xs px-2 hover:bg-destructive/10"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between p-3.5 bg-muted/30 font-semibold text-sm">
                  <span>Total Property Expenses ({year})</span>
                  <span className="font-mono text-base font-bold text-foreground">
                    {formatMoney(summary.total_property_costs, currency)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Dialog for adding property costs */}
      <OperatingCostDialog
        open={costDialogOpen}
        onOpenChange={(o) => {
          setCostDialogOpen(o);
          if (!o) loadSummary();
        }}
        propertyId={propertyId}
        year={year}
        onSaved={loadSummary}
      />

      {/* Dialog for viewing / printing an individual unit's Nebenkostenabrechnung */}
      <NebenkostenStatementDialog
        open={statementDialogOpen}
        onOpenChange={setStatementDialogOpen}
        unit={selectedUnit}
        propertyName={summary?.property_name || "Property"}
        year={year}
        totalPropertySqft={summary?.total_sqft || 0}
      />

      {/* Dialog for assigning a tenant to a unit */}
      <UnitDialog
        open={assignDialogOpen}
        onOpenChange={(o) => {
          setAssignDialogOpen(o);
          if (!o) loadSummary();
        }}
        propertyId={propertyId}
        unit={assigningUnit}
        onSaved={loadSummary}
      />
    </section>
  );
}
