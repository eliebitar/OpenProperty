import { useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  Plus,
  Shield,
  Users,
  ExternalLink,
  Crown,
  Briefcase,
  Eye,
  Sparkles,
} from "lucide-react";
import { useApp } from "@/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { OrganizationRole } from "@/types";

export function getRoleBadge(role?: OrganizationRole | string) {
  switch (role) {
    case "owner":
      return (
        <Badge
          variant="outline"
          className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium text-[11px] gap-1 px-1.5 py-0"
        >
          <Crown className="h-3 w-3 text-amber-500" />
          <span>Owner</span>
        </Badge>
      );
    case "admin":
      return (
        <Badge
          variant="outline"
          className="border-purple-500/40 bg-purple-500/10 text-purple-700 dark:text-purple-400 font-medium text-[11px] gap-1 px-1.5 py-0"
        >
          <Shield className="h-3 w-3 text-purple-500" />
          <span>Admin</span>
        </Badge>
      );
    case "manager":
      return (
        <Badge
          variant="outline"
          className="border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400 font-medium text-[11px] gap-1 px-1.5 py-0"
        >
          <Briefcase className="h-3 w-3 text-sky-500" />
          <span>Manager</span>
        </Badge>
      );
    case "cleaner":
      return (
        <Badge
          variant="outline"
          className="border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-400 font-medium text-[11px] gap-1 px-1.5 py-0"
        >
          <Sparkles className="h-3 w-3 text-teal-500" />
          <span>Cleaner</span>
        </Badge>
      );
    case "viewer":
    default:
      return (
        <Badge
          variant="outline"
          className="border-slate-500/40 bg-slate-500/10 text-slate-700 dark:text-slate-400 font-medium text-[11px] gap-1 px-1.5 py-0"
        >
          <Eye className="h-3 w-3 text-slate-500" />
          <span>Viewer</span>
        </Badge>
      );
  }
}

interface OrganizationSwitcherProps {
  onNavigateOrganization?: () => void;
  variant?: "header" | "compact" | "sidebar";
}

export function OrganizationSwitcher({
  onNavigateOrganization,
  variant = "header",
}: OrganizationSwitcherProps) {
  const app = useApp();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeOrg = app.activeOrganization;
  const orgs = app.organizations || [];

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      setIsSubmitting(true);
      setError(null);
      await app.createOrganization({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setName("");
      setDescription("");
      setCreateDialogOpen(false);
    } catch (err) {
      setError((err as Error).message || "Failed to create organization");
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentRole = activeOrg?.user_role || "owner";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-8 max-w-[240px] items-center gap-2 border-border/70 bg-background/80 px-2.5 shadow-2xs hover:bg-accent hover:text-accent-foreground"
          >
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-gradient-to-tr from-sky-500 to-indigo-600 text-white shadow-2xs">
              <Building2 className="h-3 w-3" />
            </div>
            <span className="truncate text-xs font-medium text-foreground">
              {activeOrg?.name || "Select Organization"}
            </span>
            {getRoleBadge(currentRole)}
            <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="flex items-center justify-between text-xs text-muted-foreground font-normal">
            <span>Organizations</span>
            <span className="text-[11px] font-mono">{orgs.length} available</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <div className="max-h-56 overflow-y-auto">
            {orgs.map((org) => {
              const isSelected = activeOrg?.id === org.id;
              return (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => app.switchOrganization(org.id)}
                  className="flex cursor-pointer items-center justify-between py-2 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm ${
                        isSelected
                          ? "bg-primary text-primary-foreground font-semibold"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Building2 className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{org.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {org.property_count ?? 0} {org.property_count === 1 ? "property" : "properties"} ·{" "}
                        {org.member_count ?? 1} {org.member_count === 1 ? "member" : "members"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 pl-2">
                    {getRoleBadge(org.user_role)}
                    {isSelected && <Check className="h-4 w-4 text-primary" />}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => setCreateDialogOpen(true)}
            className="flex cursor-pointer items-center gap-2 py-1.5 text-xs font-medium text-primary hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Create New Organization</span>
          </DropdownMenuItem>

          {onNavigateOrganization && (
            <DropdownMenuItem
              onClick={onNavigateOrganization}
              className="flex cursor-pointer items-center gap-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Users className="h-3.5 w-3.5" />
              <span>Manage Team & Access</span>
              <ExternalLink className="ml-auto h-3 w-3 opacity-60" />
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Organization Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>Create Organization</DialogTitle>
                <DialogDescription>
                  Set up a shared organization to collaborate with other team members across properties.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2">
            {error && (
              <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="org-name">Organization Name *</Label>
              <Input
                id="org-name"
                placeholder="e.g. Apex Real Estate Holdings"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="org-desc">Description (Optional)</Label>
              <Textarea
                id="org-desc"
                placeholder="Describe this organization portfolio or investment group"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Multi-User Access</p>
              <p className="mt-0.5">
                You will automatically be assigned as the <strong>Owner</strong>. You can then invite other users
                as Admins, Managers, or Viewers. All members access the same properties.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !name.trim()}>
                {isSubmitting ? "Creating…" : "Create Organization"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
