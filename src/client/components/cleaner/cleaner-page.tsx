import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  CheckCircle2,
  Clock,
  MapPin,
  KeyRound,
  CheckSquare,
  Square,
  AlertTriangle,
  Calendar,
  ExternalLink,
  Copy,
  Check,
  Wifi,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Home,
  ShieldAlert,
  Info,
  Phone,
  RotateCcw,
  Navigation,
  CheckCircle,
} from "lucide-react";
import { useApp } from "@/context";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate } from "@/lib/utils";
import type { ChecklistItem, CleaningTask } from "@/types";

const ISSUE_PRESETS = [
  "🧻 Toilet paper / soap / shampoo empty",
  "🧺 Need fresh towels or bed linens restocked",
  "☕ Coffee pods, tea, or sugar depleted",
  "🔨 Damaged item or maintenance issue found",
  "🧳 Leftover belongings from previous guest",
  "🔑 Lockbox issue or key was missing",
  "⏰ Unit excessively dirty - need more time",
];

const DEFAULT_CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: "1", text: "Strip bed sheets & pillowcases and wash at 60°C", done: false },
  { id: "2", text: "Make beds with fresh, crisp sheets, duvet & pillowcases", done: false },
  { id: "3", text: "Clean & sanitize bathroom (shower, toilet, sink & mirrors)", done: false },
  { id: "4", text: "Restock fresh bath towels, hand towels & toilet paper", done: false },
  { id: "5", text: "Clean kitchen counters, sink & empty refrigerator/microwave", done: false },
  { id: "6", text: "Restock coffee pods, tea bags, sugar & welcome water", done: false },
  { id: "7", text: "Vacuum rugs and mop all hardwood floors throughout", done: false },
  { id: "8", text: "Empty all trash bins and put in fresh trash liners", done: false },
  { id: "9", text: "Lock front door and return keys securely to lockbox", done: false },
];

export function CleanerPage({ navigate }: { navigate?: (to: string) => void }) {
  const app = useApp();
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"today_upcoming" | "in_progress" | "completed" | "all">("today_upcoming");
  const [copiedCodeId, setCopiedCodeId] = useState<number | null>(null);
  const [copiedWifiTaskId, setCopiedWifiTaskId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Issue reporting modal
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueTask, setIssueTask] = useState<CleaningTask | null>(null);
  const [selectedIssuePresets, setSelectedIssuePresets] = useState<string[]>([]);
  const [issueNotes, setIssueNotes] = useState("");
  const [savingIssue, setSavingIssue] = useState(false);

  // Expanded items state (default all expanded for immediate access)
  const [expandedTasks, setExpandedTasks] = useState<Record<number, boolean>>({});

  const currentUser = app.simulatedUser || "Cleaner";

  async function loadTasks() {
    try {
      setLoading(true);
      const list = await app.listCleaningTasks();
      setTasks(list);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.activeOrganization?.id, app.simulatedUser]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleCopyLockbox = (task: CleaningTask) => {
    const code = task.airbnb_lockbox_code || task.lockbox_code;
    if (code) {
      navigator.clipboard.writeText(code);
      setCopiedCodeId(task.id);
      showToast(`Copied lockbox code: ${code}`);
      setTimeout(() => setCopiedCodeId(null), 2500);
    }
  };

  const handleCopyWifi = (task: CleaningTask) => {
    if (task.airbnb_wifi_password) {
      navigator.clipboard.writeText(task.airbnb_wifi_password);
      setCopiedWifiTaskId(task.id);
      showToast("Copied Wi-Fi password!");
      setTimeout(() => setCopiedWifiTaskId(null), 2500);
    }
  };

  const getMapsUrl = (task: CleaningTask) => {
    const address = [task.property_address, task.property_city].filter(Boolean).join(", ");
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || task.property_name)}`;
  };

  const parseChecklist = (task: CleaningTask): ChecklistItem[] => {
    if (!task.checklist) return DEFAULT_CHECKLIST_ITEMS;
    try {
      const parsed = JSON.parse(task.checklist);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
      /* ignore */
    }
    return DEFAULT_CHECKLIST_ITEMS;
  };

  const handleToggleChecklistItem = async (task: CleaningTask, itemId: string) => {
    const current = parseChecklist(task);
    const updated = current.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );

    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, checklist: JSON.stringify(updated) } : t))
    );

    try {
      await app.updateCleaningTask(task.id, { checklist: updated });
    } catch (err) {
      app.setError((err as Error).message);
      loadTasks();
    }
  };

  const handleCheckAllItems = async (task: CleaningTask) => {
    const current = parseChecklist(task);
    const allDone = current.every((i) => i.done);
    const updated = current.map((item) => ({ ...item, done: !allDone }));

    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, checklist: JSON.stringify(updated) } : t))
    );

    try {
      await app.updateCleaningTask(task.id, { checklist: updated });
      showToast(allDone ? "Reset checklist items" : "All checklist items completed! Great job!");
    } catch (err) {
      app.setError((err as Error).message);
      loadTasks();
    }
  };

  const handleStartCleaning = async (task: CleaningTask) => {
    try {
      const updated = await app.updateCleaningTask(task.id, { status: "in_progress" });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      showToast(`▶ Started cleaning: ${task.unit_name}`);
    } catch (err) {
      app.setError((err as Error).message);
    }
  };

  const handleCompleteCleaning = async (task: CleaningTask) => {
    try {
      const updated = await app.updateCleaningTask(task.id, { status: "completed" });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      showToast(`✨ ${task.unit_name} is Cleaned & Ready! Property manager has been notified.`);
    } catch (err) {
      app.setError((err as Error).message);
    }
  };

  const handleReopenCleaning = async (task: CleaningTask) => {
    try {
      const updated = await app.updateCleaningTask(task.id, { status: "in_progress" });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
      showToast(`Reopened cleaning task for ${task.unit_name}`);
    } catch (err) {
      app.setError((err as Error).message);
    }
  };

  const openIssueModal = (task: CleaningTask) => {
    setIssueTask(task);
    setSelectedIssuePresets([]);
    setIssueNotes(task.issue_reported || "");
    setIssueModalOpen(true);
  };

  const toggleIssuePreset = (preset: string) => {
    setSelectedIssuePresets((prev) =>
      prev.includes(preset) ? prev.filter((p) => p !== preset) : [...prev, preset]
    );
  };

  const handleSaveIssue = async () => {
    if (!issueTask) return;
    try {
      setSavingIssue(true);
      const combined = [
        ...selectedIssuePresets,
        issueNotes.trim(),
      ]
        .filter(Boolean)
        .join(". ");

      const updated = await app.updateCleaningTask(issueTask.id, {
        issue_reported: combined || null,
      });
      setTasks((prev) => prev.map((t) => (t.id === issueTask.id ? updated : t)));
      setIssueModalOpen(false);
      showToast("Report submitted to manager successfully.");
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSavingIssue(false);
    }
  };

  const toggleExpand = (taskId: number) => {
    setExpandedTasks((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayFormatted = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(new Date());

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filter === "today_upcoming") {
        return t.status !== "completed" || t.scheduled_date >= todayStr;
      }
      if (filter === "in_progress") {
        return t.status === "in_progress";
      }
      if (filter === "completed") {
        return t.status === "completed";
      }
      return true;
    });
  }, [tasks, filter, todayStr]);

  const stats = useMemo(() => {
    const todayTasks = tasks.filter((t) => t.scheduled_date === todayStr);
    const inProgress = tasks.filter((t) => t.status === "in_progress");
    const completedToday = tasks.filter((t) => t.status === "completed" && t.scheduled_date === todayStr);
    return {
      todayCount: todayTasks.length,
      inProgressCount: inProgress.length,
      completedTodayCount: completedToday.length,
    };
  }, [tasks, todayStr]);

  return (
    <PageShell
      title="My Cleaning Tasks"
      meta={todayFormatted}
      width="max-w-3xl"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={loadTasks}
          disabled={loading}
          className="gap-1.5 h-8 text-xs font-semibold"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </Button>
      }
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 z-50 flex items-center gap-2.5 rounded-2xl border border-teal-500/40 bg-teal-600 text-white px-4 py-3.5 shadow-2xl text-sm font-bold animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="size-5 shrink-0 text-white" />
          <span className="flex-1 leading-snug">{toastMessage}</span>
        </div>
      )}

      {/* Welcoming Cleaner Header */}
      <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-500/15 via-sky-500/10 to-indigo-500/10 p-4 sm:p-5 shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🧹</span>
              <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground">
                Welcome back!
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              Check out departures below, use the lockbox code to enter, and tap{" "}
              <strong className="text-emerald-700 dark:text-emerald-300 font-bold">Mark Cleaned</strong> when the unit is ready for incoming guests!
            </p>
          </div>
        </div>

        {/* Big Quick Stats Pills */}
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-card border border-border shadow-2xs text-center">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Calendar className="size-3 text-teal-600" /> Today
            </div>
            <div className="text-lg sm:text-xl font-extrabold text-foreground">{stats.todayCount}</div>
          </div>

          <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-card border border-border shadow-2xs text-center">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Clock className="size-3 text-amber-500" /> In Progress
            </div>
            <div className="text-lg sm:text-xl font-extrabold text-amber-600 dark:text-amber-400">{stats.inProgressCount}</div>
          </div>

          <div className="flex flex-col items-center justify-center p-2.5 rounded-xl bg-card border border-border shadow-2xs text-center">
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <CheckCircle className="size-3 text-emerald-500" /> Cleaned
            </div>
            <div className="text-lg sm:text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{stats.completedTodayCount}</div>
          </div>
        </div>
      </div>

      {/* Mobile-Friendly Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
        <button
          type="button"
          onClick={() => setFilter("today_upcoming")}
          className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
            filter === "today_upcoming"
              ? "bg-teal-600 text-white shadow-xs"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          ⏰ Today & Upcoming ({tasks.filter((t) => t.status !== "completed" || t.scheduled_date >= todayStr).length})
        </button>

        <button
          type="button"
          onClick={() => setFilter("in_progress")}
          className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
            filter === "in_progress"
              ? "bg-amber-600 text-white shadow-xs"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          🧹 Cleaning ({stats.inProgressCount})
        </button>

        <button
          type="button"
          onClick={() => setFilter("completed")}
          className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
            filter === "completed"
              ? "bg-emerald-600 text-white shadow-xs"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          ✅ Finished ({tasks.filter((t) => t.status === "completed").length})
        </button>

        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
            filter === "all"
              ? "bg-foreground text-background shadow-xs"
              : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          All ({tasks.length})
        </button>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground space-y-3">
          <RefreshCw className="size-8 animate-spin mx-auto text-teal-600" />
          <p className="text-sm font-semibold">Loading your cleaning schedule...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <Card className="p-10 text-center space-y-3 rounded-2xl border-dashed">
          <div className="mx-auto w-14 h-14 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-600">
            <Sparkles className="size-7" />
          </div>
          <h3 className="text-base font-bold text-foreground">No tasks scheduled in this view</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
            You're all set! When guests depart or check out, your new cleaning schedules with lockbox codes will appear right here.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredTasks.map((task) => {
            const checklist = parseChecklist(task);
            const totalItems = checklist.length;
            const completedItems = checklist.filter((i) => i.done).length;
            const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
            const isExpanded = expandedTasks[task.id] !== false; // expanded by default
            const lockbox = task.airbnb_lockbox_code || task.lockbox_code;
            const isCompleted = task.status === "completed";
            const isInProgress = task.status === "in_progress";

            return (
              <Card
                key={task.id}
                className={`overflow-hidden rounded-2xl border transition-all duration-200 ${
                  isInProgress
                    ? "border-amber-500/60 shadow-md ring-2 ring-amber-500/20 bg-amber-500/[0.02]"
                    : isCompleted
                    ? "border-emerald-500/40 bg-emerald-500/[0.01]"
                    : "border-border shadow-xs hover:border-teal-500/40"
                }`}
              >
                {/* Top Status Stripe */}
                <div
                  className={`h-2.5 w-full ${
                    isCompleted
                      ? "bg-emerald-500"
                      : isInProgress
                      ? "bg-amber-500 animate-pulse"
                      : "bg-teal-500"
                  }`}
                />

                <div className="p-4 sm:p-5 space-y-4">
                  {/* Unit & Address Header */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-xl sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
                          <Home className="size-5 sm:size-6 text-teal-600 shrink-0" />
                          {task.unit_name}
                        </h3>
                        <p className="text-xs sm:text-sm font-semibold text-muted-foreground">
                          {task.property_name}
                        </p>
                      </div>

                      {/* Status Badges */}
                      <div>
                        {isInProgress && (
                          <Badge className="bg-amber-500/20 text-amber-800 dark:text-amber-200 border-amber-500/40 font-bold text-xs py-1 px-2.5 animate-pulse">
                            🧹 Cleaning In Progress
                          </Badge>
                        )}
                        {isCompleted && (
                          <Badge className="bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 border-emerald-500/40 font-bold text-xs py-1 px-2.5">
                            ✅ Cleaned & Ready
                          </Badge>
                        )}
                        {!isInProgress && !isCompleted && (
                          <Badge className="bg-teal-500/20 text-teal-800 dark:text-teal-200 border-teal-500/40 font-bold text-xs py-1 px-2.5">
                            📅 Scheduled
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Address with 1-Tap Google Maps Button */}
                    {task.property_address && (
                      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-muted/40 border border-border/70 text-xs">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1 text-muted-foreground">
                          <MapPin className="size-4 text-rose-500 shrink-0" />
                          <span className="truncate font-medium text-foreground">
                            {task.property_address} {task.property_city ? `(${task.property_city})` : ""}
                          </span>
                        </div>
                        <a
                          href={getMapsUrl(task)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-bold text-xs text-teal-700 dark:text-teal-300 hover:text-teal-800 bg-teal-500/10 hover:bg-teal-500/20 px-2.5 py-1 rounded-lg transition-colors shrink-0"
                        >
                          <Navigation className="size-3" />
                          <span>Open Maps</span>
                          <ExternalLink className="size-2.5" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* HERO LOCKBOX CODE (High contrast, impossible to miss) */}
                  <div className="rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-orange-500/10 p-3.5 sm:p-4 shadow-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
                          <KeyRound className="size-6" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-[11px] uppercase font-bold tracking-wider text-amber-900 dark:text-amber-300 block">
                            Key / Door Lockbox Code
                          </span>
                          <span className="font-mono text-2xl sm:text-3xl font-black tracking-widest text-foreground block">
                            {lockbox || "No code set"}
                          </span>
                        </div>
                      </div>

                      {lockbox && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopyLockbox(task)}
                          className="h-10 px-3.5 rounded-xl border-amber-500/40 bg-card hover:bg-amber-500/20 font-bold text-xs gap-1.5 text-foreground shrink-0 shadow-xs"
                        >
                          {copiedCodeId === task.id ? (
                            <>
                              <Check className="size-4 text-emerald-600" />
                              <span className="text-emerald-700 dark:text-emerald-400">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="size-4 text-amber-600" />
                              <span>Copy Code</span>
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Turnover Timing Timeline */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-muted/30 border border-border/80 text-xs">
                    <div className="space-y-0.5">
                      <span className="text-[11px] text-muted-foreground font-medium block">
                        🚪 Guest Departed:
                      </span>
                      <span className="font-bold text-foreground text-xs sm:text-sm block">
                        {formatDate(task.scheduled_date)} at {task.scheduled_time || "11:00"}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <span className="text-[11px] text-muted-foreground font-medium block">
                        🧳 Next Guest Check-in:
                      </span>
                      <span className="font-bold text-foreground text-xs sm:text-sm block">
                        {task.next_check_in_date ? (
                          <>
                            {formatDate(task.next_check_in_date)} at {task.next_check_in_time || "15:00"}
                          </>
                        ) : (
                          <span className="text-muted-foreground italic font-normal">None booked yet</span>
                        )}
                      </span>
                    </div>

                    <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-start gap-1.5 text-teal-800 dark:text-teal-300 font-semibold bg-teal-500/10 p-2 rounded-lg border border-teal-500/20">
                      <Clock className="size-4 text-teal-600 shrink-0" />
                      <span>Window: ~4 hours turnover</span>
                    </div>
                  </div>

                  {/* Special Host Instructions */}
                  {task.notes && (
                    <div className="p-3 rounded-xl border border-sky-500/30 bg-sky-500/10 text-xs text-sky-950 dark:text-sky-200 flex items-start gap-2.5">
                      <Info className="size-4 text-sky-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-bold text-sky-900 dark:text-sky-100">Host Instructions:</strong>{" "}
                        {task.notes}
                      </div>
                    </div>
                  )}

                  {/* Wi-Fi Details Card (Collapsible) */}
                  {(task.airbnb_wifi_ssid || task.airbnb_wifi_password) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border border-border bg-card text-xs">
                      <div className="flex items-center gap-2">
                        <Wifi className="size-4 text-sky-500 shrink-0" />
                        <span className="font-semibold text-muted-foreground">Unit Wi-Fi:</span>
                        <strong className="font-mono text-foreground">{task.airbnb_wifi_ssid || "Host Wi-Fi"}</strong>
                      </div>
                      {task.airbnb_wifi_password && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono bg-muted/60 px-2 py-0.5 rounded text-[11px]">
                            {task.airbnb_wifi_password}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopyWifi(task)}
                            className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            {copiedWifiTaskId === task.id ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reported Issue Warning (if any) */}
                  {task.issue_reported && (
                    <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-950 dark:text-rose-200 flex items-start gap-2.5">
                      <ShieldAlert className="size-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-bold text-rose-900 dark:text-rose-100">Reported Issue / Supplies:</strong>{" "}
                        {task.issue_reported}
                      </div>
                    </div>
                  )}

                  {/* INTERACTIVE CLEANING CHECKLIST */}
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpand(task.id)}
                        className="flex items-center gap-2 text-xs sm:text-sm font-extrabold text-foreground hover:text-teal-600 transition-colors text-left"
                      >
                        <CheckSquare className="size-4 text-teal-600" />
                        <span>Cleaning Checklist ({completedItems}/{totalItems})</span>
                        {isExpanded ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-teal-700 dark:text-teal-300">
                          {percent}%
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCheckAllItems(task)}
                          className="h-7 px-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground rounded-lg"
                        >
                          {completedItems === totalItems ? "Reset" : "Check all"}
                        </Button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2.5 w-full rounded-full bg-muted/60 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          percent === 100 ? "bg-emerald-500" : "bg-teal-500"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    {/* Checklist Items */}
                    {isExpanded && (
                      <div className="space-y-1.5 pt-1">
                        {checklist.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleToggleChecklistItem(task, item.id)}
                            className={`w-full flex items-center gap-3 p-3 sm:p-3.5 rounded-xl border text-left transition-all cursor-pointer min-h-[48px] ${
                              item.done
                                ? "border-emerald-500/30 bg-emerald-500/5 text-muted-foreground"
                                : "border-border bg-card hover:border-teal-500/40 hover:bg-muted/30 text-foreground"
                            }`}
                          >
                            <div className="shrink-0">
                              {item.done ? (
                                <CheckSquare className="size-5 text-emerald-600" />
                              ) : (
                                <Square className="size-5 text-muted-foreground" />
                              )}
                            </div>
                            <span className={`text-xs sm:text-sm font-medium leading-snug ${item.done ? "line-through opacity-80" : ""}`}>
                              {item.text}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* BIG THUMB-ZONE ACTION BUTTONS */}
                  <div className="space-y-2.5 pt-3 border-t border-border/80">
                    {/* Primary Workflow Actions */}
                    {!isInProgress && !isCompleted && (
                      <Button
                        size="lg"
                        onClick={() => handleStartCleaning(task)}
                        className="w-full h-12 sm:h-13 rounded-xl text-sm sm:text-base font-extrabold bg-gradient-to-r from-teal-600 to-sky-600 hover:from-teal-700 hover:to-sky-700 text-white shadow-md gap-2 cursor-pointer"
                      >
                        <Sparkles className="size-5" />
                        <span>Start Cleaning This Unit</span>
                      </Button>
                    )}

                    {isInProgress && (
                      <Button
                        size="lg"
                        onClick={() => handleCompleteCleaning(task)}
                        className="w-full h-13 sm:h-14 rounded-xl text-base sm:text-lg font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg gap-2 cursor-pointer active:scale-[0.99] transition-transform"
                      >
                        <CheckCircle2 className="size-6 text-white" />
                        <span>✓ Mark as Cleaned & Ready</span>
                      </Button>
                    )}

                    {isCompleted && (
                      <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-extrabold text-xs sm:text-sm">
                          <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
                          <span>Unit is fully cleaned & ready for guests!</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReopenCleaning(task)}
                          className="h-7 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                        >
                          <RotateCcw className="size-3" /> Reopen
                        </Button>
                      </div>
                    )}

                    {/* Secondary Action: Report Issue / Supplies */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openIssueModal(task)}
                      className="w-full h-10 rounded-xl text-xs font-bold gap-2 text-muted-foreground hover:text-foreground border-border hover:bg-muted/40 cursor-pointer"
                    >
                      <AlertTriangle className="size-4 text-amber-500" />
                      <span>Report Issue / Low Supplies</span>
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Quick Help Footer */}
      <div className="rounded-2xl border border-border bg-card p-4 text-center space-y-1.5 shadow-2xs">
        <h4 className="text-xs font-bold text-foreground">Need help or locked out?</h4>
        <p className="text-[11px] text-muted-foreground">
          Contact your property manager directly or submit a report using the "Report Issue" button on the unit card.
        </p>
      </div>

      {/* Report Issue & Supplies Modal (Mobile Optimized) */}
      <Dialog open={issueModalOpen} onOpenChange={setIssueModalOpen}>
        <DialogContent className="w-[95vw] max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <AlertTriangle className="size-5 text-amber-500" />
              Report Issue / Supplies
            </DialogTitle>
            <DialogDescription className="text-xs">
              Let the property manager know about missing supplies, damages, or if you need extra time for {issueTask?.unit_name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-bold text-foreground block mb-1.5">
                Quick Selection (Tap to add):
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ISSUE_PRESETS.map((preset) => {
                  const isSelected = selectedIssuePresets.includes(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => toggleIssuePreset(preset)}
                      className={`text-xs px-2.5 py-1.5 rounded-xl border font-medium transition-colors text-left ${
                        isSelected
                          ? "border-amber-500 bg-amber-500/15 text-amber-900 dark:text-amber-200 font-bold"
                          : "border-border bg-muted/40 text-muted-foreground hover:border-border hover:text-foreground"
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="issue-notes" className="text-xs font-bold text-foreground">
                Additional Notes / Details:
              </label>
              <Textarea
                id="issue-notes"
                placeholder="e.g. Only 1 roll of toilet paper left in storage. Please order more."
                value={issueNotes}
                onChange={(e) => setIssueNotes(e.target.value)}
                rows={3}
                className="text-xs rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIssueModalOpen(false)}
              className="h-10 rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveIssue}
              disabled={savingIssue || (selectedIssuePresets.length === 0 && !issueNotes.trim())}
              className="h-10 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white gap-1.5"
            >
              <Send className="size-3.5" />
              <span>{savingIssue ? "Sending…" : "Send Report to Host"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
