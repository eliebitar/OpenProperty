import * as React from "react";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  ArrowRight,
  RotateCcw,
  Check,
} from "lucide-react";
import { cn, formatDate, toIsoDate } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export interface DateRangePickerProps {
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  onChange: (range: { startDate: string; endDate: string }) => void;
  minDate?: string; // 'YYYY-MM-DD'
  className?: string;
  disabled?: boolean;
  startTime?: string;
  endTime?: string;
  onTimeChange?: (times: { startTime: string; endTime: string }) => void;
  showTimeSelect?: boolean;
  placeholder?: string;
}

// Convert YYYY-MM-DD to local Date object (avoids UTC timezone shift)
function parseLocalDate(str: string): Date | null {
  if (!str) return null;
  const parts = str.split("-").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, days: number): Date {
  const res = new Date(d);
  res.setDate(res.getDate() + days);
  return res;
}

function isSameDay(d1: Date | null, d2: Date | null): boolean {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isDateInRange(target: Date, start: Date, end: Date): boolean {
  return target.getTime() > start.getTime() && target.getTime() < end.getTime();
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const STANDARD_CHECK_IN_TIMES = [
  "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"
];
const STANDARD_CHECK_OUT_TIMES = [
  "09:00", "10:00", "11:00", "12:00", "13:00"
];

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  minDate,
  className,
  disabled = false,
  startTime,
  endTime,
  onTimeChange,
  showTimeSelect = false,
  placeholder = "Select reservation range",
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Month currently displayed on left calendar
  const initialDate = parseLocalDate(startDate) || new Date();
  const [viewDate, setViewDate] = React.useState<Date>(
    new Date(initialDate.getFullYear(), initialDate.getMonth(), 1)
  );

  // Temporary selection state when in progress
  const [selectingStart, setSelectingStart] = React.useState<string | null>(null);
  const [hoverDate, setHoverDate] = React.useState<string | null>(null);

  // Sync view when startDate changes externally
  React.useEffect(() => {
    if (startDate) {
      const d = parseLocalDate(startDate);
      if (d) setViewDate(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }, [startDate]);

  // Reset in-flight selection when dialog opens/closes
  React.useEffect(() => {
    if (open) {
      setSelectingStart(null);
      setHoverDate(null);
    }
  }, [open]);

  const parsedStart = parseLocalDate(selectingStart || startDate);
  const parsedEnd = selectingStart ? null : parseLocalDate(endDate);
  const parsedHover = hoverDate ? parseLocalDate(hoverDate) : null;
  const parsedMin = minDate ? parseLocalDate(minDate) : null;

  // Calculate nights
  const nightsCount = React.useMemo(() => {
    if (!startDate || !endDate) return 0;
    const s = parseLocalDate(startDate);
    const e = parseLocalDate(endDate);
    if (!s || !e) return 0;
    const diff = Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(1, diff);
  }, [startDate, endDate]);

  const previewNights = React.useMemo(() => {
    if (selectingStart && hoverDate) {
      const s = parseLocalDate(selectingStart);
      const h = parseLocalDate(hoverDate);
      if (s && h && h.getTime() > s.getTime()) {
        const diff = Math.round((h.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
        return diff;
      }
    }
    return nightsCount;
  }, [selectingStart, hoverDate, nightsCount]);

  function handlePrevMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  }

  function handleNextMonth() {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  }

  function handleSelectDate(dateStr: string) {
    const d = parseLocalDate(dateStr);
    if (!d) return;

    if (parsedMin && d.getTime() < parsedMin.getTime()) {
      return; // Disabled
    }

    if (!selectingStart) {
      // First click: pick check-in date
      setSelectingStart(dateStr);
    } else {
      // Second click: pick check-out date
      const s = parseLocalDate(selectingStart);
      if (s && d.getTime() > s.getTime()) {
        // Valid forward range
        onChange({ startDate: selectingStart, endDate: dateStr });
        setSelectingStart(null);
        setHoverDate(null);
        setOpen(false);
      } else {
        // Clicked date is before or same as start: treat as new check-in date
        setSelectingStart(dateStr);
      }
    }
  }

  // Quick Presets
  function applyPreset(daysCount: number, startFromToday = true) {
    const today = new Date();
    const start = startFromToday ? today : addDays(today, 1);
    const end = addDays(start, daysCount);
    onChange({
      startDate: formatDateStr(start),
      endDate: formatDateStr(end),
    });
    setSelectingStart(null);
    setHoverDate(null);
    setOpen(false);
  }

  function applyWeekendPreset(nextWeek = false) {
    const d = new Date();
    const day = d.getDay(); // 0 is Sun, 5 is Fri
    let daysUntilFriday = (5 - day + 7) % 7;
    if (daysUntilFriday === 0 && day !== 5) daysUntilFriday = 7;
    if (nextWeek) daysUntilFriday += 7;

    const friday = addDays(d, daysUntilFriday);
    const sunday = addDays(friday, 2);
    onChange({
      startDate: formatDateStr(friday),
      endDate: formatDateStr(sunday),
    });
    setSelectingStart(null);
    setHoverDate(null);
    setOpen(false);
  }

  // Render a single month calendar grid
  function renderMonth(monthOffset = 0) {
    const targetMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + monthOffset, 1);
    const year = targetMonth.getFullYear();
    const month = targetMonth.getMonth();

    const firstDayIndex = targetMonth.getDay(); // 0 (Sun) to 6 (Sat)
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: React.ReactNode[] = [];

    // Empty cells before start of month
    for (let i = 0; i < firstDayIndex; i++) {
      cells.push(<div key={`empty-${i}`} className="h-9 w-9" />);
    }

    const todayStr = formatDateStr(new Date());

    for (let d = 1; d <= daysInMonth; d++) {
      const current = new Date(year, month, d);
      const dateStr = formatDateStr(current);

      const isToday = dateStr === todayStr;
      const isPast = parsedMin ? current.getTime() < parsedMin.getTime() : false;

      // Selection state determination
      const isStart = (selectingStart ? selectingStart === dateStr : startDate === dateStr);
      const isEnd = (!selectingStart && endDate === dateStr);

      let isInRange = false;
      let isInHoverRange = false;

      if (selectingStart && hoverDate) {
        const s = parseLocalDate(selectingStart);
        const h = parseLocalDate(hoverDate);
        if (s && h && h.getTime() > s.getTime()) {
          isInHoverRange = isDateInRange(current, s, h);
        }
      } else if (parsedStart && parsedEnd) {
        isInRange = isDateInRange(current, parsedStart, parsedEnd);
      }

      const isHoverEndpoint = selectingStart && hoverDate === dateStr && hoverDate > selectingStart;

      cells.push(
        <button
          key={dateStr}
          type="button"
          disabled={isPast || disabled}
          onClick={() => handleSelectDate(dateStr)}
          onMouseEnter={() => {
            if (selectingStart && dateStr >= selectingStart) {
              setHoverDate(dateStr);
            }
          }}
          className={cn(
            "relative h-9 w-9 p-0 text-xs font-medium transition-all flex items-center justify-center select-none",
            // Base hover
            !isPast && "hover:bg-rose-500/20 hover:text-rose-700 dark:hover:text-rose-300",
            // Disabled state
            isPast && "text-muted-foreground/30 cursor-not-allowed",
            // In range background strip
            (isInRange || isInHoverRange) && "bg-rose-500/15 text-rose-700 dark:text-rose-300 rounded-none",
            // Start endpoint
            isStart && "bg-rose-600 text-white font-bold rounded-l-full shadow-sm z-10 hover:bg-rose-600 hover:text-white",
            // End endpoint
            isEnd && "bg-rose-600 text-white font-bold rounded-r-full shadow-sm z-10 hover:bg-rose-600 hover:text-white",
            // If start & end are the same day (rare 0-night edge)
            isStart && isEnd && "rounded-full",
            // Hover preview endpoint
            isHoverEndpoint && "bg-rose-500 text-white rounded-r-full font-bold shadow-sm z-10",
            // Today indicator ring if not active
            isToday && !isStart && !isEnd && "ring-1 ring-rose-500/60 font-semibold"
          )}
        >
          {d}
        </button>
      );
    }

    return (
      <div className="space-y-2">
        <div className="text-center font-semibold text-xs text-foreground tracking-tight py-1">
          {MONTH_NAMES[month]} {year}
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {DAY_LABELS.map((day) => (
            <span key={day} className="text-[11px] font-medium text-muted-foreground w-9">
              {day}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1 gap-x-0.5 justify-items-center">
          {cells}
        </div>
      </div>
    );
  }

  // Format trigger label
  const hasRange = Boolean(startDate && endDate);

  return (
    <div className={cn("space-y-1.5", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex w-full items-center justify-between gap-2.5 rounded-lg border border-input bg-card px-3 py-2 text-left text-xs transition-all shadow-xs",
              "hover:border-rose-500/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/30",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <CalendarIcon className="size-4" />
              </div>
              {hasRange ? (
                <div className="flex items-center gap-2 text-foreground font-medium truncate">
                  <span className="font-semibold text-foreground">
                    {formatDate(startDate, { month: "short", day: "numeric" })}
                    {startTime && showTimeSelect ? ` · ${startTime}` : ""}
                  </span>
                  <ArrowRight className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="font-semibold text-foreground">
                    {formatDate(endDate, { month: "short", day: "numeric", year: "numeric" })}
                    {endTime && showTimeSelect ? ` · ${endTime}` : ""}
                  </span>
                </div>
              ) : (
                <span className="text-muted-foreground font-normal">{placeholder}</span>
              )}
            </div>

            {hasRange && (
              <span className="shrink-0 rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                {nightsCount} {nightsCount === 1 ? "night" : "nights"}
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-auto p-4 max-w-[95vw] shadow-2xl">
          {/* Header instructions & duration preview */}
          <div className="flex items-center justify-between border-b pb-3 mb-3">
            <div>
              <div className="text-xs font-semibold text-foreground">
                {selectingStart ? (
                  <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1.5 animate-pulse">
                    Select check-out date
                  </span>
                ) : (
                  <span>Select reservation stay dates</span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {selectingStart ? (
                  <>Check-in selected: {formatDate(selectingStart, { month: "short", day: "numeric" })}</>
                ) : hasRange ? (
                  <>{previewNights} {previewNights === 1 ? "night" : "nights"} selected</>
                ) : (
                  "Click to pick check-in and check-out dates"
                )}
              </div>
            </div>

            {/* Month Navigation */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handlePrevMonth}
                aria-label="Previous month"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleNextMonth}
                aria-label="Next month"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          {/* Quick Presets Toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b mb-3 text-[11px]">
            <span className="text-muted-foreground font-medium mr-1">Presets:</span>
            <button
              type="button"
              onClick={() => applyPreset(3)}
              className="rounded-md border bg-muted/40 hover:bg-rose-500/10 hover:border-rose-500/40 px-2 py-0.5 font-medium transition-colors"
            >
              3 Nights
            </button>
            <button
              type="button"
              onClick={() => applyWeekendPreset(false)}
              className="rounded-md border bg-muted/40 hover:bg-rose-500/10 hover:border-rose-500/40 px-2 py-0.5 font-medium transition-colors"
            >
              This Weekend
            </button>
            <button
              type="button"
              onClick={() => applyWeekendPreset(true)}
              className="rounded-md border bg-muted/40 hover:bg-rose-500/10 hover:border-rose-500/40 px-2 py-0.5 font-medium transition-colors"
            >
              Next Weekend
            </button>
            <button
              type="button"
              onClick={() => applyPreset(7)}
              className="rounded-md border bg-muted/40 hover:bg-rose-500/10 hover:border-rose-500/40 px-2 py-0.5 font-medium transition-colors"
            >
              1 Week
            </button>
            <button
              type="button"
              onClick={() => applyPreset(14)}
              className="rounded-md border bg-muted/40 hover:bg-rose-500/10 hover:border-rose-500/40 px-2 py-0.5 font-medium transition-colors"
            >
              2 Weeks
            </button>
          </div>

          {/* Dual Calendar Display (side-by-side on sm/md screens) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {renderMonth(0)}
            {renderMonth(1)}
          </div>

          {/* Optional Check-in / Check-out Times */}
          {showTimeSelect && onTimeChange && (
            <div className="mt-4 pt-3 border-t flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Clock className="size-3.5 text-rose-500" />
                <span>Check-in / Check-out Hours</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground">In:</span>
                  <select
                    value={startTime || "15:00"}
                    onChange={(e) => onTimeChange({ startTime: e.target.value, endTime: endTime || "11:00" })}
                    className="rounded border border-input bg-background px-1.5 py-0.5 text-xs font-mono"
                  >
                    {STANDARD_CHECK_IN_TIMES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[11px] text-muted-foreground">Out:</span>
                  <select
                    value={endTime || "11:00"}
                    onChange={(e) => onTimeChange({ startTime: startTime || "15:00", endTime: e.target.value })}
                    className="rounded border border-input bg-background px-1.5 py-0.5 text-xs font-mono"
                  >
                    {STANDARD_CHECK_OUT_TIMES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Footer Controls */}
          <div className="mt-4 pt-3 border-t flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-xs h-7 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSelectingStart(null);
                setHoverDate(null);
                const today = new Date();
                const outDate = addDays(today, 3);
                onChange({
                  startDate: formatDateStr(today),
                  endDate: formatDateStr(outDate),
                });
              }}
            >
              <RotateCcw className="size-3 mr-1" /> Reset to 3 Nights
            </Button>

            <Button
              type="button"
              size="sm"
              className="h-7 text-xs bg-rose-600 hover:bg-rose-700 text-white font-medium"
              onClick={() => {
                setSelectingStart(null);
                setHoverDate(null);
                setOpen(false);
              }}
            >
              <Check className="size-3 mr-1" /> Done
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
