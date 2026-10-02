import { useCallback, useEffect, useState } from "react";
import { api, getActiveOrganizationId, setActiveOrganizationId, getSimulatedUser, setSimulatedUser } from "../api";
import type {
  Property,
  Unit,
  Tenant,
  Lease,
  RentCharge,
  Vendor,
  WorkOrder,
  NewProperty,
  NewUnit,
  NewTenant,
  NewLease,
  NewWorkOrder,
  NewVendor,
  AirbnbBooking,
  NewAirbnbBooking,
  AirbnbAnalytics,
  DemoDataStatus,
  DeleteDemoDataResult,
  Organization,
  OrganizationMember,
  NewOrganization,
  InviteMemberInput,
  CleaningTask,
  CreateCleaningTaskInput,
  UpdateCleaningTaskInput,
} from "../types";

export interface AppSettings {
  default_rent_due_day: number;
  late_fee_amount: number;
  late_fee_grace_days: number;
  currency: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  default_rent_due_day: 1,
  late_fee_amount: 50,
  late_fee_grace_days: 5,
  currency: "EUR",
};

function parseSettings(raw: Record<string, string>): AppSettings {
  const num = (key: keyof AppSettings, fallback: number) => {
    const v = parseFloat(raw[key]);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    default_rent_due_day: num("default_rent_due_day", DEFAULT_SETTINGS.default_rent_due_day),
    late_fee_amount: num("late_fee_amount", DEFAULT_SETTINGS.late_fee_amount),
    late_fee_grace_days: num("late_fee_grace_days", DEFAULT_SETTINGS.late_fee_grace_days),
    currency: raw.currency || DEFAULT_SETTINGS.currency,
  };
}

export function useAppState() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganization, setActiveOrganization] = useState<Organization | null>(null);
  const [organizationMembers, setOrganizationMembers] = useState<OrganizationMember[]>([]);
  const [simulatedUser, setSimulatedUserState] = useState<string | null>(getSimulatedUser());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lookup loaders ─────────────────────────────────────────────────

  const refreshOrganizations = useCallback(async (): Promise<Organization[]> => {
    try {
      const res = await api<{ organizations: Organization[]; active_organization_id: number | null }>(
        "GET",
        "/api/organizations"
      );
      const orgs = res.organizations || [];
      setOrganizations(orgs);
      const currentActiveId = getActiveOrganizationId() || res.active_organization_id;
      const current = orgs.find((o) => o.id === currentActiveId) || orgs[0] || null;
      if (current) {
        setActiveOrganization(current);
        setActiveOrganizationId(current.id);
        const memRes = await api<{ members: OrganizationMember[] }>(
          "GET",
          `/api/organizations/${current.id}/members`
        ).catch(() => ({ members: [] }));
        setOrganizationMembers(memRes.members || []);
      } else {
        setActiveOrganization(null);
        setActiveOrganizationId(null);
        setOrganizationMembers([]);
      }
      return orgs;
    } catch (err) {
      console.warn("Failed to load organizations:", err);
      setOrganizations([]);
      setActiveOrganization(null);
      setActiveOrganizationId(null);
      setOrganizationMembers([]);
      return [];
    }
  }, []);

  const refreshLookups = useCallback(async () => {
    await refreshOrganizations();
    const [props, vens, st] = await Promise.all([
      api<{ properties: Property[] }>("GET", "/api/properties").catch(() => ({ properties: [] })),
      api<{ vendors: Vendor[] }>("GET", "/api/vendors").catch(() => ({ vendors: [] })),
      api<{ settings: Record<string, string> }>("GET", "/api/settings").catch(() => ({ settings: {} })),
    ]);
    setProperties(props.properties || []);
    setVendors(vens.vendors || []);
    setSettings(parseSettings(st.settings || {}));
  }, [refreshOrganizations]);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) body[k] = String(v);
    }
    const res = await api<{ settings: Record<string, string> }>("PUT", "/api/settings", body);
    setSettings(parseSettings(res.settings));
  }, []);

  // Initial load.
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await refreshLookups();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshLookups]);

  // Property mutations ─────────────────────────────────────────────

  const createProperty = useCallback(async (data: NewProperty) => {
    const res = await api<{ property: Property }>("POST", "/api/properties", data);
    await refreshLookups();
    return res.property;
  }, [refreshLookups]);

  const updateProperty = useCallback(async (id: number, patch: Partial<NewProperty>) => {
    const res = await api<{ property: Property }>("PUT", `/api/properties/${id}`, patch);
    await refreshLookups();
    return res.property;
  }, [refreshLookups]);

  const deleteProperty = useCallback(async (id: number) => {
    await api("DELETE", `/api/properties/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  // Unit mutations ─────────────────────────────────────────────────

  const listUnits = useCallback(async (propertyId?: number): Promise<Unit[]> => {
    const path = propertyId ? `/api/units?property_id=${propertyId}` : "/api/units";
    const data = await api<{ units: Unit[] }>("GET", path);
    return data.units;
  }, []);

  const getUnit = useCallback(async (id: number): Promise<Unit> => {
    const data = await api<{ unit: Unit }>("GET", `/api/units/${id}`);
    return data.unit;
  }, []);

  const createUnit = useCallback(async (data: NewUnit) => {
    const res = await api<{ unit: Unit }>("POST", "/api/units", data);
    await refreshLookups();
    return res.unit;
  }, [refreshLookups]);

  const updateUnit = useCallback(async (id: number, patch: Partial<NewUnit>) => {
    const res = await api<{ unit: Unit }>("PUT", `/api/units/${id}`, patch);
    await refreshLookups();
    return res.unit;
  }, [refreshLookups]);

  const deleteUnit = useCallback(async (id: number) => {
    await api("DELETE", `/api/units/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  // Tenant mutations ───────────────────────────────────────────────

  const listTenants = useCallback(async (q?: string): Promise<Tenant[]> => {
    const path = q ? `/api/tenants?q=${encodeURIComponent(q)}` : "/api/tenants";
    const data = await api<{ tenants: Tenant[] }>("GET", path);
    return data.tenants;
  }, []);

  const createTenant = useCallback(async (data: NewTenant) => {
    const res = await api<{ tenant: Tenant }>("POST", "/api/tenants", data);
    return res.tenant;
  }, []);

  const updateTenant = useCallback(async (id: number, patch: Partial<NewTenant>) => {
    const res = await api<{ tenant: Tenant }>("PUT", `/api/tenants/${id}`, patch);
    return res.tenant;
  }, []);

  const deleteTenant = useCallback(async (id: number) => {
    await api("DELETE", `/api/tenants/${id}`);
  }, []);

  // Lease mutations ────────────────────────────────────────────────

  const listLeases = useCallback(async (params?: { tenant_id?: number; unit_id?: number; status?: string }): Promise<Lease[]> => {
    const qs = new URLSearchParams();
    if (params?.tenant_id) qs.set("tenant_id", String(params.tenant_id));
    if (params?.unit_id) qs.set("unit_id", String(params.unit_id));
    if (params?.status) qs.set("status", params.status);
    const path = qs.toString() ? `/api/leases?${qs.toString()}` : "/api/leases";
    const data = await api<{ leases: Lease[] }>("GET", path);
    return data.leases;
  }, []);

  const createLease = useCallback(async (data: NewLease) => {
    const res = await api<{ lease: Lease }>("POST", "/api/leases", data);
    await refreshLookups();
    return res.lease;
  }, [refreshLookups]);

  const updateLease = useCallback(async (id: number, patch: Partial<NewLease>) => {
    const res = await api<{ lease: Lease }>("PUT", `/api/leases/${id}`, patch);
    await refreshLookups();
    return res.lease;
  }, [refreshLookups]);

  const deleteLease = useCallback(async (id: number) => {
    await api("DELETE", `/api/leases/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  // Rent / payments ────────────────────────────────────────────────

  const listCharges = useCallback(async (period?: string): Promise<RentCharge[]> => {
    const path = period ? `/api/rent-charges?period=${encodeURIComponent(period)}` : "/api/rent-charges";
    const data = await api<{ charges: RentCharge[] }>("GET", path);
    return data.charges;
  }, []);

  const generateCharges = useCallback(async (period: string) => {
    const data = await api<{ created: number; period: string }>("POST", "/api/rent-charges/generate", { period });
    return data;
  }, []);

  const recordPayment = useCallback(async (input: {
    charge_id: number;
    amount: number;
    method?: string;
    reference?: string | null;
    notes?: string | null;
    paid_at?: string;
  }) => {
    const res = await api<{ charge: RentCharge }>("POST", "/api/payments", input);
    return res.charge;
  }, []);

  // Vendor mutations ───────────────────────────────────────────────

  const createVendor = useCallback(async (data: NewVendor) => {
    const res = await api<{ vendor: Vendor }>("POST", "/api/vendors", data);
    await refreshLookups();
    return res.vendor;
  }, [refreshLookups]);

  const updateVendor = useCallback(async (id: number, patch: Partial<NewVendor>) => {
    const res = await api<{ vendor: Vendor }>("PUT", `/api/vendors/${id}`, patch);
    await refreshLookups();
    return res.vendor;
  }, [refreshLookups]);

  const deleteVendor = useCallback(async (id: number) => {
    await api("DELETE", `/api/vendors/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  // Work order mutations ───────────────────────────────────────────

  const listWorkOrders = useCallback(async (params?: { status?: string; property_id?: number; unit_id?: number }): Promise<WorkOrder[]> => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.property_id) qs.set("property_id", String(params.property_id));
    if (params?.unit_id) qs.set("unit_id", String(params.unit_id));
    const path = qs.toString() ? `/api/work-orders?${qs.toString()}` : "/api/work-orders";
    const data = await api<{ work_orders: WorkOrder[] }>("GET", path);
    return data.work_orders;
  }, []);

  const createWorkOrder = useCallback(async (data: NewWorkOrder) => {
    const res = await api<{ work_order: WorkOrder }>("POST", "/api/work-orders", data);
    return res.work_order;
  }, []);

  const updateWorkOrder = useCallback(async (id: number, patch: Partial<NewWorkOrder>) => {
    const res = await api<{ work_order: WorkOrder }>("PUT", `/api/work-orders/${id}`, patch);
    return res.work_order;
  }, []);

  const deleteWorkOrder = useCallback(async (id: number) => {
    await api("DELETE", `/api/work-orders/${id}`);
  }, []);

  // Airbnb mutations ───────────────────────────────────────────────

  const listAirbnbBookings = useCallback(async (params?: {
    unit_id?: number;
    property_id?: number;
    status?: string;
    payout_status?: string;
    q?: string;
  }): Promise<AirbnbBooking[]> => {
    const qs = new URLSearchParams();
    if (params?.unit_id) qs.set("unit_id", String(params.unit_id));
    if (params?.property_id) qs.set("property_id", String(params.property_id));
    if (params?.status) qs.set("status", params.status);
    if (params?.payout_status) qs.set("payout_status", params.payout_status);
    if (params?.q) qs.set("q", params.q);
    const path = qs.toString() ? `/api/airbnb/bookings?${qs.toString()}` : "/api/airbnb/bookings";
    const data = await api<{ bookings: AirbnbBooking[] }>("GET", path);
    return data.bookings;
  }, []);

  const createAirbnbBooking = useCallback(async (data: NewAirbnbBooking): Promise<AirbnbBooking> => {
    const res = await api<{ booking: AirbnbBooking }>("POST", "/api/airbnb/bookings", data);
    await refreshLookups();
    return res.booking;
  }, [refreshLookups]);

  const updateAirbnbBooking = useCallback(async (id: number, patch: Partial<NewAirbnbBooking>): Promise<AirbnbBooking> => {
    const res = await api<{ booking: AirbnbBooking }>("PUT", `/api/airbnb/bookings/${id}`, patch);
    await refreshLookups();
    return res.booking;
  }, [refreshLookups]);

  const deleteAirbnbBooking = useCallback(async (id: number) => {
    await api("DELETE", `/api/airbnb/bookings/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  const scheduleTurnoverCleaning = useCallback(async (bookingId: number): Promise<WorkOrder> => {
    const res = await api<{ ok: boolean; work_order: WorkOrder }>("POST", `/api/airbnb/bookings/${bookingId}/schedule-cleaning`);
    return res.work_order;
  }, []);

  // Cleaners & Turnover Cleaning Tasks ───────────────────────────

  const listCleaners = useCallback(async (): Promise<OrganizationMember[]> => {
    const res = await api<{ cleaners: OrganizationMember[] }>("GET", "/api/cleaners");
    return res.cleaners;
  }, []);

  const listCleaningTasks = useCallback(async (params?: {
    unit_id?: number;
    cleaner_id?: number;
    status?: string;
    from_date?: string;
    to_date?: string;
  }): Promise<CleaningTask[]> => {
    const qs = new URLSearchParams();
    if (params?.unit_id) qs.set("unit_id", String(params.unit_id));
    if (params?.cleaner_id) qs.set("cleaner_id", String(params.cleaner_id));
    if (params?.status) qs.set("status", params.status);
    if (params?.from_date) qs.set("from_date", params.from_date);
    if (params?.to_date) qs.set("to_date", params.to_date);
    const path = qs.toString() ? `/api/cleaning-tasks?${qs.toString()}` : "/api/cleaning-tasks";
    const res = await api<{ tasks: CleaningTask[] }>("GET", path);
    return res.tasks;
  }, []);

  const getCleaningTask = useCallback(async (id: number): Promise<CleaningTask> => {
    const res = await api<{ task: CleaningTask }>("GET", `/api/cleaning-tasks/${id}`);
    return res.task;
  }, []);

  const createCleaningTask = useCallback(async (data: CreateCleaningTaskInput): Promise<CleaningTask> => {
    const payload = {
      ...data,
      checklist: data.checklist ? JSON.stringify(data.checklist) : undefined,
    };
    const res = await api<{ task: CleaningTask }>("POST", "/api/cleaning-tasks", payload);
    await refreshLookups();
    return res.task;
  }, [refreshLookups]);

  const updateCleaningTask = useCallback(async (id: number, patch: UpdateCleaningTaskInput): Promise<CleaningTask> => {
    const payload = {
      ...patch,
      checklist: Array.isArray(patch.checklist) ? JSON.stringify(patch.checklist) : patch.checklist,
    };
    const res = await api<{ task: CleaningTask }>("PUT", `/api/cleaning-tasks/${id}`, payload);
    await refreshLookups();
    return res.task;
  }, [refreshLookups]);

  const deleteCleaningTask = useCallback(async (id: number): Promise<void> => {
    await api("DELETE", `/api/cleaning-tasks/${id}`);
    await refreshLookups();
  }, [refreshLookups]);

  const sendCleaningReminder = useCallback(async (id: number): Promise<{ ok: boolean; email_result?: any }> => {
    return await api<{ ok: boolean; email_result?: any }>("POST", `/api/cleaning-tasks/${id}/send-reminder`);
  }, []);

  const getAirbnbAnalytics = useCallback(async (propertyId?: number): Promise<AirbnbAnalytics> => {
    const path = propertyId ? `/api/airbnb/analytics?property_id=${propertyId}` : "/api/airbnb/analytics";
    return await api<AirbnbAnalytics>("GET", path);
  }, []);

  const getDemoDataStatus = useCallback(async (): Promise<DemoDataStatus> => {
    return await api<DemoDataStatus>("GET", "/api/demo-data/status");
  }, []);

  const deleteDemoData = useCallback(async (): Promise<DeleteDemoDataResult> => {
    const res = await api<DeleteDemoDataResult>("POST", "/api/demo-data/delete");
    await refreshLookups();
    return res;
  }, [refreshLookups]);

  const restoreDemoData = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    const res = await api<{ ok: boolean; message: string }>("POST", "/api/demo-data/restore");
    await refreshLookups();
    return res;
  }, [refreshLookups]);

  // Organization mutations ──────────────────────────────────────────

  const switchOrganization = useCallback(async (orgId: number) => {
    setActiveOrganizationId(orgId);
    const target = organizations.find((o) => o.id === orgId);
    if (target) {
      setActiveOrganization(target);
    }
    try {
      const memRes = await api<{ members: OrganizationMember[] }>(
        "GET",
        `/api/organizations/${orgId}/members`
      );
      setOrganizationMembers(memRes.members);
    } catch {
      /* ignore */
    }
    await refreshLookups();
  }, [organizations, refreshLookups]);

  const createOrganization = useCallback(async (data: NewOrganization): Promise<Organization> => {
    const res = await api<{ organization: Organization }>("POST", "/api/organizations", data);
    setActiveOrganizationId(res.organization.id);
    await refreshLookups();
    return res.organization;
  }, [refreshLookups]);

  const updateOrganization = useCallback(async (id: number, patch: Partial<NewOrganization>): Promise<Organization> => {
    const res = await api<{ organization: Organization }>("PUT", `/api/organizations/${id}`, patch);
    await refreshLookups();
    return res.organization;
  }, [refreshLookups]);

  const deleteOrganization = useCallback(async (id: number): Promise<void> => {
    await api("DELETE", `/api/organizations/${id}`);
    const remaining = organizations.filter((o) => o.id !== id);
    if (remaining.length > 0) {
      setActiveOrganizationId(remaining[0].id);
    }
    await refreshLookups();
  }, [organizations, refreshLookups]);

  const listOrganizationMembers = useCallback(async (orgId?: number): Promise<OrganizationMember[]> => {
    const targetId = orgId || activeOrganization?.id;
    if (!targetId) return [];
    try {
      const res = await api<{ members: OrganizationMember[] }>("GET", `/api/organizations/${targetId}/members`);
      if (targetId === activeOrganization?.id) {
        setOrganizationMembers(res.members || []);
      }
      return res.members || [];
    } catch {
      return [];
    }
  }, [activeOrganization?.id]);

  const inviteOrganizationMember = useCallback(async (data: InviteMemberInput, orgId?: number): Promise<{ member: OrganizationMember; email_result?: { ok: boolean; simulated?: boolean; error?: string; messageId?: string } }> => {
    const targetId = orgId || activeOrganization?.id;
    if (!targetId) throw new Error("No active organization");
    const res = await api<{ member: OrganizationMember; email_result?: { ok: boolean; simulated?: boolean; error?: string; messageId?: string } }>("POST", `/api/organizations/${targetId}/members`, data);
    await listOrganizationMembers(targetId);
    await refreshOrganizations();
    return res;
  }, [activeOrganization?.id, listOrganizationMembers, refreshOrganizations]);

  const updateOrganizationMember = useCallback(async (
    memberId: number,
    patch: Partial<OrganizationMember>,
    orgId?: number
  ): Promise<OrganizationMember> => {
    const targetId = orgId || activeOrganization?.id;
    if (!targetId) throw new Error("No active organization");
    const res = await api<{ member: OrganizationMember }>(
      "PUT",
      `/api/organizations/${targetId}/members/${memberId}`,
      patch
    );
    await listOrganizationMembers(targetId);
    return res.member;
  }, [activeOrganization?.id, listOrganizationMembers]);

  const removeOrganizationMember = useCallback(async (memberId: number, orgId?: number): Promise<void> => {
    const targetId = orgId || activeOrganization?.id;
    if (!targetId) throw new Error("No active organization");
    await api("DELETE", `/api/organizations/${targetId}/members/${memberId}`);
    await listOrganizationMembers(targetId);
    await refreshOrganizations();
  }, [activeOrganization?.id, listOrganizationMembers, refreshOrganizations]);

  const resendOrganizationInvite = useCallback(async (memberId: number, orgId?: number): Promise<{ ok: boolean; email_result?: any }> => {
    const targetId = orgId || activeOrganization?.id;
    if (!targetId) throw new Error("No active organization");
    const res = await api<{ ok: boolean; email_result?: any }>(
      "POST",
      `/api/organizations/${targetId}/members/${memberId}/resend-invite`
    );
    await listOrganizationMembers(targetId);
    return res;
  }, [activeOrganization?.id, listOrganizationMembers]);

  const switchSimulatedUser = useCallback(async (email: string | null) => {
    setSimulatedUser(email);
    setSimulatedUserState(email);
    setActiveOrganizationId(null);
    setActiveOrganization(null);
    await refreshLookups();
  }, [refreshLookups]);

  return {
    // data
    properties, vendors, settings,
    organizations, activeOrganization, organizationMembers, simulatedUser,
    loading, error, setError,
    // refresh
    refreshLookups,
    refreshOrganizations,
    // settings
    updateSettings,
    // organizations
    switchOrganization, createOrganization, updateOrganization, deleteOrganization,
    listOrganizationMembers, inviteOrganizationMember, updateOrganizationMember, removeOrganizationMember,
    resendOrganizationInvite,
    switchSimulatedUser,
    // properties / units
    createProperty, updateProperty, deleteProperty,
    listUnits, getUnit, createUnit, updateUnit, deleteUnit,
    // tenants
    listTenants, createTenant, updateTenant, deleteTenant,
    // leases
    listLeases, createLease, updateLease, deleteLease,
    // rent
    listCharges, generateCharges, recordPayment,
    // vendors
    createVendor, updateVendor, deleteVendor,
    // work orders
    listWorkOrders, createWorkOrder, updateWorkOrder, deleteWorkOrder,
    // airbnb
    listAirbnbBookings, createAirbnbBooking, updateAirbnbBooking, deleteAirbnbBooking,
    scheduleTurnoverCleaning, getAirbnbAnalytics,
    // cleaners & cleaning tasks
    listCleaners, listCleaningTasks, getCleaningTask, createCleaningTask, updateCleaningTask,
    deleteCleaningTask, sendCleaningReminder,
    // demo data management
    getDemoDataStatus, deleteDemoData, restoreDemoData,
  };
}

export type AppStateValue = ReturnType<typeof useAppState>;
