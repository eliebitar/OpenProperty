import { useEffect, useMemo, useState } from "react";
import {
  Sparkles,
  Users,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Mail,
  Send,
  Plus,
  Trash2,
  Home,
  UserCheck,
  Building2,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import type { CleaningTask, OrganizationMember, Unit } from "@/types";

interface Props {
  airbnbUnits: Unit[];
  navigate?: (to: string) => void;
}

export function TurnoverCleanersTab({ airbnbUnits, navigate }: Props) {
  const app = useApp();
  const [tasks, setTasks] = useState<CleaningTask[]>([]);
  const [cleaners, setCleaners] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [cleanerFilter, setCleanerFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [sendingReminderId, setSendingReminderId] = useState<number | null>(null);

  // New cleaning task modal
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [selectedCleanerId, setSelectedCleanerId] = useState<string>("none");
  const [scheduledDate, setScheduledDate] = useState<string>("");
  const [scheduledTime, setScheduledTime] = useState<string>("11:00");
  const [nextCheckInDate, setNextCheckInDate] = useState<string>("");
  const [nextCheckInTime, setNextCheckInTime] = useState<string>("15:00");
  const [taskNotes, setTaskNotes] = useState<string>("");
  const [savingTask, setSavingTask] = useState<boolean>(false);

  // Add cleaner modal
  const [addCleanerOpen, setAddCleanerOpen] = useState(false);
  const [cleanerName, setCleanerName] = useState("");
  const [cleanerEmail, setCleanerEmail] = useState("");
  const [invitingCleaner, setInvitingCleaner] = useState(false);

  async function loadData() {
    try {
      setLoading(true);
      const [taskList, cleanerList] = await Promise.all([
        app.listCleaningTasks(),
        app.listCleaners(),
      ]);
      setTasks(taskList);
      setCleaners(cleanerList);
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.activeOrganization?.id]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleSendReminder = async (task: CleaningTask) => {
    if (!task.cleaner_id) return;
    try {
      setSendingReminderId(task.id);
      const res = await app.sendCleaningReminder(task.id);
      if (res.ok) {
        showToast(`Email reminder sent to ${task.cleaner_name || "cleaner"} (${task.cleaner_email})!`);
        // Update task reminder timestamp locally
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, reminder_sent_at: new Date().toISOString() } : t))
        );
      } else {
        showToast("Reminder triggered in test/simulated mode.");
      }
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSendingReminderId(null);
    }
  };

  const handleReassignCleaner = async (taskId: number, newCleanerIdStr: string) => {
    try {
      const cleanerId = newCleanerIdStr === "none" ? null : parseInt(newCleanerIdStr, 10);
      const updated = await app.updateCleaningTask(taskId, { cleaner_id: cleanerId });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      showToast("Cleaner assignment updated.");
    } catch (err) {
      app.setError((err as Error).message);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!confirm("Are you sure you want to cancel and delete this cleaning task?")) return;
    try {
      await app.deleteCleaningTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      showToast("Cleaning task removed.");
    } catch (err) {
      app.setError((err as Error).message);
    }
  };

  const openNewScheduleModal = (unitId?: number) => {
    const today = new Date().toISOString().slice(0, 10);
    const targetUnit = unitId ? airbnbUnits.find((u) => u.id === unitId) : airbnbUnits[0];

    setSelectedUnitId(String(targetUnit?.id || ""));
    setSelectedCleanerId(targetUnit?.cleaner_id ? String(targetUnit.cleaner_id) : "none");
    setScheduledDate(today);
    setScheduledTime(targetUnit?.airbnb_check_out_time || "11:00");
    setNextCheckInDate(today);
    setNextCheckInTime(targetUnit?.airbnb_check_in_time || "15:00");
    setTaskNotes("");
    setScheduleModalOpen(true);
  };

  const handleSaveCleaningTask = async () => {
    const uId = parseInt(selectedUnitId, 10);
    if (!uId || !scheduledDate) return;

    try {
      setSavingTask(true);
      const cId = selectedCleanerId === "none" ? null : parseInt(selectedCleanerId, 10);
      const created = await app.createCleaningTask({
        unit_id: uId,
        cleaner_id: cId,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime || "11:00",
        next_check_in_date: nextCheckInDate || null,
        next_check_in_time: nextCheckInTime || "15:00",
        notes: taskNotes.trim() || null,
      });
      setTasks((prev) => [created, ...prev]);
      setScheduleModalOpen(false);
      showToast("Turnover cleaning scheduled & cleaner notified!");
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setSavingTask(false);
    }
  };

  const handleInviteCleaner = async () => {
    if (!cleanerEmail.trim() || !cleanerName.trim()) return;
    try {
      setInvitingCleaner(true);
      await app.inviteOrganizationMember({
        name: cleanerName.trim(),
        email: cleanerEmail.trim(),
        role: "cleaner",
      });
      showToast(`Cleaner profile created & invite sent to ${cleanerEmail}!`);
      setAddCleanerOpen(false);
      setCleanerName("");
      setCleanerEmail("");
      await loadData();
    } catch (err) {
      app.setError((err as Error).message);
    } finally {
      setInvitingCleaner(false);
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (unitFilter !== "all" && t.unit_id !== parseInt(unitFilter, 10)) return false;
      if (cleanerFilter !== "all") {
        if (cleanerFilter === "unassigned" && t.cleaner_id) return false;
        if (cleanerFilter !== "unassigned" && t.cleaner_id !== parseInt(cleanerFilter, 10)) return false;
      }
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      return true;
    });
  }, [tasks, unitFilter, cleanerFilter, statusFilter]);

  const summary = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const scheduled = tasks.filter((t) => t.status === "scheduled").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const completedToday = tasks.filter((t) => t.status === "completed" && t.scheduled_date === today).length;
    return { scheduled, inProgress, completedToday };
  }, [tasks]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-2 rounded-xl border border-teal-500/30 bg-teal-600 text-white px-4 py-3 shadow-xl text-sm font-semibold animate-in fade-in slide-in-from-top-4 duration-200">
          <CheckCircle2 className="size-5 shrink-0 text-white" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* KPI Cards */}
      <section className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
        <Card className="p-4 space-y-1 rounded-xl border border-border">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Cleaners Registered</span>
            <Users className="size-4 text-teal-600" />
          </div>
          <div className="text-2xl font-bold">{cleaners.length}</div>
          <div className="text-[11px] text-muted-foreground">Team housekeeping members</div>
        </Card>

        <Card className="p-4 space-y-1 rounded-xl border border-border">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Pending Turnovers</span>
            <Clock className="size-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.scheduled}</div>
          <div className="text-[11px] text-muted-foreground">Departures awaiting cleaning</div>
        </Card>

        <Card className="p-4 space-y-1 rounded-xl border border-border">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Cleaning In Progress</span>
            <Sparkles className="size-4 text-sky-500" />
          </div>
          <div className="text-2xl font-bold text-sky-600 dark:text-sky-400">{summary.inProgress}</div>
          <div className="text-[11px] text-muted-foreground">Currently being cleaned</div>
        </Card>

        <Card className="p-4 space-y-1 rounded-xl border border-border">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Cleaned Today</span>
            <CheckCircle2 className="size-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.completedTodayCount}</div>
          <div className="text-[11px] text-muted-foreground">Ready for incoming guests</div>
        </Card>
      </section>

      {/* Cleaners Roster Section */}
      <section className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Users className="size-4 text-teal-600" />
              Organization Cleaners Roster
            </h3>
            <p className="text-xs text-muted-foreground">
              Cleaners log into OpenProperty to view instructions, complete turnover checklists, and get email reminders.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {navigate && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/cleaner")}
                className="h-8 text-xs font-semibold gap-1.5 text-teal-700 dark:text-teal-300 border-teal-500/30"
              >
                <Sparkles className="size-3.5" /> Open Cleaner Portal &rarr;
              </Button>
            )}

            <Button
              size="sm"
              onClick={() => setAddCleanerOpen(true)}
              className="h-8 text-xs font-semibold gap-1.5 bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Plus className="size-3.5" /> Add Cleaner Profile
            </Button>
          </div>
        </div>

        {cleaners.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
            No cleaners added to this organization yet. Click &quot;Add Cleaner Profile&quot; to invite your first cleaner.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {cleaners.map((cleaner) => {
              const assignedUnits = airbnbUnits.filter((u) => u.cleaner_id === cleaner.id);
              const assignedTaskCount = tasks.filter((t) => t.cleaner_id === cleaner.id && t.status !== "completed").length;

              return (
                <div
                  key={cleaner.id}
                  className="p-3.5 rounded-xl border border-border bg-muted/20 space-y-2 hover:border-teal-500/30 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-sm text-foreground flex items-center gap-1.5">
                        <UserCheck className="size-4 text-teal-600" />
                        {cleaner.name}
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="size-3" />
                        {cleaner.email}
                      </div>
                    </div>
                    <Badge className="bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30 text-[10px] font-semibold">
                      Cleaner
                    </Badge>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-xs text-muted-foreground border-t border-border/50">
                    <span>Assigned Units: <strong className="text-foreground">{assignedUnits.length}</strong></span>
                    <span>Active Tasks: <strong className="text-teal-600 font-bold">{assignedTaskCount}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Turnover Schedule & Actions */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Calendar className="size-4 text-rose-500" />
              Turnover & Cleaning Schedule ({filteredTasks.length} tasks)
            </h3>
            <p className="text-xs text-muted-foreground">
              Automated turnover tracking when guests leave. Cleaners receive notifications with key lockbox codes and turnover checklists.
            </p>
          </div>

          <Button
            size="sm"
            onClick={() => openNewScheduleModal()}
            className="h-8 text-xs font-semibold gap-1.5 bg-rose-600 hover:bg-rose-700 text-white"
          >
            <Plus className="size-3.5" /> Schedule Turnover Cleaning
          </Button>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Select value={unitFilter} onValueChange={setUnitFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="All Units" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Units</SelectItem>
              {airbnbUnits.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={cleanerFilter} onValueChange={setCleanerFilter}>
            <SelectTrigger className="w-[180px] h-8 text-xs">
              <SelectValue placeholder="All Cleaners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cleaners</SelectItem>
              <SelectItem value="unassigned">Unassigned Only</SelectItem>
              {cleaners.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-8 text-xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed / Ready</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* Tasks Table / Cards */}
        {filteredTasks.length === 0 ? (
          <Card className="p-8 text-center text-xs text-muted-foreground rounded-2xl border-dashed">
            No turnover cleanings match this filter. Click &quot;Schedule Turnover Cleaning&quot; to assign one.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredTasks.map((task) => {
              const isCompleted = task.status === "completed";
              const isInProgress = task.status === "in_progress";

              return (
                <Card
                  key={task.id}
                  className={`p-4 rounded-xl border transition-colors ${
                    isInProgress
                      ? "border-amber-500/40 bg-amber-500/[0.02]"
                      : isCompleted
                      ? "border-emerald-500/30 opacity-90"
                      : "border-border"
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Unit & Turnover Window */}
                    <div className="space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                          <Home className="size-4 text-teal-600" />
                          {task.unit_name}
                        </span>

                        {task.status === "in_progress" && (
                          <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-xs font-semibold animate-pulse">
                            🧹 In Progress
                          </Badge>
                        )}
                        {task.status === "completed" && (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs font-semibold">
                            ✅ Cleaned & Ready
                          </Badge>
                        )}
                        {task.status === "scheduled" && (
                          <Badge className="bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30 text-xs font-semibold">
                            📅 Scheduled
                          </Badge>
                        )}

                        {task.airbnb_lockbox_code && (
                          <Badge variant="outline" className="text-[11px] font-mono border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200">
                            🔑 Code: {task.airbnb_lockbox_code}
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>Property: <strong className="text-foreground">{task.property_name}</strong></span>
                        <span>•</span>
                        <span>
                          Turnover: <strong>{formatDate(task.scheduled_date)} at {task.scheduled_time || "11:00"}</strong>
                        </span>
                        {task.next_check_in_date && (
                          <>
                            <span>•</span>
                            <span className="text-amber-700 dark:text-amber-400 font-medium">
                              Next Check-in: {formatDate(task.next_check_in_date)} at {task.next_check_in_time || "15:00"}
                            </span>
                          </>
                        )}
                      </div>

                      {task.issue_reported && (
                        <div className="flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-400 font-semibold bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/20">
                          <ShieldAlert className="size-3.5 shrink-0" />
                          <span>Reported Issue: {task.issue_reported}</span>
                        </div>
                      )}
                    </div>

                    {/* Middle: Cleaner Assignment */}
                    <div className="flex items-center gap-3">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-medium text-muted-foreground block">
                          Assigned Cleaner:
                        </Label>
                        <Select
                          value={task.cleaner_id ? String(task.cleaner_id) : "none"}
                          onValueChange={(val) => handleReassignCleaner(task.id, val)}
                        >
                          <SelectTrigger className="w-[180px] h-8 text-xs font-semibold">
                            <SelectValue placeholder="Assign cleaner" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {cleaners.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 pt-3 sm:pt-0">
                        {task.cleaner_id && !isCompleted && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleSendReminder(task)}
                            disabled={sendingReminderId === task.id}
                            className="h-8 text-xs gap-1.5 border-teal-500/30 text-teal-800 dark:text-teal-300 hover:bg-teal-500/10 font-semibold"
                            title="Send email reminder with turnover instructions and lockbox code"
                          >
                            <Mail className="size-3.5 text-teal-600" />
                            {sendingReminderId === task.id ? "Sending..." : "Send Reminder"}
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteTask(task.id)}
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          title="Delete Task"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {task.reminder_sent_at && (
                    <div className="mt-2 text-[10px] text-muted-foreground italic flex items-center gap-1">
                      <CheckCircle2 className="size-3 text-teal-600" />
                      Email reminder was sent on {formatDate(task.reminder_sent_at.slice(0, 10))} at {task.reminder_sent_at.slice(11, 16)}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Schedule Cleaning Task Modal */}
      <Dialog open={scheduleModalOpen} onOpenChange={setScheduleModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <Sparkles className="size-4 text-rose-500" />
              Schedule Turnover Cleaning
            </DialogTitle>
            <DialogDescription className="text-xs">
              Assign a cleaner to prepare an Airbnb unit after guest checkout.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Airbnb Unit:</Label>
              <Select value={selectedUnitId} onValueChange={setSelectedUnitId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {airbnbUnits.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name} ({u.property_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Assigned Cleaner:</Label>
              <Select value={selectedCleanerId} onValueChange={setSelectedCleanerId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select cleaner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No cleaner assigned</SelectItem>
                  {cleaners.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name} ({c.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Turnover Date (Checkout):</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Cleaning Start Time:</Label>
                <Input
                  type="time"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Next Check-in Date:</Label>
                <Input
                  type="date"
                  value={nextCheckInDate}
                  onChange={(e) => setNextCheckInDate(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Next Check-in Time:</Label>
                <Input
                  type="time"
                  value={nextCheckInTime}
                  onChange={(e) => setNextCheckInTime(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Special Instructions for Cleaner:</Label>
              <Textarea
                rows={2}
                placeholder="e.g. Please replace kitchen sponge, leave welcome wine bottle on counter..."
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setScheduleModalOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveCleaningTask}
              disabled={savingTask || !selectedUnitId || !scheduledDate}
              className="bg-teal-600 hover:bg-teal-700 text-white font-semibold gap-1.5"
            >
              <Sparkles className="size-3.5" /> Schedule & Notify
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Cleaner Profile Modal */}
      <Dialog open={addCleanerOpen} onOpenChange={setAddCleanerOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <UserCheck className="size-5 text-teal-600" />
              Add Cleaner Profile
            </DialogTitle>
            <DialogDescription className="text-xs">
              Add a cleaner to your organization so they can be assigned to Airbnb units and receive cleaning schedules.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Full Name:</Label>
              <Input
                placeholder="e.g. Maria Garcia"
                value={cleanerName}
                onChange={(e) => setCleanerName(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Email Address:</Label>
              <Input
                type="email"
                placeholder="e.g. maria.cleaner@example.com"
                value={cleanerEmail}
                onChange={(e) => setCleanerEmail(e.target.value)}
                className="h-8 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                Task assignments and reminder emails with lockbox codes will be sent here.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddCleanerOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleInviteCleaner}
              disabled={invitingCleaner || !cleanerName.trim() || !cleanerEmail.trim()}
              className="bg-teal-600 hover:bg-teal-700 text-white font-semibold gap-1.5"
            >
              <UserCheck className="size-3.5" /> Save Cleaner Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
