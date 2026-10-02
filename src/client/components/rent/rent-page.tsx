import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Receipt, Sparkles, ArrowUpRight, Calendar, DollarSign, Home } from "lucide-react";
import { useApp } from "@/context";
import { addMonths, cn, currentPeriod, formatDate, formatMoney, formatPeriod } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaymentDialog } from "./payment-dialog";
import type { ChargeStatus, RentCharge, AirbnbBooking } from "@/types";
import { PageShell } from "@/components/page-shell";

const STATUS_TONE: Record<ChargeStatus, string> = {
  open: "bg-info-tint text-info",
  partial: "bg-warning-tint text-warning",
  paid: "bg-success-tint text-success",
  overdue: "bg-destructive-tint text-destructive",
  waived: "bg-muted text-muted-foreground",
};

const PAYOUT_STATUS_TONE: Record<string, string> = {
  pending: "bg-warning-tint text-warning",
  received: "bg-success-tint text-success",
  refunded: "bg-destructive-tint text-destructive",
};

export function RentPage({ navigate }: { navigate?: (to: string) => void }) {
  const app = useApp();
  const [period, setPeriod] = useState<string>(currentPeriod());
  const [activeTab, setActiveTab] = useState<"leases" | "airbnb">("leases");
  const [charges, setCharges] = useState<RentCharge[]>([]);
  const [airbnbBookings, setAirbnbBookings] = useState<AirbnbBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentTarget, setPaymentTarget] = useState<RentCharge | null>(null);
  const [generating, setGenerating] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const [list, bookings] = await Promise.all([
        app.listCharges(period),
        app.listAirbnbBookings().catch(() => []),
      ]);
      setCharges(list);
      setAirbnbBookings(bookings);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await app.generateCharges(period);
      await load();
      app.setError(res.created ? null : "All active leases already have a charge for this period.");
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  const totals = useMemo(() => {
    const charged = charges.reduce((s, c) => s + (c.amount ?? 0), 0);
    const collected = charges.reduce((s, c) => s + (c.amount_paid ?? 0), 0);
    const outstanding = Math.max(0, charged - collected);
    const overdue = charges
      .filter((c) => c.status === "overdue" || (c.status !== "paid" && c.status !== "waived" && c.due_date < new Date().toISOString().slice(0, 10) && c.amount_paid < c.amount))
      .reduce((s, c) => s + ((c.amount ?? 0) - (c.amount_paid ?? 0)), 0);
    return { charged, collected, outstanding, overdue };
  }, [charges]);

  const periodBookings = useMemo(() => {
    return airbnbBookings.filter((b) => {
      return (
        b.check_in_date.slice(0, 7) === period ||
        b.check_out_date.slice(0, 7) === period
      );
    });
  }, [airbnbBookings, period]);

  const airbnbTotals = useMemo(() => {
    const gross = periodBookings.reduce((s, b) => s + (b.gross_amount ?? 0), 0);
    const hostPayout = periodBookings.reduce((s, b) => s + (b.net_payout ?? 0), 0);
    const paid = periodBookings
      .filter((b) => b.payout_status === "received")
      .reduce((s, b) => s + (b.net_payout ?? 0), 0);
    const pending = periodBookings
      .filter((b) => b.payout_status === "pending")
      .reduce((s, b) => s + (b.net_payout ?? 0), 0);
    return { gross, hostPayout, paid, pending };
  }, [periodBookings]);

  return (
    <PageShell
      title="Rent & Cash Flow"
      meta="Monthly rent charges, collections, and short-term payouts"
      actions={
        <>
          <div className="inline-flex items-center rounded-full bg-muted p-[0.1875rem]">
            <Button variant="ghost" size="icon" onClick={() => setPeriod((p) => addMonths(p, -1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <button
              type="button"
              onClick={() => setPeriod(currentPeriod())}
              className={cn(
                "rounded-sm px-3 py-1 text-sm font-medium transition-colors duration-150",
                period === currentPeriod()
                  ? "bg-card text-foreground shadow-raised"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {formatPeriod(period)}
            </button>
            <Button variant="ghost" size="icon" onClick={() => setPeriod((p) => addMonths(p, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {activeTab === "leases" && charges.length > 0 ? (
            <Button onClick={generate} disabled={generating}>
              <Sparkles className="h-4 w-4" /> Generate charges
            </Button>
          ) : activeTab === "airbnb" ? (
            <Button
              variant="outline"
              className="gap-1 border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
              onClick={() => navigate?.("/airbnb")}
            >
              Airbnb Hub <ArrowUpRight className="h-4 w-4" />
            </Button>
          ) : null}
        </>
      }
    >
        {/* Tab Toggle */}
        <div className="flex items-center gap-2 border-b pb-3 mb-4">
          <button
            type="button"
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150",
              activeTab === "leases"
                ? "bg-primary text-primary-foreground font-semibold shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
            onClick={() => setActiveTab("leases")}
          >
            Long-Term Leases ({charges.length})
          </button>
          <button
            type="button"
            className={cn(
              "px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors duration-150",
              activeTab === "airbnb"
                ? "bg-rose-600 text-white font-semibold shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
            )}
            onClick={() => setActiveTab("airbnb")}
          >
            <Sparkles className="size-3 text-rose-300" /> Airbnb & STR Payouts ({periodBookings.length})
          </button>
        </div>

        {activeTab === "leases" ? (
          <>
            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Charged" value={formatMoney(totals.charged, app.settings.currency)} />
              <Stat label="Collected" value={formatMoney(totals.collected, app.settings.currency)} tone="positive" />
              <Stat
                label="Outstanding"
                value={formatMoney(totals.outstanding, app.settings.currency)}
                tone={totals.outstanding > 0 ? "warn" : "default"}
              />
              <Stat
                label="Overdue"
                value={formatMoney(totals.overdue, app.settings.currency)}
                tone={totals.overdue > 0 ? "danger" : "default"}
              />
            </section>

            {loading ? (
              <Card className="divide-y divide-border overflow-hidden" role="status" aria-label="Loading rent charges">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex h-11 items-center gap-4 px-3" aria-hidden>
                    <div className="h-2.5 w-32 animate-pulse rounded-full bg-muted" />
                    <div className="h-2.5 w-24 animate-pulse rounded-full bg-muted" />
                    <div className="ml-auto h-2.5 w-16 animate-pulse rounded-full bg-muted" />
                  </div>
                ))}
              </Card>
            ) : charges.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
                <Receipt className="size-7 text-faint" aria-hidden />
                <p className="font-medium">No rent charges for {formatPeriod(period)}</p>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  Generate charges from active leases for this month.
                </p>
                <Button className="mt-2" onClick={generate} disabled={generating}>
                  <Sparkles className="size-4" /> Generate charges
                </Button>
              </div>
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property · Unit</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Charged</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {charges.map((c) => {
                      const balance = Math.max(0, (c.amount ?? 0) - (c.amount_paid ?? 0));
                      return (
                        <TableRow key={c.id}>
                          <TableCell>
                            <div className="text-sm">
                              <span className="text-muted-foreground">{c.property_name}</span>
                              <span className="px-1 text-muted-foreground/40">·</span>
                              <span className="font-medium">{c.unit_name}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {c.tenant_first_name ? (
                              <span className="text-sm">{c.tenant_first_name} {c.tenant_last_name}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(c.due_date)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(c.amount, app.settings.currency)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatMoney(c.amount_paid, app.settings.currency)}</TableCell>
                          <TableCell className={cn("text-right tabular-nums font-medium", balance > 0 && "text-warning", c.status === "overdue" && "text-destructive")}>
                            {formatMoney(balance, app.settings.currency)}
                          </TableCell>
                          <TableCell>
                            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_TONE[c.status])}>
                              {c.status}
                            </span>
                          </TableCell>
                          <TableCell>
                            {c.status !== "paid" && c.status !== "waived" && (
                              <Button size="sm" variant="outline" onClick={() => setPaymentTarget(c)}>
                                Record payment
                              </Button>
                            )}
                            {(c.status === "paid" || c.amount_paid > 0) && (
                              <Button size="sm" variant="ghost" onClick={() => setPaymentTarget(c)}>
                                View
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>
            )}
          </>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Stat label="Gross Booking Value" value={formatMoney(airbnbTotals.gross, app.settings.currency)} />
              <Stat label="Net Host Payout" value={formatMoney(airbnbTotals.hostPayout, app.settings.currency)} tone="positive" />
              <Stat label="Payouts Received" value={formatMoney(airbnbTotals.paid, app.settings.currency)} tone="positive" />
              <Stat
                label="Payouts Pending"
                value={formatMoney(airbnbTotals.pending, app.settings.currency)}
                tone={airbnbTotals.pending > 0 ? "warn" : "default"}
              />
            </section>

            {loading ? (
              <Card className="divide-y divide-border overflow-hidden" role="status">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="flex h-11 items-center gap-4 px-3" aria-hidden>
                    <div className="h-2.5 w-32 animate-pulse rounded-full bg-muted" />
                    <div className="ml-auto h-2.5 w-16 animate-pulse rounded-full bg-muted" />
                  </div>
                ))}
              </Card>
            ) : periodBookings.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-20 text-center">
                <Sparkles className="size-7 text-rose-400" aria-hidden />
                <p className="font-medium">No Airbnb bookings for {formatPeriod(period)}</p>
                <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
                  No reservations are scheduled to check in or out during this month.
                </p>
                <Button
                  className="mt-2 bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
                  onClick={() => navigate?.("/airbnb")}
                >
                  Manage Bookings in Airbnb Hub →
                </Button>
              </div>
            ) : (
              <Card className="overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Property · Unit</TableHead>
                      <TableHead>Guest & Code</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Fee</TableHead>
                      <TableHead className="text-right">Host Payout</TableHead>
                      <TableHead>Payout Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periodBookings.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className="text-sm">
                            <span className="text-muted-foreground">{b.property_name}</span>
                            <span className="px-1 text-muted-foreground/40">·</span>
                            <span className="font-medium">{b.unit_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="text-sm font-medium">{b.guest_name}</span>
                            <div className="text-[11px] text-muted-foreground font-mono">
                              {b.confirmation_code || "Direct"} · {b.platform}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {formatDate(b.check_in_date)} → {formatDate(b.check_out_date)}
                          <span className="ml-1 text-[11px] text-muted-foreground/70 font-sans">({b.nights}n)</span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm">
                          {formatMoney(b.gross_amount, app.settings.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          -{formatMoney(b.platform_fee, app.settings.currency)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatMoney(b.net_payout, app.settings.currency)}
                        </TableCell>
                        <TableCell>
                          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize", PAYOUT_STATUS_TONE[b.payout_status] || "bg-muted text-muted-foreground")}>
                            {b.payout_status}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
                            onClick={() => navigate?.("/airbnb")}
                          >
                            Hub →
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            )}
          </>
        )}

      <PaymentDialog
        open={paymentTarget !== null}
        onOpenChange={(o) => { if (!o) setPaymentTarget(null); }}
        charge={paymentTarget}
        onSaved={load}
      />
    </PageShell>
  );
}

function Stat({
  label, value, tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warn" | "danger";
}) {
  return (
    <Card className="p-4">
      <div className="stat-label">{label}</div>
      <div className={cn(
        "mt-1 text-xl font-semibold tabular-nums",
        tone === "positive" && "text-success",
        tone === "warn" && "text-warning",
        tone === "danger" && "text-destructive",
      )}>
        {value}
      </div>
    </Card>
  );
}
