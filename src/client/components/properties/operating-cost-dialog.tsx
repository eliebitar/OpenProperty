import { useState } from "react";
import { api } from "@/api";
import { useApp } from "@/context";
import { formatMoney } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: number;
  year: number;
  onSaved?: () => void;
}

const COMMON_CATEGORIES = [
  { key: "Heizung/Warmwasser", label: "Heating & Hot Water (Heizung & Warmwasser)" },
  { key: "Wasser/Abwasser", label: "Water & Sewage (Wasser & Abwasser)" },
  { key: "Grundsteuer", label: "Property Tax (Grundsteuer)" },
  { key: "Straßenreinigung/Müll", label: "Trash & Street Cleaning (Müllabfuhr)" },
  { key: "Versicherungen", label: "Building Insurance (Gebäudeversicherung)" },
  { key: "Hauswart/Gebäudereinigung", label: "Caretaker & Cleaning (Hauswart & Reinigung)" },
  { key: "Beleuchtung", label: "Common Electricity (Allgemeinstrom)" },
  { key: "Aufzug", label: "Elevator (Aufzugswartung)" },
  { key: "Gartenpflege", label: "Grounds / Garden (Gartenpflege)" },
  { key: "Schornsteinreinigung", label: "Chimney Sweeping (Schornsteinfeger)" },
  { key: "Sonstige", label: "Other Allowable Costs (Sonstige Betriebskosten)" },
];

export function OperatingCostDialog({ open, onOpenChange, propertyId, year, onSaved }: Props) {
  const app = useApp();
  const [mode, setMode] = useState<"single" | "sheet">("single");

  // Single mode state
  const [costType, setCostType] = useState("Gesamtkosten (Total)");
  const [amount, setAmount] = useState("");
  const [isCommercialOnly, setIsCommercialOnly] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Sheet mode state
  const [sheetValues, setSheetValues] = useState<Record<string, string>>({});

  function resetForm() {
    setAmount("");
    setNotes("");
    setIsCommercialOnly(false);
    setSheetValues({});
  }

  async function saveSingle(andAddAnother = false) {
    if (!costType || !amount || parseFloat(amount) <= 0) return;
    setSaving(true);
    try {
      await api("POST", "/api/operating-costs", {
        property_id: propertyId,
        year,
        cost_type: costType,
        amount: parseFloat(amount),
        is_commercial_only: isCommercialOnly,
        notes: notes || null,
      });

      resetForm();
      onSaved?.();

      if (!andAddAnother) {
        onOpenChange(false);
      }
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveSheet() {
    const costsToSave = Object.entries(sheetValues)
      .map(([type, val]) => ({
        cost_type: type,
        amount: parseFloat(val),
        is_commercial_only: false,
        notes: `Annual sheet entry ${year}`,
      }))
      .filter((item) => !isNaN(item.amount) && item.amount > 0);

    if (costsToSave.length === 0) return;

    setSaving(true);
    try {
      await api("POST", "/api/operating-costs/batch", {
        property_id: propertyId,
        year,
        costs: costsToSave,
      });

      resetForm();
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const sheetTotal = Object.values(sheetValues).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Enter Costs for Complete Property ({year})</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter the overall expense for the entire building. The system will apportion the costs to individual units based on their space (m² / sqft).
          </p>
        </DialogHeader>

        {/* Mode switcher tabs */}
        <div className="flex border-b text-sm font-medium">
          <button
            type="button"
            className={`pb-2 px-3 border-b-2 transition-colors ${
              mode === "single"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("single")}
          >
            Single Category / Total Lump Sum
          </button>
          <button
            type="button"
            className={`pb-2 px-3 border-b-2 transition-colors ${
              mode === "sheet"
                ? "border-primary text-primary font-semibold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setMode("sheet")}
          >
            Quick Multi-Category Sheet
          </button>
        </div>

        {mode === "single" ? (
          <div className="grid gap-3.5 py-1">
            <div>
              <Label htmlFor="cost-type">Cost Category</Label>
              <select
                id="cost-type"
                className="mt-1 flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={costType}
                onChange={(e) => setCostType(e.target.value)}
              >
                <option value="Gesamtkosten (Total)">Total Operating Costs for Complete Building (Gesamtsumme)</option>
                <optgroup label="Standard BetrKV Categories">
                  {COMMON_CATEGORIES.map((cat) => (
                    <option key={cat.key} value={cat.key}>
                      {cat.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div>
              <Label htmlFor="amount">Building Total Amount ({app.settings.currency || "EUR"})</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="e.g. 8400.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Enter the total invoice or annual cost for the entire property.
              </p>
            </div>

            <div className="flex items-start gap-2.5 rounded-md border p-3 bg-muted/20">
              <input
                type="checkbox"
                id="commercial"
                checked={isCommercialOnly}
                onChange={(e) => setIsCommercialOnly(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input text-primary focus:ring-primary cursor-pointer"
              />
              <div className="space-y-0.5">
                <Label htmlFor="commercial" className="text-sm font-medium cursor-pointer">
                  Commercial Only Expense (Vorwegabzug)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Check if this cost only applies to the commercial space (e.g. shop/store) and should not be charged to residential apartments.
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="notes">Notes / Invoice Reference</Label>
              <Input
                id="notes"
                placeholder="e.g. Invoice #2026-08 Stadtwerke München"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <DialogFooter className="mt-2 flex items-center justify-between sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => saveSingle(true)}
                disabled={saving || !amount || parseFloat(amount) <= 0}
              >
                Save & Add Another
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button onClick={() => saveSingle(false)} disabled={saving || !amount || parseFloat(amount) <= 0}>
                  {saving ? "Saving..." : "Save Cost"}
                </Button>
              </div>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-3 py-1">
            <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
              {COMMON_CATEGORIES.slice(0, 8).map((cat) => (
                <div key={cat.key} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate flex-1 text-xs">{cat.label}</span>
                  <div className="w-36">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="h-8 text-right font-mono text-xs"
                      value={sheetValues[cat.key] || ""}
                      onChange={(e) =>
                        setSheetValues({ ...sheetValues, [cat.key]: e.target.value })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between border-t pt-2 font-semibold text-sm">
              <span>Total Entered:</span>
              <span className="font-mono text-base">{formatMoney(sheetTotal, app.settings.currency || "EUR")}</span>
            </div>

            <DialogFooter className="mt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={saveSheet} disabled={saving || sheetTotal <= 0}>
                {saving ? "Saving..." : "Save All Categories"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
