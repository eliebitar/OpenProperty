-- ── Settings (key/value) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Defaults live in the app (DEFAULT_SETTINGS in src/server/index.ts): a
-- deploy applies DDL only, so a seed row here fails the whole build.

-- ── Organizations (multi-user tenant boundary) ─────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS organization_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager',        -- 'owner' | 'admin' | 'manager' | 'viewer'
  status TEXT NOT NULL DEFAULT 'active',       -- 'active' | 'invited'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(organization_id, email)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_email ON organization_members(email);

-- ── Properties (buildings) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'single_family',  -- 'single_family' | 'multi_family' | 'condo' | 'townhouse' | 'commercial' | 'airbnb'
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  year_built INTEGER,
  notes TEXT,
  color TEXT NOT NULL DEFAULT 'sky',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_properties_org ON properties(organization_id);

-- ── Units (rentable spaces inside a property) ────────────────────
CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                          -- e.g. 'Unit 1A', '308', 'Main house'
  type TEXT NOT NULL DEFAULT 'residential',    -- 'residential' | 'commercial' | 'airbnb'
  bedrooms REAL NOT NULL DEFAULT 1,            -- studio = 0, allows half-beds (rare)
  bathrooms REAL NOT NULL DEFAULT 1,           -- allows half-baths (1.5)
  sqft INTEGER,
  market_rent REAL NOT NULL DEFAULT 0,
  monthly_operating_cost REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'vacant',       -- 'vacant' | 'occupied' | 'turnover' | 'unavailable'
  airbnb_nightly_rate REAL NOT NULL DEFAULT 0,
  airbnb_cleaning_fee REAL NOT NULL DEFAULT 0,
  airbnb_max_guests INTEGER NOT NULL DEFAULT 2,
  airbnb_min_nights INTEGER NOT NULL DEFAULT 1,
  airbnb_check_in_time TEXT NOT NULL DEFAULT '15:00',
  airbnb_check_out_time TEXT NOT NULL DEFAULT '11:00',
  airbnb_wifi_ssid TEXT,
  airbnb_wifi_password TEXT,
  airbnb_lockbox_code TEXT,
  airbnb_listing_url TEXT,
  airbnb_house_rules TEXT,
  airbnb_check_out_instructions TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_units_property ON units(property_id);
CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);

-- ── Tenants ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  date_of_birth TEXT,
  emergency_contact TEXT,
  employer TEXT,
  monthly_income REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tenants_org ON tenants(organization_id);
CREATE INDEX IF NOT EXISTS idx_tenants_name ON tenants(last_name, first_name);

-- ── Leases ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  primary_tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  start_date TEXT NOT NULL,                    -- 'YYYY-MM-DD'
  end_date TEXT NOT NULL,
  monthly_rent REAL NOT NULL DEFAULT 0,
  operating_cost_advance REAL NOT NULL DEFAULT 0,
  heating_cost_advance REAL NOT NULL DEFAULT 0,
  deposit REAL NOT NULL DEFAULT 0,
  rent_due_day INTEGER NOT NULL DEFAULT 1,
  late_fee REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',       -- 'upcoming' | 'active' | 'ended' | 'cancelled'
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leases_unit ON leases(unit_id);
CREATE INDEX IF NOT EXISTS idx_leases_tenant ON leases(primary_tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_status ON leases(status);

-- Multi-tenant leases (occupants beyond the primary).
CREATE TABLE IF NOT EXISTS lease_tenants (
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (lease_id, tenant_id)
);

-- ── Rent charges (one per period per lease) ──────────────────────
CREATE TABLE IF NOT EXISTS rent_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  period TEXT NOT NULL,                        -- 'YYYY-MM' (e.g. '2026-04')
  due_date TEXT NOT NULL,                      -- 'YYYY-MM-DD'
  amount REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open',         -- 'open' | 'partial' | 'paid' | 'overdue' | 'waived'
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_charges_lease_period ON rent_charges(lease_id, period);
CREATE INDEX IF NOT EXISTS idx_charges_due ON rent_charges(due_date);
CREATE INDEX IF NOT EXISTS idx_charges_status ON rent_charges(status);

-- ── Payments (applied to a charge) ───────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  charge_id INTEGER NOT NULL REFERENCES rent_charges(id) ON DELETE CASCADE,
  paid_at TEXT NOT NULL DEFAULT (datetime('now')),
  amount REAL NOT NULL DEFAULT 0,
  method TEXT NOT NULL DEFAULT 'cash',         -- 'cash' | 'check' | 'ach' | 'credit' | 'other'
  reference TEXT,                              -- check number, transaction ID, etc.
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_payments_charge ON payments(charge_id);

-- ── Vendors ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',    -- 'plumber' | 'electrician' | 'hvac' | 'handyman' | 'cleaning' | 'landscaping' | 'general'
  phone TEXT,
  email TEXT,
  notes TEXT,
  color TEXT NOT NULL DEFAULT 'slate',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Work orders (maintenance) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,  -- who reported it
  vendor_id INTEGER REFERENCES vendors(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',     -- 'low' | 'normal' | 'high' | 'urgent'
  status TEXT NOT NULL DEFAULT 'open',         -- 'open' | 'assigned' | 'in_progress' | 'completed' | 'cancelled'
  scheduled_at TEXT,
  completed_at TEXT,
  cost REAL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_wo_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_wo_property ON work_orders(property_id);
CREATE INDEX IF NOT EXISTS idx_wo_unit ON work_orders(unit_id);

-- ── Applications (manual record only — no public submission) ─────
CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  monthly_income REAL,
  employer TEXT,
  desired_move_in TEXT,
  status TEXT NOT NULL DEFAULT 'new',          -- 'new' | 'screening' | 'approved' | 'declined' | 'withdrawn'
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);

-- Demo data is seeded by the app on first read (ensureSeeded in
-- src/server/index.ts), never here: this file is applied as DDL only.

-- ── Operating Costs (Nebenkosten) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS operating_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  cost_type TEXT NOT NULL,                     -- e.g. 'water', 'tax', 'garbage', 'insurance'
  amount REAL NOT NULL DEFAULT 0,
  is_commercial_only BOOLEAN NOT NULL DEFAULT 0, -- Vorwegabzug flag
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_operating_costs_prop_year ON operating_costs(property_id, year);

CREATE TABLE IF NOT EXISTS nebenkosten_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  total_actual_costs REAL NOT NULL DEFAULT 0,
  total_advance_paid REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_nk_statements_lease ON nebenkosten_statements(lease_id);

-- ── Airbnb Bookings (Short-term rental reservations) ─────────────
CREATE TABLE IF NOT EXISTS airbnb_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  guest_name TEXT NOT NULL,
  guest_email TEXT,
  guest_phone TEXT,
  num_guests INTEGER NOT NULL DEFAULT 1,
  check_in_date TEXT NOT NULL,                     -- 'YYYY-MM-DD'
  check_out_date TEXT NOT NULL,                    -- 'YYYY-MM-DD'
  nights INTEGER NOT NULL DEFAULT 1,
  nightly_rate REAL NOT NULL DEFAULT 0,
  total_nights_amount REAL NOT NULL DEFAULT 0,
  cleaning_fee REAL NOT NULL DEFAULT 0,
  platform_fee REAL NOT NULL DEFAULT 0,            -- e.g. Airbnb host fee (~3%)
  tax_amount REAL NOT NULL DEFAULT 0,              -- Tourist / occupancy tax
  gross_amount REAL NOT NULL DEFAULT 0,            -- Total charged to guest
  net_payout REAL NOT NULL DEFAULT 0,              -- Host payout received
  payout_status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'received' | 'refunded'
  payout_date TEXT,
  booking_status TEXT NOT NULL DEFAULT 'confirmed',-- 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled'
  platform TEXT NOT NULL DEFAULT 'airbnb',         -- 'airbnb' | 'vrbo' | 'booking_com' | 'direct' | 'other'
  confirmation_code TEXT,                          -- e.g. 'HM84920'
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_airbnb_bookings_unit ON airbnb_bookings(unit_id);
CREATE INDEX IF NOT EXISTS idx_airbnb_bookings_dates ON airbnb_bookings(check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_airbnb_bookings_status ON airbnb_bookings(booking_status);

-- ── Email Delivery Logs ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL, -- 'sent' | 'failed' | 'simulated'
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at DESC);

-- ── Cleaning Tasks & Turnover Schedules ──────────────────────────────
CREATE TABLE IF NOT EXISTS cleaning_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  booking_id INTEGER REFERENCES airbnb_bookings(id) ON DELETE SET NULL,
  cleaner_id INTEGER REFERENCES organization_members(id) ON DELETE SET NULL,
  scheduled_date TEXT NOT NULL,         -- 'YYYY-MM-DD' (guest checkout date)
  scheduled_time TEXT NOT NULL DEFAULT '11:00',
  next_check_in_date TEXT,             -- 'YYYY-MM-DD'
  next_check_in_time TEXT DEFAULT '15:00',
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'in_progress' | 'completed' | 'cancelled'
  started_at TEXT,
  completed_at TEXT,
  checklist TEXT,                      -- JSON array e.g. [{"id":"1","task":"Linens washed","done":true}]
  notes TEXT,                          -- Special instructions or turnover notes
  issue_reported TEXT,                 -- Damage or maintenance report by cleaner
  reminder_sent_at TEXT,               -- Timestamp when email reminder was sent
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_org ON cleaning_tasks(organization_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_cleaner ON cleaning_tasks(cleaner_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_unit ON cleaning_tasks(unit_id);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_date ON cleaning_tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_status ON cleaning_tasks(status);

