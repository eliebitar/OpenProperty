import { useEffect, useState, useMemo } from "react";
import { Calendar, DollarSign, Home, User, Trash2 } from "lucide-react";
import { useApp } from "@/context";
import { formatMoney, toIsoDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDelete } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import type { AirbnbBooking, BookingPlatform, BookingStatus, PayoutStatus, Unit } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking?: AirbnbBooking;
  defaultUnitId?: number;
  onSaved?: () => void;
}

const PLATFORMS: { value: BookingPlatform; label: string }[] = [
  { value: "airbnb", label: "Airbnb" },
  { value: "vrbo", label: "VRBO" },
  { value: "booking_com", label: "Booking.com" },
  { value: "direct", label: "Direct Booking" },
  { value: "other", label: "Other Platform" },
];

const BOOKING_STATUSES: { value: BookingStatus; label: string }[] = [
  { value: "confirmed", label: "Confirmed" },
  { value: "checked_in", label: "Checked In" },
  { value: "checked_out", label: "Checked Out" },
  { value: "cancelled", label: "Cancelled" },
];

const PAYOUT_STATUSES: { value: PayoutStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "received", label: "Payout Received" },
  { value: "refunded", label: "Refunded" },
];

export function BookingDialog({ open, onOpenChange, booking, defaultUnitId, onSaved }: Props) {
  const app = useApp();
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitId, setUnitId] = useState<string>("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [numGuests, setNumGuests] = useState("2");
  const [checkInDate, setCheckInDate] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [checkInTime, setCheckInTime] = useState("15:00");
  const [checkOutTime, setCheckOutTime] = useState("11:00");
  const [nightlyRate, setNightlyRate] = useState("120");
  const [cleaningFee, setCleaningFee] = useState("50");
  const [platformFee, setPlatformFee] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [platform, setPlatform] = useState<BookingPlatform>("airbnb");
  const [bookingStatus, setBookingStatus] = useState<BookingStatus>("confirmed");
  const [payoutStatus, setPayoutStatus] = useState<PayoutStatus>("pending");
  const [payoutDate, setPayoutDate] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Load all units
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const list = await app.listUnits();
        setUnits(list);
      } catch (err) {
        console.error("Failed to load units", err);
      }
    })();
  }, [open, app]);

  // Initialize form state
  useEffect(() => {
    if (!open) return;
    if (booking) {
      setUnitId(String(booking.unit_id));
      setGuestName(booking.guest_name);
      setGuestEmail(booking.guest_email ?? "");
      setGuestPhone(booking.guest_phone ?? "");
      setNumGuests(String(booking.num_guests ?? 2));
      setCheckInDate(booking.check_in_date);
      setCheckOutDate(booking.check_out_date);
      setNightlyRate(String(booking.nightly_rate));
      setCleaningFee(String(booking.cleaning_fee));
      setPlatformFee(String(booking.platform_fee));
      setTaxAmount(String(booking.tax_amount ?? 0));
      setPlatform(booking.platform);
      setBookingStatus(booking.booking_status);
      setPayoutStatus(booking.payout_status);
      setPayoutDate(booking.payout_date ?? "");
      setConfirmationCode(booking.confirmation_code ?? "");
      setNotes(booking.notes ?? "");
    } else {
      const today = new Date();
      const inDate = toIsoDate(today);
      const outDate = new Date(today);
      outDate.setDate(outDate.getDate() + 3);

      setUnitId(defaultUnitId ? String(defaultUnitId) : "");
      setGuestName("");
      setGuestEmail("");
      setGuestPhone("");
      setNumGuests("2");
      setCheckInDate(inDate);
      setCheckOutDate(toIsoDate(outDate));
      setNightlyRate("120");
      setCleaningFee("50");
      setPlatformFee("");
      setTaxAmount("0");
      setPlatform("airbnb");
      setBookingStatus("confirmed");
      setPayoutStatus("pending");
      setPayoutDate("");
      setConfirmationCode(`HM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`);
      setNotes("");
    }
  }, [open, booking, defaultUnitId]);

  // When unit selection changes, pre-fill defaults if creating new
  const selectedUnit = useMemo(() => {
    return units.find((u) => String(u.id) === unitId);
  }, [units, unitId]);

  useEffect(() => {
    if (!booking && selectedUnit) {
      if (selectedUnit.airbnb_nightly_rate) {
        setNightlyRate(String(selectedUnit.airbnb_nightly_rate));
      } else if (selectedUnit.market_rent) {
        setNightlyRate(String(selectedUnit.market_rent));
      }
      if (selectedUnit.airbnb_cleaning_fee !== undefined) {
        setCleaningFee(String(selectedUnit.airbnb_cleaning_fee));
      }
      if (selectedUnit.airbnb_max_guests) {
        setNumGuests(String(selectedUnit.airbnb_max_guests));
      }
      if (selectedUnit.airbnb_check_in_time) {
        setCheckInTime(selectedUnit.airbnb_check_in_time);
      }
      if (selectedUnit.airbnb_check_out_time) {
        setCheckOutTime(selectedUnit.airbnb_check_out_time);
      }
    }
  }, [selectedUnit, booking]);

  // Financial calculations
  const nightsCount = useMemo(() => {
    if (!checkInDate || !checkOutDate) return 1;
    const diff = Math.round(
      (new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / (1000 * 60 * 60 * 24),
    );
    return Math.max(1, diff);
  }, [checkInDate, checkOutDate]);

  const nRate = parseFloat(nightlyRate) || 0;
  const cFee = parseFloat(cleaningFee) || 0;
  const tAmount = parseFloat(taxAmount) || 0;
  const totalNightsAmount = nightsCount * nRate;
  const grossAmount = totalNightsAmount + cFee + tAmount;

  // Auto calculate platform fee if not manually set
  const pFee = useMemo(() => {
    if (platformFee !== "") return parseFloat(platformFee) || 0;
    if (platform === "airbnb") return Math.round(totalNightsAmount * 0.03 * 100) / 100;
    if (platform === "vrbo") return Math.round(totalNightsAmount * 0.05 * 100) / 100;
    return 0;
  }, [platformFee, platform, totalNightsAmount]);

  const netPayout = Math.max(0, Math.round((grossAmount - pFee - tAmount) * 100) / 100);

  async function save() {
    if (!guestName.trim() || !unitId || !checkInDate || !checkOutDate) {
      app.setError("Please provide Guest Name, Unit, and Check-in / Check-out dates.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        unit_id: parseInt(unitId, 10),
        guest_name: guestName.trim(),
        guest_email: guestEmail.trim() || null,
        guest_phone: guestPhone.trim() || null,
        num_guests: parseInt(numGuests, 10) || 1,
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        nights: nightsCount,
        nightly_rate: nRate,
        total_nights_amount: totalNightsAmount,
        cleaning_fee: cFee,
        platform_fee: pFee,
        tax_amount: tAmount,
        gross_amount: grossAmount,
        net_payout: netPayout,
        payout_status: payoutStatus,
        payout_date: payoutStatus === "received" ? (payoutDate || checkInDate) : null,
        booking_status: bookingStatus,
        platform,
        confirmation_code: confirmationCode.trim() || null,
        notes: notes.trim() || null,
      };

      if (booking) {
        await app.updateAirbnbBooking(booking.id, payload);
      } else {
        await app.createAirbnbBooking(payload);
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
    if (!booking) return;
    setSaving(true);
    try {
      await app.deleteAirbnbBooking(booking.id);
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
                <Home className="size-4" />
              </span>
              <DialogTitle>{booking ? `Edit Booking (${booking.guest_name})` : "New Airbnb Booking"}</DialogTitle>
            </div>
          </DialogHeader>

          <div className="grid gap-4 py-1 text-xs">
            {/* Unit & Platform selection */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="booking-unit">Unit / Apartment *</Label>
                <Select value={unitId} onValueChange={setUnitId}>
                  <SelectTrigger id="booking-unit">
                    <SelectValue placeholder="Select rental space" />
                  </SelectTrigger>
                  <SelectContent>
                    {units.map((u) => (
                      <SelectItem key={u.id} value={String(u.id)}>
                        {u.property_name ? `${u.property_name} · ` : ""}
                        {u.name} {u.type === "airbnb" ? "✨ (Airbnb)" : `(${u.type})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="booking-platform">Booking Platform</Label>
                <Select value={platform} onValueChange={(v) => setPlatform(v as BookingPlatform)}>
                  <SelectTrigger id="booking-platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Guest Details */}
            <div className="rounded-lg border bg-muted/15 p-3 space-y-2.5">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <User className="size-3.5 text-primary" /> Guest Information
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label htmlFor="guest-name">Guest Full Name *</Label>
                  <Input
                    id="guest-name"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="h-8"
                  />
                </div>
                <div>
                  <Label htmlFor="guest-num">Number of Guests</Label>
                  <Input
                    id="guest-num"
                    type="number"
                    min="1"
                    value={numGuests}
                    onChange={(e) => setNumGuests(e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <Label htmlFor="guest-email">Email Address</Label>
                  <Input
                    id="guest-email"
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="guest@example.com"
                    className="h-8"
                  />
                </div>
                <div>
                  <Label htmlFor="guest-phone">Phone Number</Label>
                  <Input
                    id="guest-phone"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="+1 555 123 4567"
                    className="h-8"
                  />
                </div>
              </div>
            </div>

            {/* Reservation Dates & Time Range */}
            <div className="rounded-lg border bg-card p-3 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 font-semibold text-foreground text-xs">
                  <Calendar className="size-3.5 text-rose-500" /> Reservation Stay Range *
                </Label>
                <span className="rounded-full bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-600 dark:text-rose-400 text-[11px]">
                  {nightsCount} {nightsCount === 1 ? "Night" : "Nights"}
                </span>
              </div>

              <DateRangePicker
                startDate={checkInDate}
                endDate={checkOutDate}
                onChange={({ startDate, endDate }) => {
                  setCheckInDate(startDate);
                  setCheckOutDate(endDate);
                }}
                minDate={booking ? undefined : toIsoDate(new Date())}
                showTimeSelect={true}
                startTime={checkInTime}
                endTime={checkOutTime}
                onTimeChange={({ startTime, endTime }) => {
                  setCheckInTime(startTime);
                  setCheckOutTime(endTime);
                }}
              />

              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                <span>Check-in: {checkInTime || "15:00"} · Check-out: {checkOutTime || "11:00"}</span>
                {selectedUnit?.airbnb_min_nights && selectedUnit.airbnb_min_nights > 1 ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                    Min stay: {selectedUnit.airbnb_min_nights} nights
                  </span>
                ) : null}
              </div>
            </div>

            {/* Financials & Payout Calculations */}
            <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <DollarSign className="size-3.5 text-emerald-500" /> Rates & Host Payout
                </span>
                <span className="text-[11px] text-muted-foreground">Currency: {app.settings.currency}</span>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <Label htmlFor="nightly-rate">Nightly Rate</Label>
                  <Input
                    id="nightly-rate"
                    type="number"
                    value={nightlyRate}
                    onChange={(e) => setNightlyRate(e.target.value)}
                    className="h-8 font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="cleaning-fee">Cleaning Fee</Label>
                  <Input
                    id="cleaning-fee"
                    type="number"
                    value={cleaningFee}
                    onChange={(e) => setCleaningFee(e.target.value)}
                    className="h-8 font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="platform-fee">Host Fee ({platform})</Label>
                  <Input
                    id="platform-fee"
                    type="number"
                    placeholder={String(pFee)}
                    value={platformFee}
                    onChange={(e) => setPlatformFee(e.target.value)}
                    className="h-8 font-mono"
                  />
                </div>
                <div>
                  <Label htmlFor="tax-amount">Taxes / Kurtaxe</Label>
                  <Input
                    id="tax-amount"
                    type="number"
                    value={taxAmount}
                    onChange={(e) => setTaxAmount(e.target.value)}
                    className="h-8 font-mono"
                  />
                </div>
              </div>

              {/* Financial Summary Breakdown */}
              <div className="grid grid-cols-3 gap-2 rounded-md border bg-card p-2.5 text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground block font-medium">Nights Subtotal</span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatMoney(totalNightsAmount, app.settings.currency)}
                  </span>
                  <span className="text-[10px] text-muted-foreground block">
                    ({nightsCount} × {formatMoney(nRate, app.settings.currency)})
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground block font-medium">Gross Guest Total</span>
                  <span className="font-mono font-semibold text-foreground">
                    {formatMoney(grossAmount, app.settings.currency)}
                  </span>
                  <span className="text-[10px] text-muted-foreground block">Incl. cleaning & taxes</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground block font-medium">Net Host Payout</span>
                  <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                    {formatMoney(netPayout, app.settings.currency)}
                  </span>
                  <span className="text-[10px] text-muted-foreground block">After platform fee</span>
                </div>
              </div>
            </div>

            {/* Statuses & Confirmation */}
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <Label htmlFor="booking-status">Booking Status</Label>
                <Select value={bookingStatus} onValueChange={(v) => setBookingStatus(v as BookingStatus)}>
                  <SelectTrigger id="booking-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="payout-status">Payout Status</Label>
                <Select value={payoutStatus} onValueChange={(v) => setPayoutStatus(v as PayoutStatus)}>
                  <SelectTrigger id="payout-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYOUT_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="conf-code">Confirmation Code</Label>
                <Input
                  id="conf-code"
                  value={confirmationCode}
                  onChange={(e) => setConfirmationCode(e.target.value)}
                  placeholder="e.g. HM-ABC123"
                  className="h-8 font-mono"
                />
              </div>
            </div>

            {/* Notes / Special Requests */}
            <div>
              <Label htmlFor="booking-notes">Special Requests & Notes</Label>
              <Textarea
                id="booking-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Flight lands at 13:00, requesting early bag dropoff, traveling with toddler."
                rows={2}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between pt-2">
            {booking ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
              >
                <Trash2 className="size-3.5 mr-1" /> Delete
              </Button>
            ) : <div />}

            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={save}
                disabled={saving}
                className="bg-rose-600 hover:bg-rose-700 text-white"
              >
                {saving ? "Saving…" : booking ? "Save Changes" : "Create Booking"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDelete
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        onConfirm={remove}
        title="Delete Airbnb Booking"
        description={`Are you sure you want to delete the reservation for ${booking?.guest_name}? This action cannot be undone.`}
      />
    </>
  );
}
