import { useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Home,
  KeyRound,
  Plus,
  Search,
  Sparkles,
  Users,
  Wrench,
  Receipt,
  Share2,
  ChevronRight,
  AlertCircle,
  Building2,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { useApp } from "@/context";
import { cn, formatDate, formatMoney, toIsoDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageShell } from "@/components/page-shell";
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
import { BookingDialog } from "./booking-dialog";
import { GuestPackDialog } from "./guest-pack-dialog";
import { TurnoverCleanersTab } from "./turnover-cleaners-tab";
import type { AirbnbAnalytics, AirbnbBooking, BookingStatus, Unit } from "@/types";

const PLATFORM_BADGES: Record<string, { label: string; tone: string }> = {
  airbnb: { label: "Airbnb", tone: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30" },
  vrbo: { label: "VRBO", tone: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30" },
  booking_com: { label: "Booking.com", tone: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  direct: { label: "Direct", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
  other: { label: "Other", tone: "bg-muted text-muted-foreground" },
};

const STATUS_TONES: Record<BookingStatus, string> = {
  confirmed: "bg-info-tint text-info border-info/30",
  checked_in: "bg-success-tint text-success border-success/30 font-semibold",
  checked_out: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive-tint text-destructive border-destructive/30",
};

export function AirbnbPage({ navigate }: { navigate?: (to: string) => void }) {
  const app = useApp();
  const [bookings, setBookings] = useState<AirbnbBooking[]>([]);
  const [analytics, setAnalytics] = useState<AirbnbAnalytics | null>(null);
  const [airbnbUnits, setAirbnbUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"bookings" | "turnovers" | "units">("bookings");

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Dialogs
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<AirbnbBooking | undefined>(undefined);
  const [defaultUnitId, setDefaultUnitId] = useState<number | undefined>(undefined);
  const [guestPackOpen, setGuestPackOpen] = useState(false);
  const [guestPackBooking, setGuestPackBooking] = useState<AirbnbBooking | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [confirmDemoOpen, setConfirmDemoOpen] = useState(false);
  const [deletingDemo, setDeletingDemo] = useState(false);

  async function handleDeleteDemo() {
    try {
      setDeletingDemo(true);
      const res = await app.deleteDemoData();
      await loadData();
      setActionSuccess(res.message);
      setTimeout(() => setActionSuccess(null), 4000);
      setConfirmDemoOpen(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setDeletingDemo(false);
    }
  }

  async function loadData() {
    try {
      setLoading(true);
      const [bList, aData, uList] = await Promise.all([
        app.listAirbnbBookings({
          property_id: propertyFilter !== "all" ? parseInt(propertyFilter, 10) : undefined,
        }),
        app.getAirbnbAnalytics(propertyFilter !== "all" ? parseInt(propertyFilter, 10) : undefined),
        app.listUnits(propertyFilter !== "all" ? parseInt(propertyFilter, 10) : undefined),
      ]);
      setBookings(bList);
      setAnalytics(aData);
      setAirbnbUnits(uList.filter((u) => u.type === "airbnb"));
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyFilter, app.activeOrganization?.id]);

  // Filtered bookings
  const filteredBookings = useMemo(() => {
    const today = toIsoDate(new Date());
    return bookings.filter((b) => {
      // Status filter
      if (statusFilter === "upcoming") {
        if (b.booking_status === "cancelled" || b.check_in_date < today) return false;
      } else if (statusFilter === "checked_in") {
        if (b.booking_status !== "checked_in") return false;
      } else if (statusFilter === "checked_out") {
        if (b.booking_status !== "checked_out") return false;
      } else if (statusFilter === "cancelled") {
        if (b.booking_status !== "cancelled") return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesGuest = b.guest_name.toLowerCase().includes(q);
        const matchesCode = (b.confirmation_code ?? "").toLowerCase().includes(q);
        const matchesUnit = (b.unit_name ?? "").toLowerCase().includes(q);
        if (!matchesGuest && !matchesCode && !matchesUnit) return false;
      }

      return true;
    });
  }, [bookings, statusFilter, searchQuery]);

  // Turnovers due today or tomorrow
  const turnoversDue = useMemo(() => {
    const today = toIsoDate(new Date());
    const tomorrow = toIsoDate(new Date(Date.now() + 86400000));
    return bookings.filter(
      (b) =>
        (b.check_out_date === today || b.check_out_date === tomorrow) &&
        b.booking_status !== "cancelled",
    );
  }, [bookings]);

  async function handleScheduleCleaning(b: AirbnbBooking) {
    try {
      await app.scheduleTurnoverCleaning(b.id);
      setActionSuccess(`Turnover cleaning scheduled for ${b.unit_name} on ${b.check_out_date}!`);
      setTimeout(() => setActionSuccess(null), 4000);
      loadData();
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  async function handleQuickStatusChange(bookingId: number, newStatus: BookingStatus) {
    try {
      await app.updateAirbnbBooking(bookingId, { booking_status: newStatus });
      loadData();
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  async function handleMarkPayoutReceived(bookingId: number) {
    try {
      await app.updateAirbnbBooking(bookingId, {
        payout_status: "received",
        payout_date: toIsoDate(new Date()),
      });
      loadData();
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  return (
    <PageShell
      title="Airbnb & Short-Term Rentals"
      meta="Portfolio reservations, turnovers, guest welcome packs, and listing earnings"
      actions={
        <div className="flex items-center gap-2">
          {app.properties.length > 0 && (
            <Select value={propertyFilter} onValueChange={setPropertyFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="All Properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Properties</SelectItem>
                {app.properties.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Button
            size="sm"
            onClick={() => {
              setSelectedBooking(undefined);
              setDefaultUnitId(undefined);
              setBookingDialogOpen(true);
            }}
            className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5 h-8 text-xs font-semibold shadow-sm"
          >
            <Plus className="size-3.5" /> New Booking
          </Button>
        </div>
      }
    >
      {/* Toast Notification */}
      {actionSuccess && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-800 dark:text-emerald-300">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* KPI Cards */}
      <section className="grid grid-cols-2 gap-3.5 md:grid-cols-5">
        <KpiCard
          label="Total STR Revenue"
          value={formatMoney(analytics?.total_revenue ?? 0, app.settings.currency)}
          sub={`${bookings.length} reservations`}
          icon={<DollarSign className="size-4 text-emerald-500" />}
        />
        <KpiCard
          label="Average Daily Rate"
          value={formatMoney(analytics?.average_daily_rate ?? 0, app.settings.currency)}
          sub="ADR per night"
          icon={<Receipt className="size-4 text-primary" />}
        />
        <KpiCard
          label="Estimated Occupancy"
          value={`${analytics?.occupancy_rate ?? 0}%`}
          sub="Current 30-day window"
          icon={<Home className="size-4 text-amber-500" />}
        />
        <KpiCard
          label="Active Stays"
          value={String(analytics?.active_stays ?? 0)}
          sub="Guests in-house today"
          icon={<Users className="size-4 text-rose-500" />}
          tone={analytics && analytics.active_stays > 0 ? "positive" : "default"}
        />
        <KpiCard
          label="Upcoming Check-ins"
          value={String(analytics?.upcoming_check_ins_7d ?? 0)}
          sub="Next 7 days"
          icon={<Calendar className="size-4 text-sky-500" />}
        />
      </section>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === "bookings" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("bookings")}
            className={`h-8 rounded-xl text-xs font-semibold gap-1.5 ${
              activeTab === "bookings" ? "bg-rose-600 hover:bg-rose-700 text-white" : ""
            }`}
          >
            <Calendar className="size-3.5" /> Reservations ({bookings.length})
          </Button>
          <Button
            variant={activeTab === "turnovers" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("turnovers")}
            className={`h-8 rounded-xl text-xs font-semibold gap-1.5 ${
              activeTab === "turnovers" ? "bg-teal-600 hover:bg-teal-700 text-white shadow-xs" : ""
            }`}
          >
            <Sparkles className="size-3.5" /> Turnovers & Cleaners
          </Button>
          <Button
            variant={activeTab === "units" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("units")}
            className={`h-8 rounded-xl text-xs font-semibold gap-1.5 ${
              activeTab === "units" ? "bg-primary text-primary-foreground" : ""
            }`}
          >
            <Building2 className="size-3.5" /> Unit Portfolio ({airbnbUnits.length})
          </Button>
        </div>

        {navigate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/cleaner")}
            className="h-8 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-500/10 gap-1.5"
          >
            <Sparkles className="size-3.5" /> Open Cleaner Portal &rarr;
          </Button>
        )}
      </div>

      {/* Tab 1: Turnovers & Cleaners */}
      {activeTab === "turnovers" && (
        <TurnoverCleanersTab airbnbUnits={airbnbUnits} navigate={navigate} />
      )}

      {/* Tab 2: Unit Portfolio */}
      {activeTab === "units" && airbnbUnits.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Building2 className="size-4 text-rose-500" />
              Airbnb Unit Portfolio ({airbnbUnits.length} listing{airbnbUnits.length === 1 ? "" : "s"})
            </h2>
            <div className="flex items-center gap-3">
              {airbnbUnits.some((u) => u.name.includes("Suite 4B") || u.property_name === "Oakwood Estate") && (
                <button
                  type="button"
                  onClick={() => setConfirmDemoOpen(true)}
                  className="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1"
                >
                  <Trash2 className="size-3" /> Delete Dummy Data
                </button>
              )}
              {navigate && (
                <button
                  type="button"
                  onClick={() => navigate("/properties")}
                  className="text-xs font-medium text-primary hover:underline flex items-center gap-0.5"
                >
                  Manage in Properties <ChevronRight className="size-3" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {airbnbUnits.map((u) => {
              const activeBooking = bookings.find(
                (b) =>
                  b.unit_id === u.id &&
                  (b.booking_status === "checked_in" ||
                    (b.booking_status === "confirmed" &&
                      b.check_in_date <= toIsoDate(new Date()) &&
                      b.check_out_date >= toIsoDate(new Date()))),
              );

              const isDemoUnit = u.name.includes("Suite 4B") || u.property_name === "Oakwood Estate";

              return (
                <Card
                  key={u.id}
                  className="p-3.5 space-y-3 relative flex flex-col justify-between cursor-pointer hover:border-rose-500/50 hover:shadow-md transition-all group"
                  onClick={() => navigate?.(`/units/${u.id}`)}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          {navigate ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/units/${u.id}`);
                              }}
                              className="font-semibold text-sm hover:underline hover:text-rose-600 text-left"
                            >
                              {u.name}
                            </button>
                          ) : (
                            <span className="font-semibold text-sm">{u.name}</span>
                          )}
                          <span className="rounded-full bg-rose-500/15 px-2 py-0.2 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                            Airbnb
                          </span>
                          {isDemoUnit && (
                            <span className="rounded-full bg-amber-500/15 px-2 py-0.2 text-[10px] font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/25">
                              Sample
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{u.property_name}</p>
                      </div>

                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize",
                          activeBooking ? "bg-success-tint text-success" : "bg-warning-tint text-warning",
                        )}
                      >
                        {activeBooking ? "Occupied" : u.status}
                      </span>
                    </div>

                    {/* Rates & Specs */}
                    <div className="grid grid-cols-3 gap-1.5 rounded-md border bg-muted/20 p-2 text-xs">
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Nightly Rate</span>
                        <span className="font-mono font-bold text-foreground">
                          {formatMoney(u.airbnb_nightly_rate || u.market_rent || 0, app.settings.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Cleaning Fee</span>
                        <span className="font-mono text-muted-foreground">
                          {formatMoney(u.airbnb_cleaning_fee || 0, app.settings.currency)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-muted-foreground block">Max Guests</span>
                        <span className="font-semibold text-foreground">
                          {u.airbnb_max_guests || 2} guests
                        </span>
                      </div>
                    </div>

                    {/* Access & WiFi Badge preview */}
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                      <span className="flex items-center gap-1">
                        <KeyRound className="size-3 text-rose-500" />
                        Lockbox: <strong className="font-mono text-foreground">{u.airbnb_lockbox_code || "Set in unit"}</strong>
                      </span>
                      {activeBooking && (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                          Guest: {activeBooking.guest_name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-2 border-t mt-auto">
                    <div className="grid grid-cols-2 gap-2 w-full">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setGuestPackBooking(activeBooking || null);
                          setGuestPackOpen(true);
                        }}
                        className="text-xs h-8 gap-1.5 w-full justify-center px-2 shrink"
                        title="View or share Digital Welcome Pack"
                      >
                        <Share2 className="size-3.5 text-primary shrink-0" />
                        <span className="truncate">Welcome Pack</span>
                      </Button>

                      <Button
                        variant="default"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBooking(undefined);
                          setDefaultUnitId(u.id);
                          setBookingDialogOpen(true);
                        }}
                        className="text-xs h-8 gap-1.5 w-full justify-center bg-rose-600 hover:bg-rose-700 text-white px-2 shrink"
                        title="Create a new reservation for this unit"
                      >
                        <Plus className="size-3.5 shrink-0" />
                        <span className="truncate">Book Unit</span>
                      </Button>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate?.(`/units/${u.id}`);
                      }}
                      className="w-full h-7 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 hover:text-rose-700 flex items-center justify-between px-2 font-medium"
                      title="View Unit Details, Stays, Nebenkosten, and Work Orders"
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <Sparkles className="size-3 text-rose-500 shrink-0" />
                        <span>Unit Details & Stays</span>
                      </span>
                      <ChevronRight className="size-3.5 shrink-0" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Tab 3: Reservations & Calendar */}
      {activeTab === "bookings" && (
        <div className="space-y-4">
          {/* Turnover Cleaning Alert Banner if check-outs are due */}
          {turnoversDue.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold text-xs">
                  <Sparkles className="size-4 text-amber-600 dark:text-amber-400" />
                  <span>Turnover Housekeeping Required ({turnoversDue.length} departures)</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab("turnovers")}
                  className="h-6 text-[11px] text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 font-bold"
                >
                  Manage All Turnovers &rarr;
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 pt-1">
                {turnoversDue.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between rounded-md border border-amber-500/20 bg-card p-2.5 text-xs shadow-xs"
                  >
                    <div>
                      <div className="font-semibold text-foreground">{b.unit_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        Guest {b.guest_name} departing {formatDate(b.check_out_date)}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleScheduleCleaning(b)}
                      className="h-7 text-xs gap-1 border-amber-500/40 text-amber-800 dark:text-amber-300 hover:bg-amber-500/20"
                    >
                      <Wrench className="size-3" /> Schedule Clean
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Bookings Table & Controls */}
          <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="inline-flex rounded-md border bg-muted/40 p-1 text-xs font-medium">
            {[
              { id: "all", label: "All Bookings" },
              { id: "upcoming", label: "Upcoming" },
              { id: "checked_in", label: "Checked In" },
              { id: "checked_out", label: "Completed" },
              { id: "cancelled", label: "Cancelled" },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStatusFilter(t.id)}
                className={cn(
                  "rounded-sm px-3 py-1 transition-colors duration-150",
                  statusFilter === t.id
                    ? "bg-card text-foreground font-semibold shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search guest or code…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {filteredBookings.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {bookings.length === 0
              ? "No Airbnb reservations yet. Create your first booking to start tracking guest stays and payouts."
              : "No reservations matched your filter."}
          </Card>
        ) : (
          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent text-xs">
                  <TableHead className="w-[180px]">Guest & Platform</TableHead>
                  <TableHead>Rental Unit</TableHead>
                  <TableHead>Dates & Nights</TableHead>
                  <TableHead>Financials</TableHead>
                  <TableHead>Payout</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBookings.map((b) => {
                  const plat = PLATFORM_BADGES[b.platform] || PLATFORM_BADGES.other;
                  return (
                    <TableRow key={b.id} className="text-xs">
                      {/* Guest & Platform */}
                      <TableCell>
                        <div className="font-semibold text-foreground">{b.guest_name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={cn("rounded-sm border px-1.5 py-0.2 text-[10px] font-semibold", plat.tone)}>
                            {plat.label}
                          </span>
                          {b.confirmation_code && (
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {b.confirmation_code}
                            </span>
                          )}
                        </div>
                      </TableCell>

                      {/* Unit & Property */}
                      <TableCell>
                        <div className="font-medium text-foreground">{b.unit_name}</div>
                        <div className="text-[11px] text-muted-foreground">{b.property_name}</div>
                      </TableCell>

                      {/* Dates */}
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {formatDate(b.check_in_date)} → {formatDate(b.check_out_date)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {b.nights} {b.nights === 1 ? "night" : "nights"} · {b.num_guests} guests
                        </div>
                      </TableCell>

                      {/* Financials */}
                      <TableCell>
                        <div className="font-mono font-bold text-foreground">
                          {formatMoney(b.net_payout, app.settings.currency)}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          Gross: {formatMoney(b.gross_amount, app.settings.currency)}
                        </div>
                      </TableCell>

                      {/* Payout Status */}
                      <TableCell>
                        {b.payout_status === "received" ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                            Paid {b.payout_date ? `(${formatDate(b.payout_date)})` : ""}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleMarkPayoutReceived(b.id)}
                            className="inline-flex items-center rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400 hover:bg-amber-500/30 transition-colors"
                            title="Click to mark payout received"
                          >
                            Pending (Mark Paid)
                          </button>
                        )}
                      </TableCell>

                      {/* Booking Status */}
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize", STATUS_TONES[b.booking_status])}>
                          {b.booking_status.replace("_", " ")}
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setGuestPackBooking(b);
                              setGuestPackOpen(true);
                            }}
                            title="Guest Welcome & Keybox Info"
                            className="h-7 px-2 text-xs"
                          >
                            <KeyRound className="size-3.5 text-rose-500" />
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleScheduleCleaning(b)}
                            title="Schedule Turnover Cleaning"
                            className="h-7 px-2 text-xs"
                          >
                            <Wrench className="size-3.5 text-amber-500" />
                          </Button>

                          {b.booking_status === "confirmed" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQuickStatusChange(b.id, "checked_in")}
                              className="h-7 text-[11px] px-2"
                            >
                              Check In
                            </Button>
                          )}

                          {b.booking_status === "checked_in" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleQuickStatusChange(b.id, "checked_out")}
                              className="h-7 text-[11px] px-2 text-primary"
                            >
                              Check Out
                            </Button>
                          )}

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedBooking(b);
                              setBookingDialogOpen(true);
                            }}
                            className="h-7 text-xs px-2"
                          >
                            Edit
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      </div>
      )}

      {/* Booking Dialog */}
      <BookingDialog
        open={bookingDialogOpen}
        onOpenChange={setBookingDialogOpen}
        booking={selectedBooking}
        defaultUnitId={defaultUnitId}
        onSaved={loadData}
      />

      {/* Guest Pack Dialog */}
      <GuestPackDialog
        open={guestPackOpen}
        onOpenChange={setGuestPackOpen}
        booking={guestPackBooking}
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
                This will delete the 3 sample properties (Oakwood Estate, Honeybee Hideaway, 308 Mission Apartments), the sample Suite 4B Airbnb Loft, and sample bookings.
              </p>
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-900 dark:text-emerald-200">
                ✓ <strong>Your real data is completely safe:</strong> Your real properties (such as <em>Mauerstraße 15</em>), your real Airbnb units, and all real reservations will remain untouched.
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

function KpiCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "default" | "positive" | "warn";
}) {
  return (
    <Card className="p-3.5 shadow-sm space-y-1">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] font-medium">{label}</span>
        {icon}
      </div>
      <div
        className={cn(
          "font-mono text-xl font-bold tracking-tight",
          tone === "positive" && "text-emerald-600 dark:text-emerald-400",
          tone === "warn" && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value}
      </div>
      {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
    </Card>
  );
}
