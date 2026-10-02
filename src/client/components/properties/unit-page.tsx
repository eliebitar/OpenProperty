import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  DollarSign,
  ExternalLink,
  FileText,
  Home,
  KeyRound,
  Mail,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Search,
  Sparkles,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  Wifi,
  Wrench,
  X,
} from "lucide-react";
import { useApp } from "@/context";
import { api } from "@/api";
import { cn, formatDate, formatMoney, toIsoDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDelete } from "@/components/ui/alert-dialog";
import { PageShell } from "@/components/page-shell";
import { UnitDialog } from "./unit-dialog";
import { BookingDialog } from "../airbnb/booking-dialog";
import { GuestPackDialog } from "../airbnb/guest-pack-dialog";
import { WorkOrderDialog } from "../maintenance/work-order-dialog";
import { NebenkostenStatementDialog } from "./nebenkosten-statement-dialog";
import type {
  AirbnbBooking,
  BookingPlatform,
  BookingStatus,
  Lease,
  OperatingCostsSummary,
  PayoutStatus,
  Unit,
  WorkOrder,
} from "@/types";

interface Props {
  id: number;
  propertyId?: number;
  navigate: (to: string) => void;
}

const STATUS_TONE: Record<string, string> = {
  vacant: "bg-warning-tint text-warning",
  occupied: "bg-success-tint text-success",
  turnover: "bg-info-tint text-info",
  unavailable: "bg-muted text-muted-foreground",
};

const BOOKING_STATUS_TONE: Record<BookingStatus, string> = {
  confirmed: "bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-500/30",
  checked_in: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-semibold",
  checked_out: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

const PAYOUT_STATUS_TONE: Record<PayoutStatus, string> = {
  received: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  refunded: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
};

const PLATFORM_BADGE: Record<BookingPlatform, { label: string; tone: string }> = {
  airbnb: { label: "Airbnb", tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25" },
  vrbo: { label: "VRBO", tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25" },
  booking_com: { label: "Booking.com", tone: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25" },
  direct: { label: "Direct", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25" },
  other: { label: "Other", tone: "bg-muted text-muted-foreground border-border" },
};

export function UnitPage({ id, propertyId: initialPropertyId, navigate }: Props) {
  const app = useApp();

  const [unit, setUnit] = useState<Unit | null>(null);
  const [bookings, setBookings] = useState<AirbnbBooking[]>([]);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [operatingSummary, setOperatingSummary] = useState<OperatingCostsSummary | null>(null);
  const [settlementYear, setSettlementYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [editUnitOpen, setEditUnitOpen] = useState(false);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<AirbnbBooking | undefined>(undefined);
  const [guestPackOpen, setGuestPackOpen] = useState(false);
  const [selectedBookingForPack, setSelectedBookingForPack] = useState<AirbnbBooking | undefined>(undefined);
  const [workOrderDialogOpen, setWorkOrderDialogOpen] = useState(false);
  const [statementDialogOpen, setStatementDialogOpen] = useState(false);
  const [deleteBookingId, setDeleteBookingId] = useState<number | null>(null);

  // Copy-to-clipboard state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Guest Stays Table: Filter, Search, and Pagination State
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [payoutFilter, setPayoutFilter] = useState<string>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  function copyText(key: string, text: string) {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  async function load() {
    try {
      setLoading(true);
      const u = await app.getUnit(id);
      setUnit(u);

      const propId = u.property_id || initialPropertyId;
      const [bookingsData, leasesData, woData, opData] = await Promise.all([
        app.listAirbnbBookings({ unit_id: id }).catch(() => []),
        app.listLeases({ unit_id: id }).catch(() => []),
        app.listWorkOrders({ unit_id: id }).catch(() => []),
        propId
          ? api<{ summary: OperatingCostsSummary }>(
              "GET",
              `/api/properties/${propId}/operating-costs-summary?year=${settlementYear}`,
            ).catch(() => ({ summary: null }))
          : Promise.resolve({ summary: null }),
      ]);

      setBookings(bookingsData);
      setLeases(leasesData);
      setWorkOrders(woData);
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
  }, [id, settlementYear]);

  // Filtered and Paginated Bookings
  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter !== "all" && b.booking_status !== statusFilter) return false;
      if (payoutFilter !== "all" && b.payout_status !== payoutFilter) return false;
      if (platformFilter !== "all" && b.platform !== platformFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = b.guest_name.toLowerCase().includes(q);
        const matchCode = (b.confirmation_code || "").toLowerCase().includes(q);
        const matchNotes = (b.notes || "").toLowerCase().includes(q);
        const matchPhone = (b.guest_phone || "").toLowerCase().includes(q);
        const matchEmail = (b.guest_email || "").toLowerCase().includes(q);
        if (!matchName && !matchCode && !matchNotes && !matchPhone && !matchEmail) {
          return false;
        }
      }
      return true;
    }).sort((a, b) => {
      const cmp = a.check_in_date.localeCompare(b.check_in_date);
      return sortOrder === "newest" ? -cmp : cmp;
    });
  }, [bookings, statusFilter, payoutFilter, platformFilter, search, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredBookings.length / pageSize));
  const paginatedBookings = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredBookings.slice(start, start + pageSize);
  }, [filteredBookings, page, pageSize]);

  // Overall Airbnb Financials for this Unit
  const unitStats = useMemo(() => {
    const totalRevenue = bookings.reduce((sum, b) => sum + (b.net_payout ?? 0), 0);
    const totalGross = bookings.reduce((sum, b) => sum + (b.gross_amount ?? 0), 0);
    const totalNights = bookings.reduce((sum, b) => sum + (b.nights ?? 0), 0);
    const activeStays = bookings.filter((b) => b.booking_status === "checked_in").length;
    return { totalRevenue, totalGross, totalNights, activeStays };
  }, [bookings]);

  // Active or upcoming guest for Airbnb
  const todayIso = toIsoDate(new Date());
  const currentGuestBooking = useMemo(() => {
    return bookings.find(
      (b) =>
        b.booking_status === "checked_in" ||
        (b.booking_status === "confirmed" && b.check_in_date <= todayIso && b.check_out_date >= todayIso),
    );
  }, [bookings, todayIso]);

  const upcomingBookings = useMemo(() => {
    return bookings
      .filter((b) => b.booking_status === "confirmed" && b.check_in_date > todayIso)
      .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
  }, [bookings, todayIso]);

  // Nebenkosten Unit breakdown
  const unitBreakdown = operatingSummary?.units.find((u) => u.unit_id === id);

  async function handleDeleteBooking() {
    if (!deleteBookingId) return;
    try {
      await app.deleteAirbnbBooking(deleteBookingId);
      setDeleteBookingId(null);
      load();
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  async function handleScheduleCleaning(b: AirbnbBooking) {
    try {
      const wo = await app.scheduleTurnoverCleaning(b.id);
      load();
      app.setError(null);
      alert(`Turnover cleaning work order #${wo.id} has been created and assigned for checkout on ${formatDate(b.check_out_date)}.`);
    } catch (err) {
      app.setError((err as Error).message);
    }
  }

  if (loading && !unit) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground py-20">
        Loading unit details…
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
        <p className="text-base font-medium text-muted-foreground">Unit not found.</p>
        <Button variant="outline" onClick={() => navigate(initialPropertyId ? `/properties/${initialPropertyId}` : "/properties")}>
          <ArrowLeft className="mr-1.5 size-4" /> Back to Properties
        </Button>
      </div>
    );
  }

  const isAirbnb = unit.type === "airbnb";
  const parentPropertyPath = `/properties/${unit.property_id}`;

  return (
    <PageShell
      title={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(parentPropertyPath)}
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground pl-0"
          >
            <ArrowLeft className="size-4" />
            <span>{unit.property_name || "Property"}</span>
          </Button>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-semibold text-foreground text-sm">{unit.name}</span>
        </div>
      }
      actions={
        <div className="flex items-center gap-2">
          {isAirbnb && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedBookingForPack(currentGuestBooking || bookings[0] || undefined);
                  setGuestPackOpen(true);
                }}
                className="gap-1.5 text-xs border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10"
              >
                <KeyRound className="size-3.5" /> Welcome Pack
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditingBooking(undefined);
                  setBookingDialogOpen(true);
                }}
                className="gap-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white"
              >
                <Plus className="size-3.5" /> Add Booking
              </Button>
            </>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditUnitOpen(true)}
            className="gap-1.5 text-xs"
          >
            <Pencil className="size-3.5" /> Edit Unit
          </Button>
        </div>
      }
    >
      {/* ── TOP HERO HEADER ────────────────────────────────────────────── */}
      <header className="rounded-xl border bg-card p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span
              className={cn(
                "flex size-12 shrink-0 items-center justify-center rounded-xl",
                isAirbnb
                  ? "bg-rose-500/10 text-rose-500 ring-1 ring-rose-500/25"
                  : "bg-primary/10 text-primary ring-1 ring-primary/25",
              )}
            >
              {isAirbnb ? <Sparkles className="size-6" /> : <Home className="size-6" />}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">{unit.name}</h1>
                {isAirbnb ? (
                  <Badge variant="outline" className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25 font-semibold text-xs">
                    Airbnb Listing
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="capitalize text-xs font-medium">
                    {unit.type}
                  </Badge>
                )}
                <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize", STATUS_TONE[unit.status])}>
                  {unit.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>{unit.bedrooms} Bedroom{unit.bedrooms === 1 ? "" : "s"}</span>
                <span>·</span>
                <span>{unit.bathrooms} Bathroom{unit.bathrooms === 1 ? "" : "s"}</span>
                {unit.sqft && (
                  <>
                    <span>·</span>
                    <span className="font-mono">{unit.sqft} m²</span>
                  </>
                )}
                {unit.property_address && (
                  <>
                    <span>·</span>
                    <span>{unit.property_address}, {unit.property_city}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Quick links & actions */}
          <div className="flex items-center gap-2 shrink-0">
            {isAirbnb && unit.airbnb_listing_url && (
              <a
                href={unit.airbnb_listing_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline border rounded-md px-2.5 py-1.5 border-rose-500/25 bg-rose-500/5"
              >
                <span>Live Listing</span>
                <ExternalLink className="size-3" />
              </a>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWorkOrderDialogOpen(true)}
              className="text-xs gap-1.5 h-8"
            >
              <Wrench className="size-3.5 text-muted-foreground" /> Work Order
            </Button>
          </div>
        </div>

        {/* 4 Metric Highlights */}
        {isAirbnb ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
            <div className="rounded-lg border bg-muted/20 p-3">
              <span className="text-[11px] font-medium text-muted-foreground block">Base Nightly Rate</span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-lg font-bold font-mono tabular-nums text-foreground">
                  {formatMoney(unit.airbnb_nightly_rate || unit.market_rent || 0, app.settings.currency)}
                </span>
                <span className="text-xs text-muted-foreground">/ night</span>
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <span className="text-[11px] font-medium text-muted-foreground block">Cleaning Fee</span>
              <div className="mt-1 text-lg font-bold font-mono tabular-nums text-foreground">
                {formatMoney(unit.airbnb_cleaning_fee || 0, app.settings.currency)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <span className="text-[11px] font-medium text-muted-foreground block">Capacity & Min Stay</span>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {unit.airbnb_max_guests || 2} guests · {unit.airbnb_min_nights || 1} nt min
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <span className="text-[11px] font-medium text-muted-foreground block">Standard Check-In / Out</span>
              <div className="mt-1 text-sm font-semibold font-mono text-foreground">
                {unit.airbnb_check_in_time || "15:00"} / {unit.airbnb_check_out_time || "11:00"}
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t">
            <div className="rounded-lg border bg-muted/20 p-3">
              <span className="text-[11px] font-medium text-muted-foreground block">Cold Rent</span>
              <div className="mt-1 text-lg font-bold font-mono tabular-nums text-foreground">
                {formatMoney(unit.active_rent || unit.market_rent || 0, app.settings.currency)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <span className="text-[11px] font-medium text-muted-foreground block">Operating Advance</span>
              <div className="mt-1 text-lg font-bold font-mono tabular-nums text-foreground">
                {formatMoney((unit.active_operating_advance || 0) + (unit.active_heating_advance || 0) || (unit.monthly_operating_cost || 0), app.settings.currency)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <span className="text-[11px] font-medium text-muted-foreground block">Total Warm Rent</span>
              <div className="mt-1 text-lg font-bold font-mono tabular-nums text-primary">
                {formatMoney((unit.active_rent || unit.market_rent || 0) + ((unit.active_operating_advance || 0) + (unit.active_heating_advance || 0) || (unit.monthly_operating_cost || 0)), app.settings.currency)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/20 p-3">
              <span className="text-[11px] font-medium text-muted-foreground block">Active Lease Holder</span>
              <div className="mt-1 text-sm font-semibold text-foreground truncate">
                {unit.active_tenant_name || "Vacant"}
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── CURRENT OCCUPANCY / GUEST STATUS & AIRBNB ACCESS CREDENTIALS ── */}
      {isAirbnb && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left 2 Cols: Current Stay / Pipeline */}
          <Card className="lg:col-span-2 p-4 space-y-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
                  <UserCheck className="size-3.5" />
                </span>
                <h3 className="text-sm font-semibold">Current Guest & Stay Pipeline</h3>
              </div>
              {currentGuestBooking && (
                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-xs">
                  In Residence
                </Badge>
              )}
            </div>

            {currentGuestBooking ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] uppercase font-bold text-emerald-600 dark:text-emerald-400 tracking-wider">
                      Current Guest
                    </span>
                    <h4 className="text-base font-bold text-foreground">{currentGuestBooking.guest_name}</h4>
                    <p className="text-xs text-muted-foreground">
                      {currentGuestBooking.num_guests} guest{currentGuestBooking.num_guests === 1 ? "" : "s"} · Code: <span className="font-mono font-semibold">{currentGuestBooking.confirmation_code}</span> ({currentGuestBooking.platform})
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted-foreground block">Checkout Scheduled</span>
                    <span className="font-mono text-sm font-bold text-foreground">
                      {formatDate(currentGuestBooking.check_out_date)} at {unit.airbnb_check_out_time || "11:00"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1 border-t border-emerald-500/20">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                    onClick={() => {
                      setSelectedBookingForPack(currentGuestBooking);
                      setGuestPackOpen(true);
                    }}
                  >
                    <KeyRound className="size-3" /> Guest Guide & Door Code
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleScheduleCleaning(currentGuestBooking)}
                  >
                    <Sparkles className="size-3 text-rose-500" /> Schedule Turnover Cleaning
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs ml-auto"
                    onClick={() => {
                      setEditingBooking(currentGuestBooking);
                      setBookingDialogOpen(true);
                    }}
                  >
                    Edit Stay Details →
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-center space-y-1">
                <p className="text-sm font-semibold text-foreground">No active guest in residence</p>
                <p className="text-xs text-muted-foreground">
                  {upcomingBookings.length > 0
                    ? `Next check-in scheduled for ${formatDate(upcomingBookings[0].check_in_date)} (${upcomingBookings[0].guest_name})`
                    : "No upcoming reservations scheduled yet."}
                </p>
              </div>
            )}

            {/* Upcoming Check-in Ribbon */}
            {upcomingBookings.length > 0 && (
              <div className="flex items-center justify-between text-xs bg-muted/20 rounded-md p-2 border">
                <span className="text-muted-foreground">
                  Upcoming Stays: <strong className="text-foreground">{upcomingBookings.length}</strong> reservation{upcomingBookings.length === 1 ? "" : "s"} booked ahead
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Next: {formatDate(upcomingBookings[0].check_in_date)}
                </span>
              </div>
            )}
          </Card>

          {/* Right Col: Wi-Fi, Lockbox & Smart Access */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
                <Wifi className="size-3.5" />
              </span>
              <h3 className="text-sm font-semibold">Access & Guest Credentials</h3>
            </div>

            <div className="space-y-2 text-xs">
              {/* Lockbox code */}
              <div className="flex items-center justify-between p-2 rounded-md border bg-muted/20">
                <div>
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">Door / Lockbox Code</span>
                  <span className="font-mono font-bold text-sm text-foreground">
                    {unit.airbnb_lockbox_code || "Not set"}
                  </span>
                </div>
                {unit.airbnb_lockbox_code && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => copyText("lockbox", unit.airbnb_lockbox_code || "")}
                  >
                    {copiedKey === "lockbox" ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                  </Button>
                )}
              </div>

              {/* Wi-Fi SSID */}
              <div className="flex items-center justify-between p-2 rounded-md border bg-muted/20">
                <div className="min-w-0 pr-2">
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">Wi-Fi Network</span>
                  <span className="font-mono font-semibold truncate block text-foreground">
                    {unit.airbnb_wifi_ssid || "Not set"}
                  </span>
                </div>
                {unit.airbnb_wifi_ssid && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => copyText("wifi_ssid", unit.airbnb_wifi_ssid || "")}
                  >
                    {copiedKey === "wifi_ssid" ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                  </Button>
                )}
              </div>

              {/* Wi-Fi Password */}
              <div className="flex items-center justify-between p-2 rounded-md border bg-muted/20">
                <div className="min-w-0 pr-2">
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">Wi-Fi Password</span>
                  <span className="font-mono font-semibold truncate block text-foreground">
                    {unit.airbnb_wifi_password || "Not set"}
                  </span>
                </div>
                {unit.airbnb_wifi_password && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => copyText("wifi_pass", unit.airbnb_wifi_password || "")}
                  >
                    {copiedKey === "wifi_pass" ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                  </Button>
                )}
              </div>

              {/* Assigned Cleaner */}
              <div className="flex items-center justify-between p-2 rounded-md border bg-muted/20">
                <div className="min-w-0 pr-2">
                  <span className="text-[10px] text-muted-foreground block uppercase font-medium">Assigned Cleaner</span>
                  <span className="font-semibold truncate block text-foreground flex items-center gap-1.5">
                    <Sparkles className="size-3 text-teal-600 shrink-0" />
                    {unit.cleaner_name ? `${unit.cleaner_name} (${unit.cleaner_email || ""})` : "No cleaner assigned"}
                  </span>
                </div>
                {navigate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px] text-teal-700 dark:text-teal-400 hover:bg-teal-500/10 px-2"
                    onClick={() => navigate("/cleaner")}
                  >
                    Schedule &rarr;
                  </Button>
                )}
              </div>

              {unit.airbnb_house_rules && (
                <div className="pt-1 text-[11px] text-muted-foreground line-clamp-2">
                  <strong>Rules:</strong> {unit.airbnb_house_rules}
                </div>
              )}
            </div>
          </Card>
        </section>
      )}

      {/* ── GUEST STAYS & RESERVATIONS (SCALABLE TABLE WITH FILTERING & PAGINATION) ── */}
      {isAirbnb && (
        <section className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-2">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">Guest Stays & Reservations</h2>
                <Badge variant="outline" className="font-mono text-xs font-semibold">
                  {filteredBookings.length} stay{filteredBookings.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Complete reservation history, guest communication, and payout records
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setEditingBooking(undefined);
                  setBookingDialogOpen(true);
                }}
                className="gap-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white"
              >
                <Plus className="size-3.5" /> Record Booking
              </Button>
            </div>
          </div>

          {/* KPI Snapshot for this Unit */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-card p-3 shadow-2xs">
              <span className="text-[11px] text-muted-foreground font-medium block">Total Bookings</span>
              <span className="text-xl font-bold font-mono text-foreground">{bookings.length}</span>
            </div>
            <div className="rounded-lg border bg-card p-3 shadow-2xs">
              <span className="text-[11px] text-muted-foreground font-medium block">Total Nights Hosted</span>
              <span className="text-xl font-bold font-mono text-foreground">{unitStats.totalNights}</span>
            </div>
            <div className="rounded-lg border bg-card p-3 shadow-2xs">
              <span className="text-[11px] text-muted-foreground font-medium block">Gross Booking Value</span>
              <span className="text-xl font-bold font-mono text-foreground">
                {formatMoney(unitStats.totalGross, app.settings.currency)}
              </span>
            </div>
            <div className="rounded-lg border bg-card p-3 shadow-2xs">
              <span className="text-[11px] text-muted-foreground font-medium block">Net Host Payouts</span>
              <span className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {formatMoney(unitStats.totalRevenue, app.settings.currency)}
              </span>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <Card className="p-3 space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
              {/* Search bar */}
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search by guest name, confirmation code, notes, email..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="pl-9 h-9 text-xs"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {/* Status & Payout Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium"
                >
                  <option value="all">All Booking Statuses</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="checked_in">Checked In</option>
                  <option value="checked_out">Checked Out</option>
                  <option value="cancelled">Cancelled</option>
                </select>

                <select
                  value={payoutFilter}
                  onChange={(e) => {
                    setPayoutFilter(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium"
                >
                  <option value="all">All Payout Statuses</option>
                  <option value="received">Received</option>
                  <option value="pending">Pending</option>
                  <option value="refunded">Refunded</option>
                </select>

                <select
                  value={platformFilter}
                  onChange={(e) => {
                    setPlatformFilter(e.target.value);
                    setPage(1);
                  }}
                  className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium"
                >
                  <option value="all">All Platforms</option>
                  <option value="airbnb">Airbnb</option>
                  <option value="vrbo">VRBO</option>
                  <option value="booking_com">Booking.com</option>
                  <option value="direct">Direct</option>
                  <option value="other">Other</option>
                </select>

                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "newest" | "oldest")}
                  className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium"
                >
                  <option value="newest">Newest Check-In</option>
                  <option value="oldest">Oldest Check-In</option>
                </select>

                {(search || statusFilter !== "all" || payoutFilter !== "all" || platformFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setStatusFilter("all");
                      setPayoutFilter("all");
                      setPlatformFilter("all");
                      setPage(1);
                    }}
                    className="h-9 text-xs text-muted-foreground hover:text-foreground px-2"
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* Bookings Table */}
          {filteredBookings.length === 0 ? (
            <Card className="p-8 text-center space-y-2">
              <Calendar className="size-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-semibold text-foreground">No guest stays found</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {search || statusFilter !== "all" || payoutFilter !== "all" || platformFilter !== "all"
                  ? "Try clearing your filters or changing your search terms."
                  : "No reservations have been recorded for this unit yet. Click 'Record Booking' to add one."}
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guest</TableHead>
                      <TableHead>Dates & Length</TableHead>
                      <TableHead>Platform & Code</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Fees</TableHead>
                      <TableHead className="text-right">Net Payout</TableHead>
                      <TableHead>Payout</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedBookings.map((b) => {
                      const isCurrentStay =
                        b.booking_status === "checked_in" ||
                        (b.booking_status === "confirmed" &&
                          b.check_in_date <= todayIso &&
                          b.check_out_date >= todayIso);
                      const plat = PLATFORM_BADGE[b.platform] || PLATFORM_BADGE.other;

                      return (
                        <TableRow key={b.id} className={cn(isCurrentStay && "bg-emerald-500/5")}>
                          <TableCell>
                            <div>
                              <div className="font-semibold text-foreground flex items-center gap-1.5">
                                <span>{b.guest_name}</span>
                                {isCurrentStay && (
                                  <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-none text-[9px] px-1 py-0 h-3.5">
                                    Current
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[11px] text-muted-foreground flex items-center gap-2 mt-0.5">
                                <span>{b.num_guests} guest{b.num_guests === 1 ? "" : "s"}</span>
                                {b.guest_phone && <span>· {b.guest_phone}</span>}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="text-xs font-mono">
                              <div>{formatDate(b.check_in_date)} → {formatDate(b.check_out_date)}</div>
                              <span className="text-[11px] text-muted-foreground font-sans">
                                {b.nights} night{b.nights === 1 ? "" : "s"}
                              </span>
                            </div>
                          </TableCell>

                          <TableCell>
                            <div className="space-y-0.5">
                              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-4", plat.tone)}>
                                {plat.label}
                              </Badge>
                              <div className="font-mono text-[11px] text-muted-foreground flex items-center gap-1">
                                <span>{b.confirmation_code || "Direct"}</span>
                                {b.confirmation_code && (
                                  <button
                                    type="button"
                                    onClick={() => copyText(`code-${b.id}`, b.confirmation_code || "")}
                                    className="text-muted-foreground hover:text-foreground"
                                  >
                                    {copiedKey === `code-${b.id}` ? (
                                      <Check className="size-2.5 text-success" />
                                    ) : (
                                      <Copy className="size-2.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          </TableCell>

                          <TableCell className="text-right tabular-nums text-xs">
                            {formatMoney(b.gross_amount, app.settings.currency)}
                          </TableCell>

                          <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                            -{formatMoney(b.platform_fee, app.settings.currency)}
                          </TableCell>

                          <TableCell className="text-right tabular-nums text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                            {formatMoney(b.net_payout, app.settings.currency)}
                          </TableCell>

                          <TableCell>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
                                PAYOUT_STATUS_TONE[b.payout_status] || "bg-muted text-muted-foreground",
                              )}
                            >
                              {b.payout_status}
                            </span>
                          </TableCell>

                          <TableCell>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize",
                                BOOKING_STATUS_TONE[b.booking_status] || "bg-muted text-muted-foreground",
                              )}
                            >
                              {b.booking_status.replace("_", " ")}
                            </span>
                          </TableCell>

                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-muted-foreground hover:text-rose-600"
                                title="Guest Welcome Pack"
                                onClick={() => {
                                  setSelectedBookingForPack(b);
                                  setGuestPackOpen(true);
                                }}
                              >
                                <KeyRound className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-muted-foreground hover:text-foreground"
                                title="Schedule Cleaning"
                                onClick={() => handleScheduleCleaning(b)}
                              >
                                <Sparkles className="size-3.5 text-rose-500" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-muted-foreground hover:text-foreground"
                                title="Edit Booking"
                                onClick={() => {
                                  setEditingBooking(b);
                                  setBookingDialogOpen(true);
                                }}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-muted-foreground hover:text-destructive"
                                title="Delete Booking"
                                onClick={() => setDeleteBookingId(b.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 border-t text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>
                    Showing{" "}
                    <strong className="text-foreground">
                      {(page - 1) * pageSize + 1}
                    </strong>{" "}
                    to{" "}
                    <strong className="text-foreground">
                      {Math.min(page * pageSize, filteredBookings.length)}
                    </strong>{" "}
                    of <strong className="text-foreground">{filteredBookings.length}</strong> reservations
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="h-7 rounded border border-input bg-background px-2 text-xs font-mono ml-2"
                  >
                    <option value={5}>5 / page</option>
                    <option value={10}>10 / page</option>
                    <option value={20}>20 / page</option>
                    <option value={50}>50 / page</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="h-7 text-xs px-2"
                  >
                    <ChevronLeft className="size-3.5" /> Previous
                  </Button>
                  <span className="font-mono text-xs px-2 text-foreground font-semibold">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="h-7 text-xs px-2"
                  >
                    Next <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </section>
      )}

      {/* ── LONG TERM LEASES (FOR RESIDENTIAL / COMMERCIAL UNITS) ────────── */}
      {!isAirbnb && (
        <section className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h2 className="text-base font-bold text-foreground">Lease & Tenancy History</h2>
              <p className="text-xs text-muted-foreground">Long-term contracts and resident records</p>
            </div>
            <Button
              size="sm"
              onClick={() => setEditUnitOpen(true)}
              className="text-xs gap-1.5"
            >
              <UserPlus className="size-3.5" /> Assign Tenant / Lease
            </Button>
          </div>

          {leases.length === 0 ? (
            <Card className="p-8 text-center space-y-2">
              <FileText className="size-8 text-muted-foreground mx-auto" />
              <p className="text-sm font-semibold text-foreground">No leases recorded</p>
              <p className="text-xs text-muted-foreground">
                Assign a tenant to this unit to create an active lease contract.
              </p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Term</TableHead>
                    <TableHead className="text-right">Monthly Rent</TableHead>
                    <TableHead className="text-right">Nebenkosten Adv.</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leases.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {l.tenant_first_name} {l.tenant_last_name}
                        </div>
                        <div className="text-xs text-muted-foreground">{l.tenant_email || l.tenant_phone}</div>
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {formatDate(l.start_date)} → {formatDate(l.end_date)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums">
                        {formatMoney(l.monthly_rent, app.settings.currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        +{formatMoney(l.operating_cost_advance + l.heating_cost_advance, app.settings.currency)}
                      </TableCell>
                      <TableCell>
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize", l.status === "active" ? "bg-success-tint text-success" : "bg-muted text-muted-foreground")}>
                          {l.status}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </section>
      )}

      {/* ── OPERATING COST SETTLEMENT (NEBENKOSTEN) COMPARISON ─────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Receipt className="size-3.5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">Yearly Operating Cost Settlement (Nebenkosten)</h2>
              <p className="text-xs text-muted-foreground">
                Property expense allocation based on space ({unit.sqft ? `${unit.sqft} m²` : "floor space"})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="settlement-year-select" className="text-xs text-muted-foreground">Year:</label>
            <select
              id="settlement-year-select"
              value={settlementYear}
              onChange={(e) => setSettlementYear(Number(e.target.value))}
              className="h-8 rounded border border-input bg-background px-2.5 text-xs font-mono font-medium"
            >
              {[2024, 2025, 2026, 2027].map((yr) => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>
        </div>

        {unitBreakdown ? (
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between text-xs bg-muted/20 rounded p-2 border gap-2">
              <span className="text-muted-foreground">
                Floor Space: <strong className="text-foreground font-mono">{unitBreakdown.sqft} m²</strong>
                {operatingSummary && operatingSummary.total_sqft > 0 && (
                  <span> ({unitBreakdown.sqft_share_pct}% of total {operatingSummary.total_sqft} m²)</span>
                )}
              </span>
              <span className="text-muted-foreground">
                Status: <strong className="text-foreground">{unitBreakdown.is_vacant ? "Vacant (Leerstand)" : unitBreakdown.tenant_name || (isAirbnb ? "Airbnb Vacation Unit" : "Occupied")}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-md border bg-muted/15 p-3">
                <span className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wider">
                  {isAirbnb ? "Guest Prepayments" : "Paid by Tenant"}
                </span>
                <div className="my-1 text-lg font-bold font-mono tabular-nums text-foreground">
                  {formatMoney(unitBreakdown.annual_advance, app.settings.currency)}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  {isAirbnb ? "All-inclusive guest rate" : `${formatMoney(unitBreakdown.monthly_advance, app.settings.currency)}/mo × 12`}
                </span>
              </div>

              <div className="rounded-md border bg-muted/15 p-3">
                <span className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wider">
                  Actual Allocated Cost
                </span>
                <div className="my-1 text-lg font-bold font-mono tabular-nums text-foreground">
                  {formatMoney(unitBreakdown.allocated_cost, app.settings.currency)}
                </div>
                <span className="text-[11px] text-muted-foreground">
                  Floor space share ({unitBreakdown.sqft_share_pct}%)
                </span>
              </div>

              <div className="rounded-md border bg-muted/15 p-3 flex flex-col justify-between">
                <span className="text-[11px] uppercase font-semibold text-muted-foreground tracking-wider">
                  Settlement Balance
                </span>
                <div className="my-1 text-lg font-bold font-mono tabular-nums">
                  {unitBreakdown.balance < 0 ? (
                    <span className="text-emerald-600 dark:text-emerald-400">
                      Refund: {formatMoney(Math.abs(unitBreakdown.balance), app.settings.currency)}
                    </span>
                  ) : unitBreakdown.balance > 0 ? (
                    <span className="text-amber-600 dark:text-amber-400">
                      Due: {formatMoney(unitBreakdown.balance, app.settings.currency)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Balanced (€0.00)</span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px] mt-1"
                  onClick={() => setStatementDialogOpen(true)}
                >
                  Itemized Statement →
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <Card className="p-4 text-center text-xs text-muted-foreground">
            No operating expense settlement data available for {settlementYear}.
          </Card>
        )}
      </section>

      {/* ── MAINTENANCE & WORK ORDERS ──────────────────────────────────── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-orange-500/10 text-orange-500">
              <Wrench className="size-3.5" />
            </span>
            <div>
              <h2 className="text-base font-bold text-foreground">Maintenance & Turnover Orders</h2>
              <p className="text-xs text-muted-foreground">Repairs, cleaning tickets, and inspections</p>
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => setWorkOrderDialogOpen(true)}
            className="text-xs gap-1.5"
          >
            <Plus className="size-3.5" /> New Work Order
          </Button>
        </div>

        {workOrders.length === 0 ? (
          <Card className="p-6 text-center space-y-1">
            <p className="text-sm font-semibold text-foreground">No work orders on record</p>
            <p className="text-xs text-muted-foreground">
              Everything is in good shape. Create a work order for cleaning or maintenance as needed.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workOrders.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell>
                      <div className="font-semibold text-foreground text-xs">{w.title}</div>
                      {w.description && (
                        <div className="text-[11px] text-muted-foreground line-clamp-1">{w.description}</div>
                      )}
                    </TableCell>
                    <TableCell className="capitalize text-xs text-muted-foreground">{w.vendor_category || "General"}</TableCell>
                    <TableCell className="text-xs">{w.vendor_name || "Unassigned"}</TableCell>
                    <TableCell>
                      <span className={cn("text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border", w.priority === "urgent" ? "bg-rose-500/15 text-rose-600 border-rose-500/30" : "bg-muted text-muted-foreground border-border")}>
                        {w.priority}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={cn("text-[10px] font-semibold capitalize px-2 py-0.5 rounded-full border", w.status === "completed" ? "bg-success-tint text-success" : "bg-warning-tint text-warning")}>
                        {w.status.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono text-muted-foreground">
                      {formatDate(w.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </section>

      {/* ── DIALOGS ────────────────────────────────────────────────────── */}

      {/* Edit Unit Dialog */}
      {unit && (
        <UnitDialog
          open={editUnitOpen}
          onOpenChange={setEditUnitOpen}
          propertyId={unit.property_id}
          unit={unit}
          onSaved={() => {
            setEditUnitOpen(false);
            load();
          }}
        />
      )}

      {/* Booking Dialog */}
      {unit && (
        <BookingDialog
          open={bookingDialogOpen}
          onOpenChange={(o) => {
            setBookingDialogOpen(o);
            if (!o) setEditingBooking(undefined);
          }}
          booking={editingBooking}
          defaultUnitId={unit.id}
          onSaved={() => {
            setBookingDialogOpen(false);
            setEditingBooking(undefined);
            load();
          }}
        />
      )}

      {/* Guest Welcome & Check-In Pack */}
      {unit && (
        <GuestPackDialog
          open={guestPackOpen}
          onOpenChange={setGuestPackOpen}
          unit={unit}
          booking={selectedBookingForPack}
        />
      )}

      {/* Work Order Dialog */}
      {unit && (
        <WorkOrderDialog
          open={workOrderDialogOpen}
          onOpenChange={setWorkOrderDialogOpen}
          defaults={{ property_id: unit.property_id, unit_id: unit.id }}
          onSaved={() => {
            setWorkOrderDialogOpen(false);
            load();
          }}
        />
      )}

      {/* Nebenkosten Itemized Statement Dialog */}
      {unitBreakdown && operatingSummary && (
        <NebenkostenStatementDialog
          open={statementDialogOpen}
          onOpenChange={setStatementDialogOpen}
          unit={unitBreakdown}
          propertyName={operatingSummary.property_name}
          year={settlementYear}
          totalPropertySqft={operatingSummary.total_sqft}
        />
      )}

      {/* Delete Booking Confirmation */}
      <ConfirmDelete
        open={deleteBookingId !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteBookingId(null);
        }}
        title="Delete this reservation?"
        description="This booking record and its payout log will be permanently deleted. This cannot be undone."
        onConfirm={handleDeleteBooking}
      />
    </PageShell>
  );
}
