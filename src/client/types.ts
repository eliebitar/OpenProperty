// ── Core entities ──────────────────────────────────────────────────

export type PropertyType = "single_family" | "multi_family" | "condo" | "townhouse" | "commercial" | "airbnb";

export interface Property {
  id: number;
  organization_id?: number | null;
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

export type UnitType = "residential" | "commercial" | "airbnb";
export type UnitStatus = "vacant" | "occupied" | "turnover" | "unavailable";

export interface Unit {
  id: number;
  property_id: number;
  name: string;
  type: UnitType | string;
  bedrooms: number;
  bathrooms: number;
  sqft: number | null;
  market_rent: number;
  monthly_operating_cost?: number;
  status: UnitStatus;
  airbnb_nightly_rate?: number;
  airbnb_cleaning_fee?: number;
  airbnb_max_guests?: number;
  airbnb_min_nights?: number;
  airbnb_check_in_time?: string | null;
  airbnb_check_out_time?: string | null;
  airbnb_wifi_ssid?: string | null;
  airbnb_wifi_password?: string | null;
  airbnb_lockbox_code?: string | null;
  airbnb_listing_url?: string | null;
  airbnb_house_rules?: string | null;
  airbnb_check_out_instructions?: string | null;
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
  current_airbnb_booking_id?: number | null;
  current_airbnb_guest_name?: string | null;
  current_airbnb_check_out?: string | null;
  airbnb_upcoming_bookings_count?: number | null;
  cleaner_id?: number | null;
  cleaner_name?: string | null;
  cleaner_email?: string | null;
  cleaning_checklist?: string | null;
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
  vendor_category?: VendorCategory | string | null;
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
  airbnb_units?: number;
  airbnb_active_guests?: number;
  airbnb_month_revenue?: number;
  airbnb_upcoming_checkins?: number;
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
  unit_type: "residential" | "commercial" | "airbnb";
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

// ── Airbnb & Short-term rentals ────────────────────────────────────

export type BookingStatus = "confirmed" | "checked_in" | "checked_out" | "cancelled";
export type PayoutStatus = "pending" | "received" | "refunded";
export type BookingPlatform = "airbnb" | "vrbo" | "booking_com" | "direct" | "other";

export interface AirbnbBooking {
  id: number;
  unit_id: number;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  num_guests: number;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  nightly_rate: number;
  total_nights_amount: number;
  cleaning_fee: number;
  platform_fee: number;
  tax_amount: number;
  gross_amount: number;
  net_payout: number;
  payout_status: PayoutStatus;
  payout_date: string | null;
  booking_status: BookingStatus;
  platform: BookingPlatform;
  confirmation_code: string | null;
  notes: string | null;
  created_at: string;
  // Joined
  unit_name?: string | null;
  property_id?: number | null;
  property_name?: string | null;
  property_color?: string | null;
  property_address?: string | null;
  property_city?: string | null;
  lockbox_code?: string | null;
  wifi_ssid?: string | null;
  wifi_password?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  house_rules?: string | null;
}

export type NewAirbnbBooking = Partial<Omit<AirbnbBooking, "id" | "created_at" | "unit_name" | "property_id" | "property_name" | "property_color" | "property_address" | "property_city" | "lockbox_code" | "wifi_ssid" | "wifi_password" | "check_in_time" | "check_out_time" | "house_rules">> & {
  unit_id: number;
  guest_name: string;
  check_in_date: string;
  check_out_date: string;
};

export interface AirbnbAnalytics {
  total_revenue: number;
  total_bookings: number;
  active_stays: number;
  upcoming_check_ins_7d: number;
  upcoming_check_outs_7d: number;
  average_daily_rate: number;
  occupancy_rate: number;
  revenue_by_month: { month: string; revenue: number; nights: number }[];
  units_summary: {
    unit_id: number;
    unit_name: string;
    property_id: number;
    property_name: string;
    bookings_count: number;
    revenue: number;
    occupancy_rate: number;
    current_guest: string | null;
  }[];
}

export interface DemoDataStatus {
  hasDemoData: boolean;
  counts: {
    properties: number;
    units: number;
    bookings: number;
    vendors: number;
    workOrders: number;
  };
  demoProperties: string[];
}

export interface DeleteDemoDataResult {
  ok: boolean;
  message: string;
  deleted: {
    properties: number;
    units: number;
    bookings: number;
    workOrders: number;
    vendors: number;
    leases: number;
  };
}

// ── Organizations & Multi-User Team ───────────────────────────────

export type OrganizationRole = "owner" | "admin" | "manager" | "viewer" | "cleaner";
export type MemberStatus = "active" | "invited";

export interface Organization {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  created_at: string;
  updated_at?: string;
  property_count?: number;
  member_count?: number;
  user_role?: OrganizationRole;
  user_status?: MemberStatus;
  is_active?: boolean;
}

export interface OrganizationMember {
  id: number;
  organization_id: number;
  user_id: string | null;
  email: string;
  name: string;
  role: OrganizationRole;
  status: MemberStatus;
  created_at: string;
  updated_at?: string;
}

export interface NewOrganization {
  name: string;
  description?: string;
  slug?: string;
}

export interface InviteMemberInput {
  email: string;
  name: string;
  role: OrganizationRole;
  status?: MemberStatus;
}

// ── Email & Sender Configuration ──────────────────────────────────

export type EmailProvider = "smtp" | "resend" | "sendgrid" | "brevo" | "postmark" | "mailchannels";

export interface EmailSenderConfig {
  enabled: boolean;
  provider: EmailProvider;
  fromAddress: string;
  fromName: string;
  replyTo?: string;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  apiKey?: string;
}

export interface EmailLogEntry {
  id: number;
  to_email: string;
  subject: string;
  provider: string;
  status: "sent" | "failed" | "simulated";
  error: string | null;
  created_at: string;
}

// ── Turnover Cleaning & Schedule ──────────────────────────────────

export type CleaningStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface ChecklistItem {
  id: string;
  task: string;
  done: boolean;
}

export interface CleaningTask {
  id: number;
  organization_id: number;
  unit_id: number;
  unit_name: string;
  property_id: number;
  property_name: string;
  property_address?: string | null;
  property_city?: string | null;
  booking_id?: number | null;
  guest_name?: string | null;
  booking_guest_name?: string | null;
  cleaner_id?: number | null;
  cleaner_name?: string | null;
  cleaner_email?: string | null;
  scheduled_date: string;         // 'YYYY-MM-DD'
  scheduled_time: string;         // e.g. '11:00'
  next_check_in_date?: string | null;
  next_check_in_time?: string | null;
  status: CleaningStatus;
  started_at?: string | null;
  completed_at?: string | null;
  checklist?: string | null;       // JSON encoded ChecklistItem[]
  notes?: string | null;
  issue_reported?: string | null;
  lockbox_code?: string | null;
  airbnb_lockbox_code?: string | null;
  wifi_ssid?: string | null;
  airbnb_wifi_ssid?: string | null;
  wifi_password?: string | null;
  airbnb_wifi_password?: string | null;
  reminder_sent_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface CreateCleaningTaskInput {
  unit_id: number;
  booking_id?: number | null;
  cleaner_id?: number | null;
  scheduled_date: string;
  scheduled_time?: string;
  next_check_in_date?: string | null;
  next_check_in_time?: string | null;
  notes?: string | null;
  checklist?: ChecklistItem[];
}

export interface UpdateCleaningTaskInput {
  cleaner_id?: number | null;
  scheduled_date?: string;
  scheduled_time?: string;
  next_check_in_date?: string | null;
  next_check_in_time?: string | null;
  status?: CleaningStatus;
  started_at?: string | null;
  completed_at?: string | null;
  checklist?: ChecklistItem[] | string;
  notes?: string | null;
  issue_reported?: string | null;
}



