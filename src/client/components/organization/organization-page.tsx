import { useState } from "react";
import {
  Building2,
  Users,
  UserPlus,
  Shield,
  Crown,
  Briefcase,
  Eye,
  Mail,
  MoreHorizontal,
  Pencil,
  Trash2,
  UserCheck,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Info,
  Search,
  RefreshCw,
  Plus,
  Send,
  AlertCircle,
} from "lucide-react";
import { useApp } from "@/context";
import { useAuth } from "@/auth";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDelete } from "@/components/ui/alert-dialog";
import { getRoleBadge } from "./organization-switcher";
import type { OrganizationMember, OrganizationRole, MemberStatus } from "@/types";

export function OrganizationPage({ navigate }: { navigate: (path: string) => void }) {
  const app = useApp();
  const auth = useAuth();
  const activeOrg = app.activeOrganization;
  const members = app.organizationMembers || [];

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [editOrgDialogOpen, setEditOrgDialogOpen] = useState(false);
  const [editMemberDialogOpen, setEditMemberDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<OrganizationMember | null>(null);

  // Create org form state
  const [createOrgDialogOpen, setCreateOrgDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgDesc, setNewOrgDesc] = useState("");
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);

  // Invite member form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("manager");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Email invite feedback & resend state
  const [inviteFeedback, setInviteFeedback] = useState<{
    type: "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const [resendingMemberId, setResendingMemberId] = useState<number | null>(null);

  // Edit org form state
  const [orgName, setOrgName] = useState(activeOrg?.name || "");
  const [orgDesc, setOrgDesc] = useState(activeOrg?.description || "");
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [editOrgError, setEditOrgError] = useState<string | null>(null);

  // Edit member role form state
  const [newRole, setNewRole] = useState<OrganizationRole>("manager");
  const [isUpdatingMember, setIsUpdatingMember] = useState(false);
  const [updateMemberError, setUpdateMemberError] = useState<string | null>(null);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    try {
      setIsCreatingOrg(true);
      setCreateOrgError(null);
      await app.createOrganization({
        name: newOrgName.trim(),
        description: newOrgDesc.trim() || undefined,
      });
      setNewOrgName("");
      setNewOrgDesc("");
      setCreateOrgDialogOpen(false);
    } catch (err) {
      setCreateOrgError((err as Error).message || "Failed to create organization");
    } finally {
      setIsCreatingOrg(false);
    }
  };

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === "all" || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !inviteName.trim()) return;

    try {
      setIsInviting(true);
      setInviteError(null);
      const res = await app.inviteOrganizationMember({
        email: inviteEmail.trim(),
        name: inviteName.trim(),
        role: inviteRole,
        status: "invited",
      });

      const emailRes = res?.email_result;
      if (emailRes?.ok) {
        if (emailRes.simulated) {
          setInviteFeedback({
            type: "warning",
            message: `Member ${inviteName.trim()} invited! Outbound email was logged in simulation mode (enable Email Sender in Settings to deliver live emails).`,
          });
        } else {
          setInviteFeedback({
            type: "success",
            message: `Invitation email sent to ${inviteEmail.trim()}! An invitation link has been delivered.`,
          });
        }
      } else {
        setInviteFeedback({
          type: "warning",
          message: `Member added to organization, but email delivery failed: ${emailRes?.error || "Unknown error"}. You can re-send it from the member list.`,
        });
      }

      setInviteEmail("");
      setInviteName("");
      setInviteRole("manager");
      setInviteDialogOpen(false);
    } catch (err) {
      setInviteError((err as Error).message || "Failed to add member");
    } finally {
      setIsInviting(false);
    }
  };

  const handleResendInvite = async (member: OrganizationMember) => {
    try {
      setResendingMemberId(member.id);
      const res = await app.resendOrganizationInvite(member.id);
      const emailRes = res?.email_result;
      if (emailRes?.ok) {
        if (emailRes.simulated) {
          setInviteFeedback({
            type: "warning",
            message: `Invitation email simulated for ${member.email} (Email Sender is currently disabled).`,
          });
        } else {
          setInviteFeedback({
            type: "success",
            message: `Invitation email successfully resent to ${member.email}!`,
          });
        }
      } else {
        setInviteFeedback({
          type: "error",
          message: `Failed to resend email: ${emailRes?.error || "Unknown error"}`,
        });
      }
    } catch (err) {
      setInviteFeedback({
        type: "error",
        message: (err as Error).message || "Failed to resend invitation email",
      });
    } finally {
      setResendingMemberId(null);
    }
  };

  const handleUpdateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !orgName.trim()) return;

    try {
      setIsEditingOrg(true);
      setEditOrgError(null);
      await app.updateOrganization(activeOrg.id, {
        name: orgName.trim(),
        description: orgDesc.trim() || undefined,
      });
      setEditOrgDialogOpen(false);
    } catch (err) {
      setEditOrgError((err as Error).message || "Failed to update organization");
    } finally {
      setIsEditingOrg(false);
    }
  };

  const handleUpdateMemberRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMember) return;

    try {
      setIsUpdatingMember(true);
      setUpdateMemberError(null);
      await app.updateOrganizationMember(selectedMember.id, {
        role: newRole,
      });
      setEditMemberDialogOpen(false);
      setSelectedMember(null);
    } catch (err) {
      setUpdateMemberError((err as Error).message || "Failed to update role");
    } finally {
      setIsUpdatingMember(false);
    }
  };

  const handleRemoveMember = async (memberId: number) => {
    try {
      await app.removeOrganizationMember(memberId);
    } catch (err) {
      alert((err as Error).message || "Failed to remove member");
    }
  };

  if (!activeOrg || app.organizations.length === 0) {
    const currentUserDisplay = auth.user?.email || auth.user?.username || app.simulatedUser || "You";
    return (
      <PageShell
        title="Organization & Team"
        meta="No organization membership"
        width="max-w-4xl"
        actions={
          <Button
            size="sm"
            className="bg-primary text-primary-foreground shadow-xs"
            onClick={() => setCreateOrgDialogOpen(true)}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            <span>Create Organization</span>
          </Button>
        }
      >
        <div className="space-y-6">
          <Card className="p-8 text-center border-border/80 bg-card/60 backdrop-blur-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 mb-4">
              <Building2 className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              No Organization Membership
            </h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
              You are logged in as{" "}
              <strong className="text-foreground font-semibold">{currentUserDisplay}</strong>
              , but this account is not associated with any organization in OpenProperty.
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
              Your data, properties, units, and leases are strictly isolated to the organizations you are invited to.
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                onClick={() => setCreateOrgDialogOpen(true)}
                className="bg-primary text-primary-foreground shadow-xs"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create New Organization
              </Button>
              <Button
                variant="outline"
                onClick={() => app.refreshLookups()}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Access
              </Button>
            </div>
          </Card>

          <Card className="p-6 border-border/60 bg-muted/20">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Info className="h-4 w-4 text-sky-500" />
              How Organization Access Works
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground leading-relaxed list-disc list-inside">
              <li>OpenProperty uses multi-tenant organization isolation for all properties, units, leases, and accounting.</li>
              <li>An organization's properties can only be seen and managed by its authorized team members.</li>
              <li>To join an existing portfolio, ask an owner of that organization to invite your email address (<strong>{currentUserDisplay}</strong>).</li>
            </ul>
          </Card>
        </div>

        {/* Create Organization Dialog */}
        <Dialog open={createOrgDialogOpen} onOpenChange={setCreateOrgDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Organization</DialogTitle>
              <DialogDescription>
                Set up a new organization to manage your properties, units, and team members.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateOrg} className="space-y-4 py-2">
              {createOrgError && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                  {createOrgError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="empty-create-org-name">Organization Name</Label>
                <Input
                  id="empty-create-org-name"
                  placeholder="e.g. Acme Capital Properties"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="empty-create-org-desc">Description (Optional)</Label>
                <Textarea
                  id="empty-create-org-desc"
                  placeholder="e.g. Commercial and residential rental units"
                  value={newOrgDesc}
                  onChange={(e) => setNewOrgDesc(e.target.value)}
                  rows={3}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOrgDialogOpen(false)}
                  disabled={isCreatingOrg}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isCreatingOrg || !newOrgName.trim()}>
                  {isCreatingOrg ? "Creating…" : "Create Organization"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Organization & Team"
      meta={`${activeOrg.name} · ${members.length} members · ${app.properties.length} properties`}
      width="max-w-6xl"
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setOrgName(activeOrg?.name || "");
              setOrgDesc(activeOrg?.description || "");
              setEditOrgDialogOpen(true);
            }}
          >
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            <span>Edit Org</span>
          </Button>
          <Button
            size="sm"
            className="bg-primary text-primary-foreground shadow-xs"
            onClick={() => setInviteDialogOpen(true)}
          >
            <UserPlus className="mr-1.5 h-4 w-4" />
            <span>Invite Member</span>
          </Button>
        </div>
      }
    >
      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="p-4 bg-card/60 backdrop-blur-xs border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Current Organization</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-xl font-bold tracking-tight text-foreground truncate">
            {activeOrg?.name || "Primary Portfolio"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground font-mono">
            slug: {activeOrg?.slug || "primary-portfolio"}
          </p>
        </Card>

        <Card className="p-4 bg-card/60 backdrop-blur-xs border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Shared Properties</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {app.properties.length}
            </span>
            <span className="text-xs text-muted-foreground">
              ({app.properties.reduce((acc, p) => acc + (p.unit_count || 0), 0)} units)
            </span>
          </div>
          <button
            onClick={() => navigate("/properties")}
            className="mt-1 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
          >
            <span>View portfolio</span>
            <ArrowRight className="h-3 w-3" />
          </button>
        </Card>

        <Card className="p-4 bg-card/60 backdrop-blur-xs border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Team Size</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-500">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{members.length}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {members.filter((m) => m.role === "owner" || m.role === "admin").length} Admins ·{" "}
            {members.filter((m) => m.role === "manager").length} Managers
          </p>
        </Card>

        <Card className="p-4 bg-card/60 backdrop-blur-xs border-border/70">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Your Role</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Crown className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {getRoleBadge(activeOrg?.user_role)}
            <span className="text-xs font-medium text-foreground">
              {activeOrg?.user_role === "owner"
                ? "Full Organization Owner"
                : activeOrg?.user_role === "admin"
                ? "Administrator"
                : activeOrg?.user_role === "manager"
                ? "Property Manager"
                : "Portfolio Viewer"}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {activeOrg?.user_role === "owner"
              ? "Full control over portfolio & users"
              : "Access to properties & units"}
          </p>
        </Card>
      </div>

      {/* Session / Sandbox Identity Information */}
      {auth.isAuthenticated ? (
        <Card className="overflow-hidden border-border/70 bg-gradient-to-r from-emerald-500/5 via-sky-500/5 to-indigo-500/5 p-4 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Authenticated Keycloak Session</h3>
                  <Badge variant="outline" className="border-emerald-400 text-emerald-600 dark:text-emerald-400 text-[10px] px-1.5 py-0">
                    SSO Active
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Logged in as <strong>{auth.user?.email || auth.user?.username}</strong>. Role in this organization: <strong>{activeOrg.user_role || "member"}</strong>.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => setCreateOrgDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Organization</span>
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden border-border/70 bg-gradient-to-r from-sky-500/5 via-indigo-500/5 to-purple-500/5 p-4 shadow-xs">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-400">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">Multi-User Collaboration Sandbox</h3>
                  <Badge variant="outline" className="border-sky-400 text-sky-600 dark:text-sky-400 text-[10px] px-1.5 py-0">
                    Live Identity Switcher
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Multiple users belong to <strong>{activeOrg.name}</strong> and share access to the same properties (e.g. Mauerstraße 15).
                  Click any user below to simulate acting as them:
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {members.map((m) => {
                const isActive = (app.simulatedUser || "admin@openproperty.local").toLowerCase() === m.email.toLowerCase();
                return (
                  <Button
                    key={m.id}
                    size="sm"
                    variant={isActive ? "default" : "outline"}
                    className={`h-8 gap-1.5 text-xs ${
                      isActive ? "shadow-xs" : "bg-background/80 hover:bg-background"
                    }`}
                    onClick={() => app.switchSimulatedUser(m.email)}
                  >
                    <span className="font-medium">{m.name.split(" ")[0]}</span>
                    <span className="opacity-70 text-[10px]">({m.role})</span>
                    {isActive && <CheckCircle2 className="h-3.5 w-3.5 text-primary-foreground" />}
                  </Button>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {/* Invite & Delivery Feedback Banner */}
      {inviteFeedback && (
        <div
          className={`flex items-start justify-between gap-3 p-3.5 rounded-lg border text-xs transition-all ${
            inviteFeedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
              : inviteFeedback.type === "warning"
              ? "bg-amber-500/10 border-amber-500/20 text-amber-800 dark:text-amber-300"
              : "bg-destructive/10 border-destructive/20 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2">
            {inviteFeedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <p className="font-medium">{inviteFeedback.message}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => setInviteFeedback(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Team Members List */}
      <Card className="overflow-hidden border-border/70 shadow-xs">
        <div className="flex flex-col gap-4 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Organization Members</h2>
            <p className="text-xs text-muted-foreground">
              Users who have access to this organization's properties, units, leases, and bookings.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search members…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="owner">Owners</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="manager">Managers</SelectItem>
                <SelectItem value="cleaner">Cleaners</SelectItem>
                <SelectItem value="viewer">Viewers</SelectItem>
              </SelectContent>
            </Select>

            <Button size="sm" onClick={() => setInviteDialogOpen(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              <span>Add Member</span>
            </Button>
          </div>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
            <Users className="h-10 w-10 stroke-[1.5] text-muted-foreground/60" />
            <p className="mt-3 text-sm font-medium text-foreground">No members found</p>
            <p className="text-xs text-muted-foreground">
              Try adjusting your search query or role filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border/70 bg-muted/40 font-medium text-muted-foreground">
                <tr>
                  <th className="py-3 pl-4 pr-3">User</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Joined</th>
                  <th className="py-3 pl-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredMembers.map((m) => {
                  const initials = m.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  const isCurrentUser =
                    (app.simulatedUser || "admin@openproperty.local").toLowerCase() === m.email.toLowerCase();

                  return (
                    <tr key={m.id} className="transition-colors hover:bg-muted/30">
                      <td className="py-3 pl-4 pr-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-sky-500/20 to-indigo-500/20 font-semibold text-primary">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-foreground">{m.name}</span>
                              {isCurrentUser && (
                                <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">
                                  You
                                </Badge>
                              )}
                            </div>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {m.email}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3">{getRoleBadge(m.role)}</td>

                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                m.status === "active" ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                              }`}
                            />
                            <span className="capitalize text-muted-foreground">{m.status}</span>
                          </div>
                          {m.status === "invited" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-6 px-2 text-[11px] gap-1 text-primary border-primary/30 hover:bg-primary/10"
                              disabled={resendingMemberId === m.id}
                              onClick={() => handleResendInvite(m)}
                              title="Resend invitation email to this user"
                            >
                              <Send className={`h-3 w-3 ${resendingMemberId === m.id ? "animate-spin" : ""}`} />
                              <span>{resendingMemberId === m.id ? "Sending..." : "Resend"}</span>
                            </Button>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-3 text-muted-foreground">
                        {m.created_at ? new Date(m.created_at).toLocaleDateString() : "—"}
                      </td>

                      <td className="py-3 pl-3 pr-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 text-xs">
                            <DropdownMenuLabel>Member Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedMember(m);
                                setNewRole(m.role);
                                setEditMemberDialogOpen(true);
                              }}
                              className="cursor-pointer"
                            >
                              <Pencil className="mr-2 h-3.5 w-3.5" />
                              <span>Change Role</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => handleResendInvite(m)}
                              disabled={resendingMemberId === m.id}
                              className="cursor-pointer"
                            >
                              <Send className="mr-2 h-3.5 w-3.5 text-primary" />
                              <span>Resend Invitation Email</span>
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => app.switchSimulatedUser(m.email)}
                              className="cursor-pointer"
                            >
                              <UserCheck className="mr-2 h-3.5 w-3.5 text-sky-500" />
                              <span>Act as this user</span>
                            </DropdownMenuItem>

                            {m.role !== "owner" && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => handleRemoveMember(m.id)}
                                  className="cursor-pointer text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-3.5 w-3.5" />
                                  <span>Remove Member</span>
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Role Permission Legend */}
      <Card className="p-4 border-border/70 bg-muted/20">
        <div className="flex items-center gap-2 mb-3">
          <Info className="h-4 w-4 text-primary" />
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
            Organization Role Permissions
          </h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 text-xs">
          <div className="space-y-1 rounded-md border border-border/60 bg-card p-3">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Crown className="h-3.5 w-3.5 text-amber-500" />
              <span>Owner</span>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Full control. Can invite & remove members, edit organization details, and manage all properties & finances.
            </p>
          </div>

          <div className="space-y-1 rounded-md border border-border/60 bg-card p-3">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Shield className="h-3.5 w-3.5 text-purple-500" />
              <span>Admin</span>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Can manage properties, units, leases, rent charges, and invite new managers and viewers to the team.
            </p>
          </div>

          <div className="space-y-1 rounded-md border border-border/60 bg-card p-3">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Briefcase className="h-3.5 w-3.5 text-sky-500" />
              <span>Manager</span>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Handles day-to-day operations: managing units, Airbnb bookings, work orders, turnover cleanings, and tenants.
            </p>
          </div>

          <div className="space-y-1 rounded-md border border-border/60 bg-card p-3">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-teal-500" />
              <span>Cleaner</span>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Turnover specialist. Accesses turnover schedules, checklists, and lockbox access codes for assigned Airbnb units.
            </p>
          </div>

          <div className="space-y-1 rounded-md border border-border/60 bg-card p-3">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Eye className="h-3.5 w-3.5 text-slate-500" />
              <span>Viewer</span>
            </div>
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              Read-only access. Can inspect portfolio dashboard stats, financial reports, and occupancy rates without edit rights.
            </p>
          </div>
        </div>
      </Card>

      {/* Invite Member Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UserPlus className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Invite Member to {activeOrg?.name}</DialogTitle>
                <DialogDescription>
                  Add a colleague to access and collaborate on this organization's portfolio.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleInvite} className="space-y-4 py-2">
            {inviteError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                {inviteError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="invite-name">Full Name *</Label>
              <Input
                id="invite-name"
                placeholder="e.g. Taylor Reed"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email Address *</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="e.g. taylor@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="invite-role">Organization Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as OrganizationRole)}>
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner (Full control over team & properties)</SelectItem>
                  <SelectItem value="admin">Admin (Manage properties, leases, & team)</SelectItem>
                  <SelectItem value="manager">Manager (Manage units, bookings, & work orders)</SelectItem>
                  <SelectItem value="cleaner">Cleaner (Turnover cleanings & lockbox access)</SelectItem>
                  <SelectItem value="viewer">Viewer (Read-only access)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-primary">
                <Mail className="h-3.5 w-3.5" />
                <span>Automated Invitation Email</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                An invitation email will be dispatched to this address with instructions to join <strong>{activeOrg?.name}</strong>.
                You can configure your SMTP host or API key (Resend, SendGrid, Brevo, Postmark) in{" "}
                <button
                  type="button"
                  onClick={() => {
                    setInviteDialogOpen(false);
                    navigate("/settings");
                  }}
                  className="text-primary underline font-medium hover:text-primary/80"
                >
                  Admin Settings &rarr; Email Sender
                </button>.
              </p>
            </div>

            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Multi-User Shared Access</p>
              <p className="mt-0.5">
                Once added, this user will immediately have access to all {app.properties.length} properties
                and their associated units, leases, and Airbnb reservations in <strong>{activeOrg?.name}</strong>.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteDialogOpen(false)}
                disabled={isInviting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isInviting || !inviteEmail.trim() || !inviteName.trim()}>
                {isInviting ? "Sending Invite…" : "Send Invite"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Organization Dialog */}
      <Dialog open={editOrgDialogOpen} onOpenChange={setEditOrgDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>
              Update organization profile details and description.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateOrg} className="space-y-4 py-2">
            {editOrgError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                {editOrgError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="edit-org-name">Organization Name *</Label>
              <Input
                id="edit-org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-org-desc">Description</Label>
              <Textarea
                id="edit-org-desc"
                value={orgDesc}
                onChange={(e) => setOrgDesc(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOrgDialogOpen(false)}
                disabled={isEditingOrg}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isEditingOrg || !orgName.trim()}>
                {isEditingOrg ? "Saving…" : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Member Role Dialog */}
      <Dialog open={editMemberDialogOpen} onOpenChange={setEditMemberDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Member Role</DialogTitle>
            <DialogDescription>
              Update role and permissions for {selectedMember?.name}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateMemberRole} className="space-y-4 py-2">
            {updateMemberError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                {updateMemberError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="member-role">Select Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as OrganizationRole)}>
                <SelectTrigger id="member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="cleaner">Cleaner</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditMemberDialogOpen(false)}
                disabled={isUpdatingMember}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isUpdatingMember}>
                {isUpdatingMember ? "Updating…" : "Update Role"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Create Organization Dialog */}
      <Dialog open={createOrgDialogOpen} onOpenChange={setCreateOrgDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Organization</DialogTitle>
            <DialogDescription>
              Set up a new organization to manage your properties, units, and team members.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateOrg} className="space-y-4 py-2">
            {createOrgError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                {createOrgError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="create-org-name">Organization Name</Label>
              <Input
                id="create-org-name"
                placeholder="e.g. Acme Capital Properties"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="create-org-desc">Description (Optional)</Label>
              <Textarea
                id="create-org-desc"
                placeholder="e.g. Commercial and residential rental units"
                value={newOrgDesc}
                onChange={(e) => setNewOrgDesc(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOrgDialogOpen(false)}
                disabled={isCreatingOrg}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreatingOrg || !newOrgName.trim()}>
                {isCreatingOrg ? "Creating…" : "Create Organization"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
