import { useState } from "react";
import {
  Building2,
  Users,
  UserPlus,
  Shield,
  Crown,
  Briefcase,
  Eye,
  Pencil,
  Trash2,
  MoreHorizontal,
  UserCheck,
  CheckCircle2,
  Sparkles,
  Info,
  Search,
  Plus,
  Mail,
  Send,
  AlertCircle,
} from "lucide-react";
import { useApp } from "@/context";
import { useAuth } from "@/auth";
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
import { getRoleBadge } from "../organization/organization-switcher";
import type { OrganizationMember, OrganizationRole } from "@/types";

export function OrganizationTab() {
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

  // Create org state
  const [createOrgDialogOpen, setCreateOrgDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgDesc, setNewOrgDesc] = useState("");
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);

  // Invite member state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("manager");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Email delivery feedback & resend
  const [inviteFeedback, setInviteFeedback] = useState<{
    type: "success" | "warning" | "error";
    message: string;
  } | null>(null);
  const [resendingMemberId, setResendingMemberId] = useState<number | null>(null);

  // Edit org state
  const [orgName, setOrgName] = useState(activeOrg?.name || "");
  const [orgDesc, setOrgDesc] = useState(activeOrg?.description || "");
  const [isEditingOrg, setIsEditingOrg] = useState(false);
  const [editOrgError, setEditOrgError] = useState<string | null>(null);

  // Edit member role state
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
            message: `Member ${inviteName.trim()} added! Email was logged in simulation mode (enable Email Sender tab to send live emails).`,
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
          message: `Member added to team, but email delivery failed: ${emailRes?.error || "Unknown error"}.`,
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
            message: `Invitation email simulated for ${member.email} (Email Sender is disabled).`,
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
      <div className="space-y-6">
        <Card className="p-8 text-center border-border/80 bg-card/60 backdrop-blur-xs">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 mb-4">
            <Building2 className="h-7 w-7" />
          </div>
          <h3 className="text-lg font-bold tracking-tight text-foreground">
            No Organization Membership
          </h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
            You are signed in as{" "}
            <strong className="text-foreground">{currentUserDisplay}</strong>
            , but your account is not associated with any organization in OpenProperty.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button
              onClick={() => setCreateOrgDialogOpen(true)}
              className="bg-primary text-primary-foreground shadow-xs"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Organization
            </Button>
          </div>
        </Card>

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
                <Label htmlFor="tab-empty-create-org-name">Organization Name</Label>
                <Input
                  id="tab-empty-create-org-name"
                  placeholder="e.g. Acme Capital Properties"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tab-empty-create-org-desc">Description (Optional)</Label>
                <Textarea
                  id="tab-empty-create-org-desc"
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
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Organization Header & Details */}
      <Card>
        <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-xs">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">
                  {activeOrg.name}
                </h2>
                {getRoleBadge(activeOrg.user_role)}
              </div>
              <p className="text-xs text-muted-foreground">
                {activeOrg.description || "Portfolio organization."}
              </p>
            </div>
          </div>

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
              <span>Edit Details</span>
            </Button>
            <Button size="sm" onClick={() => setInviteDialogOpen(true)}>
              <UserPlus className="mr-1.5 h-4 w-4" />
              <span>Invite Member</span>
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 divide-x border-b sm:grid-cols-4">
          <div className="p-4 text-center">
            <span className="block text-2xl font-bold text-foreground">{app.properties.length}</span>
            <span className="text-xs text-muted-foreground">Properties</span>
          </div>
          <div className="p-4 text-center">
            <span className="block text-2xl font-bold text-foreground">
              {app.properties.reduce((acc, p) => acc + (p.unit_count || 0), 0)}
            </span>
            <span className="text-xs text-muted-foreground">Total Units</span>
          </div>
          <div className="p-4 text-center">
            <span className="block text-2xl font-bold text-foreground">{members.length}</span>
            <span className="text-xs text-muted-foreground">Team Members</span>
          </div>
          <div className="p-4 text-center">
            <span className="block text-2xl font-bold text-foreground">
              {app.organizations.length}
            </span>
            <span className="text-xs text-muted-foreground">Organizations</span>
          </div>
        </div>

        {/* Session Info / Multi-User Identity Testing Sandbox */}
        {auth.isAuthenticated ? (
          <div className="bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <Shield className="mt-0.5 h-4 w-4 text-emerald-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Authenticated Keycloak Session
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Signed in as <strong>{auth.user?.email || auth.user?.username}</strong>. Role: <strong>{activeOrg.user_role || "member"}</strong>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-muted/20 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-2.5">
                <Sparkles className="mt-0.5 h-4 w-4 text-sky-500 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Multi-User Access Simulation (All users share access to {activeOrg.name}'s properties)
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Switch the active identity to test how different team members view this organization's portfolio:
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {members.map((m) => {
                  const isActive = (app.simulatedUser || "admin@openproperty.local").toLowerCase() === m.email.toLowerCase();
                  return (
                    <Button
                      key={m.id}
                      size="sm"
                      variant={isActive ? "default" : "outline"}
                      className="h-7 text-xs gap-1 px-2.5"
                      onClick={() => app.switchSimulatedUser(m.email)}
                    >
                      <span>{m.name.split(" ")[0]}</span>
                      <span className="opacity-60 text-[10px]">({m.role})</span>
                      {isActive && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Feedback Banner */}
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

      {/* Team Members Table */}
      <Card>
        <div className="flex flex-col gap-4 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Organization Members & Users</h3>
            <p className="text-xs text-muted-foreground">
              Team members who can access and collaborate on this organization's properties.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filter members…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue placeholder="All Roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="owner">Owners</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="manager">Managers</SelectItem>
                <SelectItem value="viewer">Viewers</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {filteredMembers.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No members found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-muted/40 font-medium text-muted-foreground">
                <tr>
                  <th className="py-2.5 pl-4 pr-3">User</th>
                  <th className="px-3 py-2.5">Role</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Joined</th>
                  <th className="py-2.5 pl-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
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
                    <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 pl-4 pr-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary text-[11px]">
                            {initials}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-foreground">{m.name}</span>
                              {isCurrentUser && (
                                <Badge variant="secondary" className="text-[10px] px-1 py-0 font-normal">
                                  You
                                </Badge>
                              )}
                            </div>
                            <span className="text-[11px] text-muted-foreground">{m.email}</span>
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
                              title="Resend invitation email"
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
                          <DropdownMenuContent align="end" className="w-44 text-xs">
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

      {/* Role explanation */}
      <Card className="p-4 bg-muted/20">
        <div className="flex items-center gap-2 mb-2">
          <Info className="h-4 w-4 text-primary" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Role Access Permissions
          </h4>
        </div>
        <div className="grid gap-2 text-xs sm:grid-cols-4">
          <div>
            <span className="font-semibold text-foreground">Owner</span>: Full control over org, members, billing & properties.
          </div>
          <div>
            <span className="font-semibold text-foreground">Admin</span>: Manage properties, units, leases, and invite members.
          </div>
          <div>
            <span className="font-semibold text-foreground">Manager</span>: Manage units, Airbnb bookings, work orders & tenants.
          </div>
          <div>
            <span className="font-semibold text-foreground">Viewer</span>: Read-only access to dashboard and occupancy data.
          </div>
        </div>
      </Card>

      {/* Invite Member Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Member to {activeOrg?.name}</DialogTitle>
            <DialogDescription>
              Grant access to this organization and all its properties.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleInvite} className="space-y-4 py-2">
            {inviteError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                {inviteError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="tab-invite-name">Full Name *</Label>
              <Input
                id="tab-invite-name"
                placeholder="e.g. Jordan Smith"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tab-invite-email">Email Address *</Label>
              <Input
                id="tab-invite-email"
                type="email"
                placeholder="e.g. jordan@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tab-invite-role">Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as OrganizationRole)}>
                <SelectTrigger id="tab-invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner (Full Control)</SelectItem>
                  <SelectItem value="admin">Admin (Manage properties & leases)</SelectItem>
                  <SelectItem value="manager">Manager (Manage units & bookings)</SelectItem>
                  <SelectItem value="viewer">Viewer (Read-only)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 font-medium text-primary">
                <Mail className="h-3.5 w-3.5" />
                <span>Automated Email Invitation</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                An invitation email will be dispatched automatically to this address. Configure SMTP or API settings in the <strong>Email Sender</strong> tab.
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
              Update organization name and description.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateOrg} className="space-y-4 py-2">
            {editOrgError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                {editOrgError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="tab-edit-org-name">Organization Name *</Label>
              <Input
                id="tab-edit-org-name"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tab-edit-org-desc">Description</Label>
              <Textarea
                id="tab-edit-org-desc"
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
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update permissions for {selectedMember?.name}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUpdateMemberRole} className="space-y-4 py-2">
            {updateMemberError && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                {updateMemberError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="tab-member-role">Role</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as OrganizationRole)}>
                <SelectTrigger id="tab-member-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
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
              <Label htmlFor="tab-create-org-name">Organization Name</Label>
              <Input
                id="tab-create-org-name"
                placeholder="e.g. Acme Capital Properties"
                value={newOrgName}
                onChange={(e) => setNewOrgName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tab-create-org-desc">Description (Optional)</Label>
              <Textarea
                id="tab-create-org-desc"
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
    </div>
  );
}
