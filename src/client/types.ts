// ── Core entities ──────────────────────────────────────────────────

export type PropertyType = "single_family" | "multi_family" | "condo" | "townhouse" | "commercial";

export interface Property {
  id: number;
  name: string;
  type: PropertyType;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  year_built: number | null;
  notes: string | null;
  color: string;
  created_at: string;
  // Joined
  unit_count?: number;
  occupied_count?: number;
}

export type UnitStatus = "vacant" | "occupied" | "turnover" | "unavailable";

export interface Unit {
  id: number;
  property_id: number;
  name: string;
  type: string;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  market_rent: number;
  monthly_operating_cost?: number;
  status: UnitStatus;
  notes: string | null;
  created_at: string;
  // Joined
  property_name?: string | null;
  property_color?: string | null;
  property_address?: string | null;
  property_city?: string | null;
  active_lease_id?: number | null;
  active_tenant_id?: number | null;
  active_tenant_name?: string | null;
  active_rent?: number | null;
  active_operating_advance?: number | null;
  active_heating_advance?: number | null;
}

export interface Tenant {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  emergency_contact: string | null;
  employer: string | null;
  monthly_income: number | null;
  notes: string | null;
  created_at: string;
  // Joined (active lease)
  active_unit_id?: number | null;
  active_unit_name?: string | null;
  active_property_name?: string | null;
}

export type LeaseStatus = "upcoming" | "active" | "ended" | "cancelled";

export interface Lease {
  id: number;
  unit_id: number;
  primary_tenant_id: number | null;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  operating_cost_advance: number;
  heating_cost_advance: number;
  deposit: number;
  rent_due_day: number;
  late_fee: number;
  status: LeaseStatus;
  notes: string | null;
  created_at: string;
  // Joined
  unit_name?: string | null;
  property_id?: number | null;
  property_name?: string | null;
  property_color?: string | null;
  tenant_first_name?: string | null;
  tenant_last_name?: string | null;
  tenant_email?: string | null;
  tenant_phone?: string | null;
}

export type ChargeStatus = "open" | "partial" | "paid" | "overdue" | "waived";

export interface RentCharge {
  id: number;
  lease_id: number;
  period: string;
  due_date: string;
  amount: number;
  amount_paid: number;
  status: ChargeStatus;
  notes: string | null;
  created_at: string;
  // Joined
  unit_id?: number | null;
  lease_rent?: number | null;
  rent_due_day?: number | null;
  unit_name?: string | null;
  property_id?: number | null;
  property_name?: string | null;
  property_color?: string | null;
  tenant_id?: number | null;
  tenant_first_name?: string | null;
  tenant_last_name?: string | null;
}

export type PaymentMethod = "cash" | "check" | "ach" | "credit" | "other";

export interface Payment {
  id: number;
  charge_id: number;
  paid_at: string;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
}

export type VendorCategory = "plumber" | "electrician" | "hvac" | "handyman" | "cleaning" | "landscaping" | "general";

export interface Vendor {
  id: number;
  name: string;
  category: VendorCategory;
  phone: string | null;
  email: string | null;
  notes: string | null;
  color: string;
  created_at: string;
}

export type WorkOrderPriority = "low" | "normal" | "high" | "urgent";
export type WorkOrderStatus = "open" | "assigned" | "in_progress" | "completed" | "cancelled";

export interface WorkOrder {
  id: number;
  property_id: number | null;
  unit_id: number | null;
  tenant_id: number | null;
  vendor_id: number | null;
  title: string;
  description: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  scheduled_at: string | null;
  completed_at: string | null;
  cost: number | null;
  notes: string | null;
  created_at: string;
  // Joined
  property_name?: string | null;
  property_color?: string | null;
  unit_name?: string | null;
  tenant_first_name?: string | null;
  tenant_last_name?: string | null;
  vendor_name?: string | null;
  vendor_color?: string | null;
}

export type ApplicationStatus = "new" | "screening" | "approved" | "declined" | "withdrawn";

export interface Application {
  id: number;
  unit_id: number | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  monthly_income: number | null;
  employer: string | null;
  desired_move_in: string | null;
  status: ApplicationStatus;
  notes: string | null;
  created_at: string;
  unit_name?: string | null;
  property_name?: string | null;
}

export interface DashboardSummary {
  period: string;
  properties: number;
  units: number;
  occupied: number;
  vacant: number;
  occupancy_rate: number;
  active_leases: number;
  upcoming_move_outs: number;
  month_outstanding: number;
  month_collected: number;
  overdue_total: number;
  overdue_count: number;
  open_work_orders: number;
  urgent_work_orders: number;
  recent_work_orders: {
    id: number; title: string; priority: string; status: string;
    property_name: string | null; unit_name: string | null; created_at: string;
  }[];
  upcoming_expirations: {
    id: number; end_date: string;
    tenant_first_name: string | null; tenant_last_name: string | null;
    unit_name: string | null; property_name: string | null;
  }[];
}

// ── Input types for mutations ──────────────────────────────────────

export type NewProperty = Partial<Omit<Property, "id" | "created_at" | "unit_count" | "occupied_count">> & { name: string };
export type NewUnit = Partial<Omit<Unit, "id" | "created_at" | "property_name" | "property_color" | "property_address" | "property_city" | "active_lease_id" | "active_tenant_name">> & { property_id: number; name: string };
export type NewTenant = Partial<Omit<Tenant, "id" | "created_at" | "active_unit_id" | "active_unit_name" | "active_property_name">> & { first_name: string; last_name: string };
export type NewLease = Partial<Omit<Lease, "id" | "created_at" | "unit_name" | "property_id" | "property_name" | "property_color" | "tenant_first_name" | "tenant_last_name" | "tenant_email" | "tenant_phone">> & { unit_id: number; start_date: string; end_date: string };
export type NewWorkOrder = Partial<Omit<WorkOrder, "id" | "created_at" | "property_name" | "property_color" | "unit_name" | "tenant_first_name" | "tenant_last_name" | "vendor_name" | "vendor_color">> & { title: string };
export type NewVendor = Partial<Omit<Vendor, "id" | "created_at">> & { name: string };
export type NewApplication = Partial<Omit<Application, "id" | "created_at" | "unit_name" | "property_name">> & { first_name: string; last_name: string };

export interface OperatingCost {
  id: number;
  property_id: number;
  year: number;
  cost_type: string;
  amount: number;
  is_commercial_only: boolean;
  notes: string | null;
  created_at: string;
}

export interface NebenkostenStatement {
  id: number;
  lease_id: number;
  year: number;
  total_actual_costs: number;
  total_advance_paid: number;
  balance: number;
  created_at: string;
}

export interface CostAllocationItem {
  cost_id: number;
  cost_type: string;
  total_property_amount: number;
  is_commercial_only: boolean;
  allocation_key: string;
  unit_share_amount: number;
}

export interface UnitOperatingCostBreakdown {
  unit_id: number;
  unit_name: string;
  unit_type: "residential" | "commercial";
  sqft: number;
  sqft_share_pct: number;
  allocated_cost: number;
  lease_id: number | null;
  tenant_name: string | null;
  operating_cost_advance: number;
  heating_cost_advance: number;
  monthly_advance: number;
  annual_advance: number;
  balance: number;
  is_vacant: boolean;
  cost_items: CostAllocationItem[];
  statement_id: number | null;
}

export interface OperatingCostsSummary {
  property_id: number;
  property_name: string;
  year: number;
  total_property_costs: number;
  shared_costs: number;
  commercial_only_costs: number;
  total_sqft: number;
  total_residential_sqft: number;
  total_commercial_sqft: number;
  cost_per_sqft: number;
  shared_cost_per_sqft: number;
  costs: OperatingCost[];
  units: UnitOperatingCostBreakdown[];
}
