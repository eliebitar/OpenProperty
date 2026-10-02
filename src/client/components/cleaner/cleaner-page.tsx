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
  Send,
  Wifi,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Home,
  ShieldAlert,
  Info,
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
  "Towels or bed linens need restock",
  "Toilet paper / shampoo / soap empty",
  "Kitchen supplies or coffee pods depleted",
  "Damage found or item broken",
  "Leftover items from previous guest",
  "Lockbox was left open or key was missing",
  "Excessively dirty - needed extra time",
];

const DEFAULT_CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: "1", text: "Strip bed linens and wash at 60°C", done: false },
  { id: "2", text: "Make bed with fresh crisp sheets, pillowcases & duvet", done: false },
  { id: "3", text: "Clean & sanitize bathroom (shower, toilet, sink & mirrors)", done: false },
  { id: "4", text: "Restock fresh bath towels, hand towels & toilet paper", done: false },
  { id: "5", text: "Clean kitchen counters, sink & empty refrigerator/microwave", done: false },
  { id: "6", text: "Restock coffee pods, tea bags, sugar & welcome water", done: false },
  { id: "7", text: "Vacuum all rugs and mop hardwood floors throughout", done: false },
  { id: "8", text: "Empty all trash bins and replace with fresh liners", done: false },
  { id: "9", text: "Confirm Wi-Fi card visible, TV remotes working & key in lockbox", done: false },
];

export function CleanerPage({ navigate }: { navigate?: (to: string) => void }) {
  const app = useApp();
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"today_upcoming" | "in_progress" | "completed" | "all">("today_upcoming");
  const [copiedCodeId, setCopiedCodeId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Issue modal
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueTask, setIssueTask] = useState<CleaningTask | null>(null);
  const [selectedIssuePresets, setSelectedIssuePresets] = useState<string[]>([]);
  const [issueNotes, setIssueNotes] = useState("");
  const [savingIssue, setSavingIssue] = useState(false);

  // Expanded items state
  const [expandedTasks, setExpandedTasks] = useState<Record<number, boolean>>({});

  const currentUser = app.simulatedUser || "You";

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
      showToast(allDone ? "Unchecked all items" : "All checklist items marked done!");
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
      showToast(`✨ ${task.unit_name} marked as Cleaned & Ready! Manager has been notified.`);
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
      title="Turnover Housekeeping Portal"
      description="Easy touch-friendly schedule and instructions for Airbnb turnovers."
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={loadTasks}
          disabled={loading}
          className="gap-1.5 h-8 text-xs"
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
    >
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-600 text-white px-4 py-3 shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="size-5 shrink-0 text-white" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Greeting Banner */}
      <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-r from-teal-500/15 via-sky-500/10 to-indigo-500/10 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-2xl">👋</span>
              <h2 className="text-lg md:text-xl font-bold tracking-tight text-foreground">
                Hello {currentUser}!
              </h2>
            </div>
            <p className="text-xs md:text-sm text-muted-foreground">
              Here is your turnover schedule. Start cleaning when guests depart and tap{" "}
              <strong className="text-teal-700 dark:text-teal-300">Mark as Cleaned</strong> when ready!
            </p>
          </div>

          {/* Quick Stat Pills */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border shadow-2xs">
              <Calendar className="size-4 text-teal-600" />
              <div>
                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Today</div>
                <div className="text-sm font-bold">{stats.todayCount} task{stats.todayCount === 1 ? "" : "s"}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border shadow-2xs">
              <Clock className="size-4 text-amber-500" />
              <div>
                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">In Progress</div>
                <div className="text-sm font-bold text-amber-600 dark:text-amber-400">{stats.inProgressCount}</div>
              </div>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-border shadow-2xs">
              <CheckCircle2 className="size-4 text-emerald-500" />
              <div>
                <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Cleaned</div>
                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{stats.completedTodayCount}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button
          variant={filter === "today_upcoming" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("today_upcoming")}
          className={`rounded-xl text-xs font-semibold h-8 ${
            filter === "today_upcoming" ? "bg-teal-600 hover:bg-teal-700 text-white" : ""
          }`}
        >
          ⏰ Today & Upcoming ({tasks.filter((t) => t.status !== "completed" || t.scheduled_date >= todayStr).length})
        </Button>
        <Button
          variant={filter === "in_progress" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("in_progress")}
          className={`rounded-xl text-xs font-semibold h-8 ${
            filter === "in_progress" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""
          }`}
        >
          🧹 In Progress ({stats.inProgressCount})
        </Button>
        <Button
          variant={filter === "completed" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("completed")}
          className={`rounded-xl text-xs font-semibold h-8 ${
            filter === "completed" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
          }`}
        >
          ✅ Finished / Cleaned ({tasks.filter((t) => t.status === "completed").length})
        </Button>
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
          className="rounded-xl text-xs font-semibold h-8"
        >
          All Tasks ({tasks.length})
        </Button>
      </div>

      {/* Task List */}
      {loading ? (
        <div className="py-16 text-center text-muted-foreground space-y-2">
          <RefreshCw className="size-6 animate-spin mx-auto text-teal-600" />
          <p className="text-sm">Loading your cleaning schedule...</p>
        </div>
      ) : filteredTasks.length === 0 ? (
        <Card className="p-12 text-center space-y-3 rounded-2xl border-dashed">
          <div className="mx-auto w-12 h-12 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-600">
            <Sparkles className="size-6" />
          </div>
          <h3 className="text-base font-bold">No tasks in this view</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            You're all caught up! New cleaning tasks will automatically appear when guests check out.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
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
                    ? "border-amber-500/50 shadow-md ring-2 ring-amber-500/20 bg-amber-500/[0.02]"
                    : isCompleted
                    ? "border-emerald-500/30 opacity-90 bg-emerald-500/[0.01]"
                    : "border-border shadow-xs hover:border-teal-500/40"
                }`}
              >
                {/* Status Bar */}
                <div
                  className={`h-2 w-full ${
                    isCompleted
                      ? "bg-emerald-500"
                      : isInProgress
                      ? "bg-amber-500"
                      : "bg-teal-500"
                  }`}
                />

                <div className="p-4 sm:p-6 space-y-4">
                  {/* Top Row: Unit, Property & Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-1.5">
                          <Home className="size-4 text-teal-600" />
                          {task.unit_name}
                        </h3>

                        {task.status === "in_progress" && (
                          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 font-semibold text-xs animate-pulse">
                            🧹 Cleaning In Progress
                          </Badge>
                        )}
                        {task.status === "completed" && (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-semibold text-xs">
                            ✅ Cleaned & Ready
                          </Badge>
                        )}
                        {task.status === "scheduled" && (
                          <Badge className="bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30 font-semibold text-xs">
                            📅 Scheduled
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground/80">{task.property_name}</span>
                        {task.property_address && (
                          <a
                            href={`https://maps.google.com/?q=${encodeURIComponent(
                              `${task.property_address}, ${task.property_city || ""}`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-teal-700 dark:text-teal-400 hover:underline"
                          >
                            <MapPin className="size-3" />
                            {task.property_address} {task.property_city ? `(${task.property_city})` : ""}
                            <ExternalLink className="size-2.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Lockbox Code Callout (Extremely Prominent) */}
                    {lockbox && (
                      <div className="flex items-center justify-between sm:justify-end gap-3 p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10">
                        <div className="flex items-center gap-2">
                          <KeyRound className="size-5 text-amber-600 dark:text-amber-400 shrink-0" />
                          <div>
                            <div className="text-[10px] uppercase font-bold text-amber-800 dark:text-amber-300 tracking-wider">
                              Lockbox Code
                            </div>
                            <div className="text-xl font-extrabold tracking-widest text-amber-950 dark:text-amber-200">
                              {lockbox}
                            </div>
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyLockbox(task)}
                          className="h-8 px-2.5 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 gap-1 font-semibold"
                        >
                          {copiedCodeId === task.id ? (
                            <>
                              <Check className="size-3.5 text-emerald-600" /> Copied
                            </>
                          ) : (
                            <>
                              <Copy className="size-3.5" /> Copy
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Turnover Timing Banner */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 p-3 rounded-xl bg-muted/40 border border-border text-xs">
                    <div>
                      <span className="text-muted-foreground block text-[11px] font-medium">Cleaning Scheduled:</span>
                      <span className="font-semibold text-foreground">
                        📅 {formatDate(task.scheduled_date)} at {task.scheduled_time || "11:00"}
                      </span>
                    </div>

                    <div>
                      <span className="text-muted-foreground block text-[11px] font-medium">Next Guest Check-in:</span>
                      <span className="font-semibold text-foreground">
                        {task.next_check_in_date ? (
                          <>
                            🧳 {formatDate(task.next_check_in_date)} at {task.next_check_in_time || "15:00"}
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">No immediate next booking</span>
                        )}
                      </span>
                    </div>

                    <div className="sm:col-span-2 md:col-span-1 flex items-center gap-1.5 font-medium text-teal-800 dark:text-teal-300">
                      <Clock className="size-3.5 shrink-0" />
                      <span>Turnover window: ~4 hours</span>
                    </div>
                  </div>

                  {/* Manager Notes */}
                  {task.notes && (
                    <div className="p-3 rounded-xl border border-sky-500/20 bg-sky-500/5 text-xs text-sky-900 dark:text-sky-200 flex items-start gap-2">
                      <Info className="size-4 text-sky-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-semibold">Special Instructions:</strong> {task.notes}
                      </div>
                    </div>
                  )}

                  {/* Reported Issue Alert */}
                  {task.issue_reported && (
                    <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2">
                      <ShieldAlert className="size-4 text-rose-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-semibold">Reported Issue:</strong> {task.issue_reported}
                      </div>
                    </div>
                  )}

                  {/* Checklist Section */}
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => toggleExpand(task.id)}
                        className="flex items-center gap-2 text-xs font-bold text-foreground hover:text-teal-600 transition-colors"
                      >
                        <CheckSquare className="size-4 text-teal-600" />
                        <span>Turnover Checklist ({completedItems}/{totalItems} items completed)</span>
                        {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                          {percent}%
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCheckAllItems(task)}
                          className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          {completedItems === totalItems ? "Uncheck all" : "Check all"}
                        </Button>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 rounded-full ${
                          percent === 100 ? "bg-emerald-500" : "bg-teal-500"
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    {/* Interactive Checklist Items */}
                    {isExpanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {checklist.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleToggleChecklistItem(task, item.id)}
                            className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all text-xs font-medium cursor-pointer ${
                              item.done
                                ? "border-emerald-500/30 bg-emerald-500/5 text-muted-foreground line-through"
                                : "border-border bg-card hover:border-teal-500/40 hover:bg-muted/30 text-foreground"
                            }`}
                          >
                            {item.done ? (
                              <CheckSquare className="size-4 text-emerald-600 shrink-0 mt-0.5" />
                            ) : (
                              <Square className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                            )}
                            <span className="leading-snug">{item.text}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Big Touch-Friendly Action Buttons */}
                  <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-t border-border pt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openIssueModal(task)}
                      className="rounded-xl h-10 text-xs font-semibold gap-1.5 text-muted-foreground hover:text-foreground border-border"
                    >
                      <AlertTriangle className="size-4 text-amber-500" />
                      Report Issue / Supplies
                    </Button>

                    <div className="flex items-center gap-2">
                      {!isInProgress && !isCompleted && (
                        <Button
                          size="sm"
                          onClick={() => handleStartCleaning(task)}
                          className="flex-1 sm:flex-initial rounded-xl h-10 px-5 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-sm gap-1.5"
                        >
                          <Sparkles className="size-4" /> Start Cleaning
                        </Button>
                      )}

                      {isInProgress && (
                        <Button
                          size="sm"
                          onClick={() => handleCompleteCleaning(task)}
                          className="flex-1 sm:flex-initial rounded-xl h-10 px-6 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm gap-1.5"
                        >
                          <CheckCircle2 className="size-4" /> Mark as Cleaned & Ready
                        </Button>
                      )}

                      {isCompleted && (
                        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg bg-emerald-500/10">
                          <CheckCircle2 className="size-4" />
                          <span>Unit is Ready for Guests</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Report Issue & Supplies Modal */}
      <Dialog open={issueModalOpen} onOpenChange={setIssueModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <AlertTriangle className="size-5 text-amber-500" />
              Report Issue / Supplies Needed
            </DialogTitle>
            <DialogDescription className="text-xs">
              Let the property manager know if supplies are running low or repairs are needed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                Quick Select Common Issues:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ISSUE_PRESETS.map((preset) => {
                  const selected = selectedIssuePresets.includes(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => toggleIssuePreset(preset)}
                      className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-colors ${
                        selected
                          ? "bg-amber-500/20 border-amber-500 text-amber-900 dark:text-amber-200 font-bold"
                          : "bg-muted/50 border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {selected ? "✓ " : "+ "}
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Additional Notes / Details:</label>
              <Textarea
                rows={3}
                placeholder="e.g. Broken reading lamp in master bedroom, or 2 extra bath towels needed for next arrival..."
                value={issueNotes}
                onChange={(e) => setIssueNotes(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setIssueModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveIssue}
              disabled={savingIssue}
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5"
            >
              <Send className="size-3.5" /> Submit Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
