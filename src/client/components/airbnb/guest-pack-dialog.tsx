import { useState } from "react";
import { Check, Copy, KeyRound, Wifi, Clock, ShieldCheck, MapPin, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AirbnbBooking, Unit } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking?: AirbnbBooking | null;
  unit?: Unit | null;
}

export function GuestPackDialog({ open, onOpenChange, booking, unit }: Props) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const unitName = booking?.unit_name || unit?.name || "Unit";
  const propName = booking?.property_name || unit?.property_name || "Property";
  const address = booking?.property_address || unit?.property_address || "";
  const city = booking?.property_city || unit?.property_city || "";
  const fullAddress = [address, city].filter(Boolean).join(", ");

  const checkInTime = booking?.check_in_time || unit?.airbnb_check_in_time || "15:00";
  const checkOutTime = booking?.check_out_time || unit?.airbnb_check_out_time || "11:00";
  const lockboxCode = booking?.lockbox_code || unit?.airbnb_lockbox_code || "Keybox";
  const wifiSsid = booking?.wifi_ssid || unit?.airbnb_wifi_ssid || "Guest_WiFi";
  const wifiPass = booking?.wifi_password || unit?.airbnb_wifi_password || "Password";
  const houseRules = booking?.house_rules || unit?.airbnb_house_rules || "No smoking. Quiet hours 22:00 - 08:00.";
  const checkOutInstructions = unit?.airbnb_check_out_instructions || "Please turn off lights, leave key in lockbox, and take trash out.";

  function copyText(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  }

  const fullGuide = `Welcome to ${unitName} at ${propName}!

--- Location & Address ---
${fullAddress || propName}

--- Arrival & Departure Times ---
• Check-in: from ${checkInTime}
• Check-out: by ${checkOutTime}

--- Key & Access ---
• Digital Lockbox Code: ${lockboxCode}

--- High-Speed Wi-Fi ---
• Network: ${wifiSsid}
• Password: ${wifiPass}

--- House Rules ---
${houseRules}

--- Check-out Instructions ---
${checkOutInstructions}

Have a wonderful stay! Please let us know if you need anything.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
              <Sparkles className="size-4" />
            </span>
            <DialogTitle className="text-base font-semibold">Guest Welcome Pack</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground">
            Check-in details and door access instructions ready to send to{" "}
            <span className="font-semibold text-foreground">{booking?.guest_name || "Guest"}</span>.
          </p>
        </DialogHeader>

        <div className="space-y-3.5 py-1 text-xs">
          {/* Property & Address */}
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-sm">{unitName}</span>
              <span className="text-[11px] text-muted-foreground">{propName}</span>
            </div>
            {fullAddress && (
              <p className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                {fullAddress}
              </p>
            )}
          </div>

          {/* Access & Wi-Fi Cards */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-lg border bg-card p-3 space-y-1.5 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1 text-[11px] font-medium">
                  <KeyRound className="size-3.5 text-rose-500" /> Lockbox Code
                </span>
                <button
                  type="button"
                  onClick={() => copyText(lockboxCode, "lockbox")}
                  className="text-muted-foreground hover:text-foreground"
                  title="Copy Code"
                >
                  {copiedSection === "lockbox" ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                </button>
              </div>
              <div className="font-mono text-base font-bold text-foreground tracking-wider">{lockboxCode}</div>
            </div>

            <div className="rounded-lg border bg-card p-3 space-y-1.5 shadow-sm">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="flex items-center gap-1 text-[11px] font-medium">
                  <Wifi className="size-3.5 text-sky-500" /> Wi-Fi Pass
                </span>
                <button
                  type="button"
                  onClick={() => copyText(wifiPass, "wifi")}
                  className="text-muted-foreground hover:text-foreground"
                  title="Copy Wi-Fi Password"
                >
                  {copiedSection === "wifi" ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                </button>
              </div>
              <div className="font-mono text-xs font-semibold text-foreground truncate">{wifiPass}</div>
              <div className="text-[10px] text-muted-foreground truncate">SSID: {wifiSsid}</div>
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-2.5 rounded-lg border bg-muted/10 p-2.5">
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-primary shrink-0" />
              <div>
                <span className="text-[10px] text-muted-foreground block">Check-in</span>
                <span className="font-semibold text-foreground">From {checkInTime}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 text-muted-foreground shrink-0" />
              <div>
                <span className="text-[10px] text-muted-foreground block">Check-out</span>
                <span className="font-semibold text-foreground">By {checkOutTime}</span>
              </div>
            </div>
          </div>

          {/* Rules & Check-out */}
          <div className="rounded-lg border bg-card p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <ShieldCheck className="size-3.5 text-emerald-500" /> House Rules & Departure
            </div>
            <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{houseRules}</p>
            {checkOutInstructions && (
              <div className="pt-1.5 border-t border-dashed">
                <span className="text-[10px] uppercase font-semibold text-muted-foreground block pb-0.5">Check-out Instructions:</span>
                <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{checkOutInstructions}</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-2 flex sm:justify-between items-center gap-2">
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => copyText(fullGuide, "all")}
            className="w-full bg-rose-600 hover:bg-rose-700 text-white gap-1.5"
          >
            {copiedSection === "all" ? (
              <>
                <Check className="size-3.5" /> Copied Full Guide to Clipboard!
              </>
            ) : (
              <>
                <Copy className="size-3.5" /> Copy Full Message for Guest
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
