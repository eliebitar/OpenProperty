import { useRef } from "react";
import { Printer, Download, Building2, User, Calendar, Home } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { UnitOperatingCostBreakdown } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unit: UnitOperatingCostBreakdown | null;
  propertyName: string;
  year: number;
  totalPropertySqft: number;
}

export function NebenkostenStatementDialog({
  open,
  onOpenChange,
  unit,
  propertyName,
  year,
  totalPropertySqft,
}: Props) {
  const app = useApp();
  const printRef = useRef<HTMLDivElement>(null);

  if (!unit) return null;

  const currency = app.settings.currency || "EUR";
  const isNachzahlung = unit.balance > 0;
  const isGuthaben = unit.balance < 0;

  function handlePrint() {
    window.print();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="print:hidden">
          <div className="flex items-center justify-between">
            <DialogTitle>Operating Cost Statement (Nebenkostenabrechnung {year})</DialogTitle>
            <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" /> Print / PDF
            </Button>
          </div>
        </DialogHeader>

        {/* Printable Statement Document */}
        <div ref={printRef} className="space-y-6 p-2 text-sm text-foreground">
          {/* Statement Header */}
          <div className="border-b pb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-bold tracking-tight">Nebenkostenabrechnung {year}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Annual Statement of Operating Costs according to § 556 BGB & BetrKV
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p className="font-semibold text-foreground">{propertyName}</p>
                <p>Billing Period: 01.01.{year} – 31.12.{year}</p>
                <p>Date: {new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Unit & Tenant Summary Box */}
          <div className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/20 p-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Home className="h-3.5 w-3.5" /> Unit Information
              </div>
              <p className="font-semibold text-base flex items-center gap-2">
                {unit.unit_name}
                <Badge variant={unit.unit_type === "commercial" ? "secondary" : "outline"} className="text-xs">
                  {unit.unit_type === "commercial" ? "Commercial (Gewerbe)" : "Residential (Wohnen)"}
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground">
                Floor space: <span className="font-medium text-foreground">{unit.sqft} m²</span> ({unit.sqft_share_pct}% of total {totalPropertySqft} m²)
              </p>
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <User className="h-3.5 w-3.5" /> Tenant / Occupant
              </div>
              <p className="font-semibold text-base">
                {unit.tenant_name || (
                  <span className="italic text-muted-foreground">Vacant (Owner absorbed)</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                Monthly Advance: <span className="font-medium text-foreground">{formatMoney(unit.monthly_advance, currency)}/mo</span>
                {unit.heating_cost_advance > 0 && ` (Heating: ${formatMoney(unit.heating_cost_advance, currency)})`}
              </p>
            </div>
          </div>

          {/* Itemized Cost Allocation Table */}
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Itemized Cost Apportionment (Umlage nach Fläche)
            </h2>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b text-muted-foreground font-medium">
                  <tr>
                    <th className="py-2.5 px-3">Cost Type (Kostenart)</th>
                    <th className="py-2.5 px-3 text-right">Building Total</th>
                    <th className="py-2.5 px-3 text-center">Apportionment Key</th>
                    <th className="py-2.5 px-3 text-right font-semibold">Your Share</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {unit.cost_items.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-center text-muted-foreground">
                        No property costs recorded for {year}.
                      </td>
                    </tr>
                  ) : (
                    unit.cost_items.map((item, idx) => (
                      <tr key={idx} className={item.is_commercial_only ? "bg-amber-50/30 dark:bg-amber-950/10" : ""}>
                        <td className="py-2 px-3 font-medium">
                          {item.cost_type}
                          {item.is_commercial_only && (
                            <span className="ml-1.5 inline-block text-[10px] text-amber-600 dark:text-amber-400 font-normal">
                              (Vorwegabzug)
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                          {formatMoney(item.total_property_amount, currency)}
                        </td>
                        <td className="py-2 px-3 text-center text-muted-foreground text-[11px]">
                          {item.allocation_key}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium">
                          {formatMoney(item.unit_share_amount, currency)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="border-t bg-muted/30 font-semibold">
                  <tr>
                    <td colSpan={3} className="py-2.5 px-3">Total Allocated Operating Costs</td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-sm">
                      {formatMoney(unit.allocated_cost, currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Statement Calculation & Settlement */}
          <div className="rounded-lg border p-4 space-y-3 bg-card">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Abrechnungsergebnis (Settlement Summary)
            </h2>
            <div className="space-y-2 text-sm divide-y">
              <div className="flex justify-between items-center py-1">
                <span>Total Actual Costs for Unit:</span>
                <span className="font-mono font-semibold">{formatMoney(unit.allocated_cost, currency)}</span>
              </div>
              <div className="flex justify-between items-center py-1 text-muted-foreground">
                <span>Less: Advance Payments Paid (Vorauszahlungen):</span>
                <span className="font-mono font-medium text-foreground">
                  - {formatMoney(unit.annual_advance, currency)}
                </span>
              </div>
              <div className="flex justify-between items-center pt-2 text-base font-bold">
                <div>
                  <span>Settlement Balance:</span>
                  <p className="text-xs font-normal text-muted-foreground">
                    {isNachzahlung && "Payment required by tenant within 30 days (Nachzahlung)"}
                    {isGuthaben && "Credit / refund will be paid to tenant (Guthaben)"}
                    {!isNachzahlung && !isGuthaben && "Account fully settled"}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`font-mono text-lg ${
                      isNachzahlung
                        ? "text-red-600 dark:text-red-400"
                        : isGuthaben
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-foreground"
                    }`}
                  >
                    {isNachzahlung ? `+ ${formatMoney(unit.balance, currency)}` : ""}
                    {isGuthaben ? `- ${formatMoney(Math.abs(unit.balance), currency)}` : ""}
                    {!isNachzahlung && !isGuthaben ? formatMoney(0, currency) : ""}
                  </span>
                  <div>
                    <Badge
                      variant={isNachzahlung ? "destructive" : isGuthaben ? "default" : "outline"}
                      className="text-[11px] mt-1"
                    >
                      {isNachzahlung ? "Nachzahlung (Owed by Tenant)" : isGuthaben ? "Guthaben (Refund to Tenant)" : "Ausgeglichen"}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Legal note footer for print */}
          <div className="text-[11px] text-muted-foreground pt-4 border-t">
            <p>
              Hinweis: Einwendungen gegen diese Abrechnung sind dem Vermieter gemäß § 556 Abs. 3 BGB spätestens bis zum Ablauf des zwölften Monats nach Zugang dieser Abrechnung mitzuteilen.
            </p>
          </div>
        </div>

        <DialogFooter className="print:hidden">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={handlePrint} className="gap-1.5">
            <Printer className="h-4 w-4" /> Print Statement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
