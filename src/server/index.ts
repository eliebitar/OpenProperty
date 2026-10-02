import { Hono, type Context } from "hono";
import { z } from "zod";
import { initDB, query, get, run } from "./db";
import { authMiddleware, getKeycloakConfig, type ServerEnv } from "./auth";

type Env = ServerEnv;

const app = new Hono<Env>();

app.use("*", async (c, next) => {
  initDB(c.env);
  await ensureSeeded();
  await next();
});

app.use("/api/*", authMiddleware);

// ── First-run data ─────────────────────────────────────────────────
// A deploy applies `schema.sql` as DDL only — a seed INSERT there fails the
// whole build — so the defaults and the sample portfolio are written here,
// once, when their tables are still empty. A re-deploy never resurrects a
// row the user deleted, because the table is no longer empty.

const DEFAULT_SETTINGS: Record<string, string> = {
  default_rent_due_day: "1",
  late_fee_amount: "50",
  late_fee_grace_days: "5",
  currency: "EUR",
  keycloak_enabled: "false",
  keycloak_url: "http://localhost:8080",
  keycloak_realm: "openproperty",
  keycloak_client_id: "openproperty-client",
  keycloak_required: "false",
};

const DEMO_PROPERTIES: Array<[string, string, string, string, string, string, string]> = [
  ["Oakwood Estate", "single_family", "210 Oakwood Ln", "Austin", "TX", "78704", "emerald"],
  ["Honeybee Hideaway", "single_family", "88 Bramble Ct", "Austin", "TX", "78704", "amber"],
  ["308 Mission Apartments", "multi_family", "308 Mission St", "Austin", "TX", "78702", "sky"],
];

/** property index (into DEMO_PROPERTIES), name, beds, baths, sqft, rent, status */
const DEMO_UNITS: Array<[number, string, number, number, number, number, string]> = [
  [0, "Main house", 3, 2, 1450, 2300, "occupied"],
  [1, "Main house", 2, 1, 980, 1700, "occupied"],
  [2, "Unit 1", 1, 1, 620, 1450, "occupied"],
  [2, "Unit 2", 1, 1, 620, 1450, "vacant"],
  [2, "Unit 3", 2, 1, 850, 1850, "occupied"],
];

const DEMO_VENDORS: Array<[string, string, string, string]> = [
  ["Emerald Pool Service", "general", "512-555-0144", "emerald"],
  ["Hill Country Plumbing", "plumber", "512-555-0188", "sky"],
  ["Bright Spark Electric", "electrician", "512-555-0102", "amber"],
];

let seeded = false; // per-isolate fast path; the COUNT re-checks are cheap

async function ensureSeeded(): Promise<void> {
  if (seeded) return;
  seeded = true;
  try {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      await run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value]);
    }
    await run("UPDATE settings SET value = 'EUR' WHERE key = 'currency' AND value = 'USD'");
    try {
      await run("ALTER TABLE units ADD COLUMN monthly_operating_cost REAL NOT NULL DEFAULT 0");
    } catch {
      // Column already exists
    }

    const unitCols = [
      "ALTER TABLE units ADD COLUMN airbnb_nightly_rate REAL NOT NULL DEFAULT 0",
      "ALTER TABLE units ADD COLUMN airbnb_cleaning_fee REAL NOT NULL DEFAULT 0",
      "ALTER TABLE units ADD COLUMN airbnb_max_guests INTEGER NOT NULL DEFAULT 2",
      "ALTER TABLE units ADD COLUMN airbnb_min_nights INTEGER NOT NULL DEFAULT 1",
      "ALTER TABLE units ADD COLUMN airbnb_check_in_time TEXT NOT NULL DEFAULT '15:00'",
      "ALTER TABLE units ADD COLUMN airbnb_check_out_time TEXT NOT NULL DEFAULT '11:00'",
      "ALTER TABLE units ADD COLUMN airbnb_wifi_ssid TEXT",
      "ALTER TABLE units ADD COLUMN airbnb_wifi_password TEXT",
      "ALTER TABLE units ADD COLUMN airbnb_lockbox_code TEXT",
      "ALTER TABLE units ADD COLUMN airbnb_listing_url TEXT",
      "ALTER TABLE units ADD COLUMN airbnb_house_rules TEXT",
      "ALTER TABLE units ADD COLUMN airbnb_check_out_instructions TEXT",
    ];
    for (const sql of unitCols) {
      try { await run(sql); } catch { /* Column already exists */ }
    }

    await run(`
      CREATE TABLE IF NOT EXISTS airbnb_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
        guest_name TEXT NOT NULL,
        guest_email TEXT,
        guest_phone TEXT,
        num_guests INTEGER NOT NULL DEFAULT 1,
        check_in_date TEXT NOT NULL,
        check_out_date TEXT NOT NULL,
        nights INTEGER NOT NULL DEFAULT 1,
        nightly_rate REAL NOT NULL DEFAULT 0,
        total_nights_amount REAL NOT NULL DEFAULT 0,
        cleaning_fee REAL NOT NULL DEFAULT 0,
        platform_fee REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        gross_amount REAL NOT NULL DEFAULT 0,
        net_payout REAL NOT NULL DEFAULT 0,
        payout_status TEXT NOT NULL DEFAULT 'pending',
        payout_date TEXT,
        booking_status TEXT NOT NULL DEFAULT 'confirmed',
        platform TEXT NOT NULL DEFAULT 'airbnb',
        confirmation_code TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await run("CREATE INDEX IF NOT EXISTS idx_airbnb_bookings_unit ON airbnb_bookings(unit_id)");
    await run("CREATE INDEX IF NOT EXISTS idx_airbnb_bookings_dates ON airbnb_bookings(check_in_date, check_out_date)");
    await run("CREATE INDEX IF NOT EXISTS idx_airbnb_bookings_status ON airbnb_bookings(booking_status)");

    const props = await get<{ n: number }>("SELECT COUNT(*) AS n FROM properties");
    if ((props?.n ?? 0) === 0) {
      const ids: number[] = [];
      for (const p of DEMO_PROPERTIES) {
        await run(
          "INSERT INTO properties (name, type, address, city, state, zip, color) VALUES (?, ?, ?, ?, ?, ?, ?)",
          p,
        );
        const row = await get<{ id: number }>("SELECT id FROM properties ORDER BY id DESC LIMIT 1");
        ids.push(row?.id ?? 0);
      }
      const units = await get<{ n: number }>("SELECT COUNT(*) AS n FROM units");
      if ((units?.n ?? 0) === 0) {
        for (const [pi, name, beds, baths, sqft, rent, status] of DEMO_UNITS) {
          if (!ids[pi]) continue;
          await run(
            "INSERT INTO units (property_id, name, bedrooms, bathrooms, sqft, market_rent, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [ids[pi], name, beds, baths, sqft, rent, status],
          );
        }
      }
    }

    const vendors = await get<{ n: number }>("SELECT COUNT(*) AS n FROM vendors");
    if ((vendors?.n ?? 0) === 0) {
      for (const v of DEMO_VENDORS) {
        await run("INSERT INTO vendors (name, category, phone, color) VALUES (?, ?, ?, ?)", v);
      }
      await run("INSERT INTO vendors (name, category, phone, color) VALUES (?, ?, ?, ?)", [
        "Sparkle Clean Turnover Services",
        "cleaning",
        "512-555-0199",
        "teal",
      ]);
    }

    // Seed demo Airbnb unit and bookings if no airbnb units exist yet
    const airbnbUnitsCount = await get<{ n: number }>("SELECT COUNT(*) as n FROM units WHERE type = 'airbnb'");
    if ((airbnbUnitsCount?.n ?? 0) === 0) {
      const targetProp = await get<{ id: number }>("SELECT id FROM properties ORDER BY id ASC LIMIT 1");
      if (targetProp?.id) {
        const uRes = await run(
          `INSERT INTO units (
            property_id, name, type, bedrooms, bathrooms, sqft, market_rent, status,
            airbnb_nightly_rate, airbnb_cleaning_fee, airbnb_max_guests, airbnb_min_nights,
            airbnb_check_in_time, airbnb_check_out_time, airbnb_wifi_ssid, airbnb_wifi_password,
            airbnb_lockbox_code, airbnb_listing_url, airbnb_house_rules, airbnb_check_out_instructions
          ) VALUES (?, ?, 'airbnb', ?, ?, ?, ?, 'occupied', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            targetProp.id,
            "Suite 4B - Designer Loft (Airbnb)",
            1, 1, 60, 130,
            130, 50, 3, 2,
            "15:00", "11:00",
            "OpenProperty_Loft4", "SuperHost2026",
            "4819", "https://airbnb.com/rooms/sample-suite-4b",
            "No smoking. Quiet hours 22:00-08:00. No unauthorized parties.",
            "Please turn off lights & AC, leave keys in lockbox, and take trash out.",
          ],
        );
        const airbnbUnitId = uRes.lastInsertRowid;
        if (airbnbUnitId) {
          const now = new Date();
          const dPastIn = new Date(now.getTime() - 10 * 86400000).toISOString().slice(0, 10);
          const dPastOut = new Date(now.getTime() - 6 * 86400000).toISOString().slice(0, 10);
          const dCurrIn = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10);
          const dCurrOut = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
          const dNextIn = new Date(now.getTime() + 5 * 86400000).toISOString().slice(0, 10);
          const dNextOut = new Date(now.getTime() + 9 * 86400000).toISOString().slice(0, 10);

          await run(
            `INSERT INTO airbnb_bookings (
              unit_id, guest_name, guest_email, guest_phone, num_guests,
              check_in_date, check_out_date, nights, nightly_rate, total_nights_amount,
              cleaning_fee, platform_fee, tax_amount, gross_amount, net_payout,
              payout_status, payout_date, booking_status, platform, confirmation_code, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              airbnbUnitId, "Sophie Laurent", "sophie.laurent@example.fr", "+33 6 12 34 56 78", 2,
              dPastIn, dPastOut, 4, 130, 520, 50, 15.6, 25, 595, 554.4,
              "received", dPastIn, "checked_out", "airbnb", "HM-FR78921", "Visiting for design conference.",
            ],
          );

          await run(
            `INSERT INTO airbnb_bookings (
              unit_id, guest_name, guest_email, guest_phone, num_guests,
              check_in_date, check_out_date, nights, nightly_rate, total_nights_amount,
              cleaning_fee, platform_fee, tax_amount, gross_amount, net_payout,
              payout_status, payout_date, booking_status, platform, confirmation_code, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              airbnbUnitId, "Liam & Olivia Chen", "liam.chen@example.com", "+1 512 555 9012", 2,
              dCurrIn, dCurrOut, 4, 130, 520, 50, 15.6, 25, 595, 554.4,
              "received", dCurrIn, "checked_in", "airbnb", "HM-US41289", "Anniversary trip. Requested early check-in.",
            ],
          );

          await run(
            `INSERT INTO airbnb_bookings (
              unit_id, guest_name, guest_email, guest_phone, num_guests,
              check_in_date, check_out_date, nights, nightly_rate, total_nights_amount,
              cleaning_fee, platform_fee, tax_amount, gross_amount, net_payout,
              payout_status, payout_date, booking_status, platform, confirmation_code, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              airbnbUnitId, "David Miller", "david.m@example.org", "+44 7911 123456", 1,
              dNextIn, dNextOut, 4, 130, 520, 50, 15.6, 25, 595, 554.4,
              "pending", null, "confirmed", "airbnb", "HM-UK90234", "Business traveler.",
            ],
          );
        }
      }
    }
  } catch {
    // A cold database mid-migration, or a table this build has not created
    // yet: the next request retries. Never fail a request over sample data.
    seeded = false;
  }
}

// ── Helpers ────────────────────────────────────────────────────────

const intParam = (raw: string | undefined): number | null => {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
};

async function parseJson<T>(c: Context, schema: z.ZodType<T>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") };
  return { ok: true, data: parsed.data };
}

function buildUpdate(fields: Record<string, unknown>): { sets: string[]; params: unknown[] } {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) { sets.push(`${k} = ?`); params.push(v); }
  }
  return { sets, params };
}

// ── Properties ─────────────────────────────────────────────────────

const PropertyInput = z.object({
  name: z.string().min(1),
  type: z.enum(["single_family", "multi_family", "condo", "townhouse", "commercial", "airbnb"]).optional(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zip: z.string().optional().nullable(),
  year_built: z.number().int().optional().nullable(),
  notes: z.string().optional().nullable(),
  color: z.string().optional(),
});

app.get("/api/properties", async (c) => {
  const rows = await query(
    `SELECT p.*,
       (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) as unit_count,
       (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.status = 'occupied') as occupied_count
     FROM properties p ORDER BY p.name`,
  );
  return c.json({ properties: rows });
});

app.get("/api/properties/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const row = await get("SELECT * FROM properties WHERE id = ?", [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ property: row });
});

app.post("/api/properties", async (c) => {
  const parsed = await parseJson(c, PropertyInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO properties (name, type, address, city, state, zip, year_built, notes, color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.name, d.type ?? "single_family", d.address ?? null, d.city ?? null, d.state ?? null, d.zip ?? null, d.year_built ?? null, d.notes ?? null, d.color ?? "sky"],
  );
  const row = await get("SELECT * FROM properties WHERE id = ?", [result.lastInsertRowid]);
  return c.json({ property: row }, 201);
});

app.put("/api/properties/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, PropertyInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const r = await run(`UPDATE properties SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get("SELECT * FROM properties WHERE id = ?", [id]);
  return c.json({ property: row });
});

app.delete("/api/properties/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM properties WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Units ──────────────────────────────────────────────────────────

const UnitInput = z.object({
  property_id: z.number().int(),
  name: z.string().min(1),
  type: z.enum(["residential", "commercial", "airbnb"]).optional(),
  bedrooms: z.number().min(0).optional(),
  bathrooms: z.number().min(0).optional(),
  sqft: z.number().int().optional().nullable(),
  market_rent: z.number().min(0).optional(),
  monthly_operating_cost: z.number().min(0).optional(),
  status: z.enum(["vacant", "occupied", "turnover", "unavailable"]).optional(),
  airbnb_nightly_rate: z.number().min(0).optional().nullable(),
  airbnb_cleaning_fee: z.number().min(0).optional().nullable(),
  airbnb_max_guests: z.number().int().min(1).optional().nullable(),
  airbnb_min_nights: z.number().int().min(1).optional().nullable(),
  airbnb_check_in_time: z.string().optional().nullable(),
  airbnb_check_out_time: z.string().optional().nullable(),
  airbnb_wifi_ssid: z.string().optional().nullable(),
  airbnb_wifi_password: z.string().optional().nullable(),
  airbnb_lockbox_code: z.string().optional().nullable(),
  airbnb_listing_url: z.string().optional().nullable(),
  airbnb_house_rules: z.string().optional().nullable(),
  airbnb_check_out_instructions: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const UNIT_SELECT = `
  SELECT u.*,
    p.name as property_name,
    p.color as property_color,
    p.address as property_address,
    p.city as property_city,
    (SELECT l.id FROM leases l WHERE l.unit_id = u.id AND l.status = 'active' ORDER BY l.start_date DESC LIMIT 1) as active_lease_id,
    (SELECT l.primary_tenant_id FROM leases l WHERE l.unit_id = u.id AND l.status = 'active' ORDER BY l.start_date DESC LIMIT 1) as active_tenant_id,
    (SELECT t.first_name || ' ' || t.last_name FROM leases l LEFT JOIN tenants t ON t.id = l.primary_tenant_id WHERE l.unit_id = u.id AND l.status = 'active' ORDER BY l.start_date DESC LIMIT 1) as active_tenant_name,
    (SELECT l.monthly_rent FROM leases l WHERE l.unit_id = u.id AND l.status = 'active' ORDER BY l.start_date DESC LIMIT 1) as active_rent,
    (SELECT l.operating_cost_advance FROM leases l WHERE l.unit_id = u.id AND l.status = 'active' ORDER BY l.start_date DESC LIMIT 1) as active_operating_advance,
    (SELECT l.heating_cost_advance FROM leases l WHERE l.unit_id = u.id AND l.status = 'active' ORDER BY l.start_date DESC LIMIT 1) as active_heating_advance,
    (SELECT b.id FROM airbnb_bookings b WHERE b.unit_id = u.id AND b.booking_status IN ('confirmed', 'checked_in') AND b.check_in_date <= date('now') AND b.check_out_date >= date('now') ORDER BY b.check_in_date DESC LIMIT 1) as current_airbnb_booking_id,
    (SELECT b.guest_name FROM airbnb_bookings b WHERE b.unit_id = u.id AND b.booking_status IN ('confirmed', 'checked_in') AND b.check_in_date <= date('now') AND b.check_out_date >= date('now') ORDER BY b.check_in_date DESC LIMIT 1) as current_airbnb_guest_name,
    (SELECT b.check_out_date FROM airbnb_bookings b WHERE b.unit_id = u.id AND b.booking_status IN ('confirmed', 'checked_in') AND b.check_in_date <= date('now') AND b.check_out_date >= date('now') ORDER BY b.check_in_date DESC LIMIT 1) as current_airbnb_check_out,
    (SELECT COUNT(*) FROM airbnb_bookings b WHERE b.unit_id = u.id AND b.booking_status != 'cancelled' AND b.check_out_date >= date('now')) as airbnb_upcoming_bookings_count
  FROM units u
  LEFT JOIN properties p ON p.id = u.property_id
`;

app.get("/api/units", async (c) => {
  const propertyId = intParam(c.req.query("property_id"));
  const status = c.req.query("status");
  const where: string[] = [];
  const params: unknown[] = [];
  if (propertyId) { where.push("u.property_id = ?"); params.push(propertyId); }
  if (status) { where.push("u.status = ?"); params.push(status); }
  const sql = `${UNIT_SELECT}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY p.name, u.name`;
  const rows = await query(sql, params);
  return c.json({ units: rows });
});

app.get("/api/units/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const row = await get(`${UNIT_SELECT} WHERE u.id = ?`, [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ unit: row });
});

app.post("/api/units", async (c) => {
  const parsed = await parseJson(c, UnitInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO units (
       property_id, name, type, bedrooms, bathrooms, sqft, market_rent, monthly_operating_cost, status,
       airbnb_nightly_rate, airbnb_cleaning_fee, airbnb_max_guests, airbnb_min_nights,
       airbnb_check_in_time, airbnb_check_out_time, airbnb_wifi_ssid, airbnb_wifi_password,
       airbnb_lockbox_code, airbnb_listing_url, airbnb_house_rules, airbnb_check_out_instructions, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.property_id, d.name, d.type ?? "residential", d.bedrooms ?? 1, d.bathrooms ?? 1, d.sqft ?? null,
      d.market_rent ?? 0, d.monthly_operating_cost ?? 0, d.status ?? "vacant",
      d.airbnb_nightly_rate ?? 0, d.airbnb_cleaning_fee ?? 0, d.airbnb_max_guests ?? 2, d.airbnb_min_nights ?? 1,
      d.airbnb_check_in_time ?? "15:00", d.airbnb_check_out_time ?? "11:00", d.airbnb_wifi_ssid ?? null, d.airbnb_wifi_password ?? null,
      d.airbnb_lockbox_code ?? null, d.airbnb_listing_url ?? null, d.airbnb_house_rules ?? null, d.airbnb_check_out_instructions ?? null, d.notes ?? null,
    ],
  );
  const row = await get(`${UNIT_SELECT} WHERE u.id = ?`, [result.lastInsertRowid]);
  return c.json({ unit: row }, 201);
});

app.put("/api/units/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, UnitInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const r = await run(`UPDATE units SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  if (parsed.data.monthly_operating_cost !== undefined) {
    await run(
      "UPDATE leases SET operating_cost_advance = ? WHERE unit_id = ? AND status = 'active'",
      [parsed.data.monthly_operating_cost, id],
    );
  }
  if (parsed.data.market_rent !== undefined) {
    await run(
      "UPDATE leases SET monthly_rent = ? WHERE unit_id = ? AND status = 'active'",
      [parsed.data.market_rent, id],
    );
  }
  const row = await get(`${UNIT_SELECT} WHERE u.id = ?`, [id]);
  return c.json({ unit: row });
});

app.delete("/api/units/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM units WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

app.post("/api/units/:id/assign-tenant", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid unit ID" }, 400);

  const unit = await get<{ id: number; market_rent: number; monthly_operating_cost: number }>(
    "SELECT id, market_rent, monthly_operating_cost FROM units WHERE id = ?",
    [id],
  );
  if (!unit) return c.json({ error: "Unit not found" }, 404);

  const body = await c.req.json().catch(() => ({})) as {
    tenant_id: number;
    start_date?: string;
    end_date?: string;
    monthly_rent?: number;
    operating_cost_advance?: number;
    heating_cost_advance?: number;
    deposit?: number;
    notes?: string | null;
  };

  if (!body.tenant_id) return c.json({ error: "tenant_id is required" }, 400);

  const tenant = await get<{ id: number }>("SELECT id FROM tenants WHERE id = ?", [body.tenant_id]);
  if (!tenant) return c.json({ error: "Tenant not found" }, 404);

  const today = new Date().toISOString().slice(0, 10);
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  const nextYear = oneYearFromNow.toISOString().slice(0, 10);

  const startDate = body.start_date || today;
  const endDate = body.end_date || nextYear;
  const rent = body.monthly_rent ?? unit.market_rent ?? 0;
  const opAdvance = body.operating_cost_advance ?? unit.monthly_operating_cost ?? 0;
  const heatAdvance = body.heating_cost_advance ?? 0;
  const deposit = body.deposit ?? 0;

  // End any previously active leases for this unit
  await run("UPDATE leases SET status = 'ended' WHERE unit_id = ? AND status = 'active'", [id]);

  // Insert new active lease
  const res = await run(
    `INSERT INTO leases (unit_id, primary_tenant_id, start_date, end_date, monthly_rent, operating_cost_advance, heating_cost_advance, deposit, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [id, body.tenant_id, startDate, endDate, rent, opAdvance, heatAdvance, deposit, body.notes ?? null],
  );

  // Mark unit as occupied
  await run("UPDATE units SET status = 'occupied' WHERE id = ?", [id]);

  const updatedUnit = await get(`${UNIT_SELECT} WHERE u.id = ?`, [id]);
  const createdLease = await get(`${LEASE_SELECT} WHERE l.id = ?`, [res.lastInsertRowid]);

  return c.json({ unit: updatedUnit, lease: createdLease }, 201);
});

app.post("/api/units/:id/unassign-tenant", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid unit ID" }, 400);

  // End all active leases for this unit
  await run("UPDATE leases SET status = 'ended' WHERE unit_id = ? AND status = 'active'", [id]);
  // Mark unit as vacant
  await run("UPDATE units SET status = 'vacant' WHERE id = ?", [id]);

  const updatedUnit = await get(`${UNIT_SELECT} WHERE u.id = ?`, [id]);
  return c.json({ unit: updatedUnit });
});

// ── Tenants ────────────────────────────────────────────────────────

const TenantInput = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  emergency_contact: z.string().optional().nullable(),
  employer: z.string().optional().nullable(),
  monthly_income: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

app.get("/api/tenants", async (c) => {
  const search = c.req.query("q")?.trim();
  if (search) {
    const like = `%${search}%`;
    const rows = await query(
      `SELECT t.*,
         (SELECT u.id FROM leases l LEFT JOIN units u ON u.id = l.unit_id
            WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_id,
         (SELECT u.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id
            WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_name,
         (SELECT p.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id LEFT JOIN properties p ON p.id = u.property_id
            WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_property_name
       FROM tenants t
       WHERE t.last_name LIKE ? OR t.first_name LIKE ? OR t.email LIKE ? OR t.phone LIKE ?
       ORDER BY t.last_name, t.first_name LIMIT 200`,
      [like, like, like, like],
    );
    return c.json({ tenants: rows });
  }
  const rows = await query(
    `SELECT t.*,
       (SELECT u.id FROM leases l LEFT JOIN units u ON u.id = l.unit_id
          WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_id,
       (SELECT u.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id
          WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_name,
       (SELECT p.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id LEFT JOIN properties p ON p.id = u.property_id
          WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_property_name
     FROM tenants t ORDER BY t.last_name, t.first_name LIMIT 500`,
  );
  return c.json({ tenants: rows });
});

app.get("/api/tenants/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const row = await get("SELECT * FROM tenants WHERE id = ?", [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ tenant: row });
});

app.post("/api/tenants", async (c) => {
  const parsed = await parseJson(c, TenantInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO tenants (first_name, last_name, email, phone, date_of_birth, emergency_contact, employer, monthly_income, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.first_name, d.last_name, d.email ?? null, d.phone ?? null, d.date_of_birth ?? null, d.emergency_contact ?? null, d.employer ?? null, d.monthly_income ?? null, d.notes ?? null],
  );
  const row = await get("SELECT * FROM tenants WHERE id = ?", [result.lastInsertRowid]);
  return c.json({ tenant: row }, 201);
});

app.put("/api/tenants/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, TenantInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const r = await run(`UPDATE tenants SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get("SELECT * FROM tenants WHERE id = ?", [id]);
  return c.json({ tenant: row });
});

app.delete("/api/tenants/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM tenants WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Leases ─────────────────────────────────────────────────────────

const LeaseInput = z.object({
  unit_id: z.number().int(),
  primary_tenant_id: z.number().int().nullable().optional(),
  start_date: z.string(),
  end_date: z.string(),
  monthly_rent: z.number().min(0).optional(),
  operating_cost_advance: z.number().min(0).optional(),
  heating_cost_advance: z.number().min(0).optional(),
  deposit: z.number().min(0).optional(),
  rent_due_day: z.number().int().min(1).max(31).optional(),
  late_fee: z.number().min(0).optional(),
  status: z.enum(["upcoming", "active", "ended", "cancelled"]).optional(),
  notes: z.string().optional().nullable(),
});

const LEASE_SELECT = `
  SELECT l.*,
    u.name as unit_name,
    p.id as property_id, p.name as property_name, p.color as property_color,
    t.first_name as tenant_first_name, t.last_name as tenant_last_name,
    t.email as tenant_email, t.phone as tenant_phone
  FROM leases l
  LEFT JOIN units u ON u.id = l.unit_id
  LEFT JOIN properties p ON p.id = u.property_id
  LEFT JOIN tenants t ON t.id = l.primary_tenant_id
`;

app.get("/api/leases", async (c) => {
  const status = c.req.query("status");
  const tenantId = intParam(c.req.query("tenant_id"));
  const unitId = intParam(c.req.query("unit_id"));
  const where: string[] = [];
  const params: unknown[] = [];
  if (status) { where.push("l.status = ?"); params.push(status); }
  if (tenantId) { where.push("l.primary_tenant_id = ?"); params.push(tenantId); }
  if (unitId) { where.push("l.unit_id = ?"); params.push(unitId); }
  const sql = `${LEASE_SELECT}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY l.start_date DESC`;
  const rows = await query(sql, params);
  return c.json({ leases: rows });
});

app.get("/api/leases/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const row = await get(`${LEASE_SELECT} WHERE l.id = ?`, [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ lease: row });
});

app.post("/api/leases", async (c) => {
  const parsed = await parseJson(c, LeaseInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO leases (unit_id, primary_tenant_id, start_date, end_date, monthly_rent, operating_cost_advance, heating_cost_advance, deposit, rent_due_day, late_fee, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.unit_id, d.primary_tenant_id ?? null, d.start_date, d.end_date, d.monthly_rent ?? 0, d.operating_cost_advance ?? 0, d.heating_cost_advance ?? 0, d.deposit ?? 0, d.rent_due_day ?? 1, d.late_fee ?? 0, d.status ?? "active", d.notes ?? null],
  );
  // Mark the unit as occupied if the new lease is active.
  if ((d.status ?? "active") === "active") {
    await run("UPDATE units SET status = 'occupied' WHERE id = ?", [d.unit_id]);
  }
  const row = await get(`${LEASE_SELECT} WHERE l.id = ?`, [result.lastInsertRowid]);
  return c.json({ lease: row }, 201);
});

app.put("/api/leases/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, LeaseInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const r = await run(`UPDATE leases SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);

  // Sync unit occupancy status
  const currentLease = await get<{ unit_id: number; status: string }>("SELECT unit_id, status FROM leases WHERE id = ?", [id]);
  if (currentLease) {
    if (currentLease.status === "active") {
      await run("UPDATE units SET status = 'occupied' WHERE id = ?", [currentLease.unit_id]);
    } else {
      const activeCount = await get<{ n: number }>("SELECT COUNT(*) AS n FROM leases WHERE unit_id = ? AND status = 'active'", [currentLease.unit_id]);
      if ((activeCount?.n ?? 0) === 0) {
        await run("UPDATE units SET status = 'vacant' WHERE id = ?", [currentLease.unit_id]);
      }
    }
  }

  const row = await get(`${LEASE_SELECT} WHERE l.id = ?`, [id]);
  return c.json({ lease: row });
});

app.delete("/api/leases/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const lease = await get<{ unit_id: number }>("SELECT unit_id FROM leases WHERE id = ?", [id]);
  const r = await run("DELETE FROM leases WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);

  if (lease) {
    const activeCount = await get<{ n: number }>("SELECT COUNT(*) AS n FROM leases WHERE unit_id = ? AND status = 'active'", [lease.unit_id]);
    if ((activeCount?.n ?? 0) === 0) {
      await run("UPDATE units SET status = 'vacant' WHERE id = ?", [lease.unit_id]);
    }
  }

  return c.json({ ok: true });
});

// ── Rent charges & payments ────────────────────────────────────────

const ChargeInput = z.object({
  lease_id: z.number().int(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  due_date: z.string(),
  amount: z.number().min(0).optional(),
  notes: z.string().optional().nullable(),
});

const CHARGE_SELECT = `
  SELECT c.*,
    l.unit_id, l.monthly_rent as lease_rent, l.rent_due_day,
    u.name as unit_name,
    p.id as property_id, p.name as property_name, p.color as property_color,
    t.id as tenant_id, t.first_name as tenant_first_name, t.last_name as tenant_last_name
  FROM rent_charges c
  LEFT JOIN leases l ON l.id = c.lease_id
  LEFT JOIN units u ON u.id = l.unit_id
  LEFT JOIN properties p ON p.id = u.property_id
  LEFT JOIN tenants t ON t.id = l.primary_tenant_id
`;

app.get("/api/rent-charges", async (c) => {
  const period = c.req.query("period");
  const status = c.req.query("status");
  const where: string[] = [];
  const params: unknown[] = [];
  if (period) { where.push("c.period = ?"); params.push(period); }
  if (status) { where.push("c.status = ?"); params.push(status); }
  const sql = `${CHARGE_SELECT}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY c.due_date, p.name, u.name`;
  const rows = await query(sql, params).catch(() => []);
  return c.json({ charges: rows });
});

app.post("/api/rent-charges", async (c) => {
  const parsed = await parseJson(c, ChargeInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO rent_charges (lease_id, period, due_date, amount, notes) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(lease_id, period) DO NOTHING`,
    [d.lease_id, d.period, d.due_date, d.amount ?? 0, d.notes ?? null],
  );
  if (!result.changes) {
    const existing = await get(`${CHARGE_SELECT} WHERE c.lease_id = ? AND c.period = ?`, [d.lease_id, d.period]);
    return c.json({ charge: existing });
  }
  const row = await get(`${CHARGE_SELECT} WHERE c.id = ?`, [result.lastInsertRowid]);
  return c.json({ charge: row }, 201);
});

// Generate (idempotent) charges for a given period across all active leases.
app.post("/api/rent-charges/generate", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { period?: string };
  const period = body.period;
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return c.json({ error: "period (YYYY-MM) required" }, 400);
  const leases = await query<{ id: number; monthly_rent: number; operating_cost_advance: number; heating_cost_advance: number; rent_due_day: number; start_date: string; end_date: string }>(
    "SELECT id, monthly_rent, operating_cost_advance, heating_cost_advance, rent_due_day, start_date, end_date FROM leases WHERE status = 'active'",
  );
  let created = 0;
  for (const l of leases) {
    // Skip if the lease doesn't cover this period at all.
    const periodStart = `${period}-01`;
    if (l.end_date < periodStart) continue;
    const day = String(Math.min(28, Math.max(1, l.rent_due_day))).padStart(2, "0");
    const dueDate = `${period}-${day}`;
    const totalCharge = (l.monthly_rent || 0) + (l.operating_cost_advance || 0) + (l.heating_cost_advance || 0);
    const r = await run(
      `INSERT INTO rent_charges (lease_id, period, due_date, amount) VALUES (?, ?, ?, ?)
         ON CONFLICT(lease_id, period) DO NOTHING`,
      [l.id, period, dueDate, totalCharge],
    );
    if (r.changes) created++;
  }
  // Re-mark anything past due as 'overdue'.
  await run(
    `UPDATE rent_charges SET status = 'overdue'
     WHERE status IN ('open', 'partial') AND amount_paid < amount AND due_date < date('now')`,
  );
  return c.json({ created, period });
});

app.put("/api/rent-charges/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const Patch = z.object({
    amount: z.number().min(0).optional(),
    due_date: z.string().optional(),
    status: z.enum(["open", "partial", "paid", "overdue", "waived"]).optional(),
    notes: z.string().optional().nullable(),
  });
  const parsed = await parseJson(c, Patch);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const r = await run(`UPDATE rent_charges SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get(`${CHARGE_SELECT} WHERE c.id = ?`, [id]);
  return c.json({ charge: row });
});

app.delete("/api/rent-charges/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM rent_charges WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

const PaymentInput = z.object({
  charge_id: z.number().int(),
  paid_at: z.string().optional(),
  amount: z.number().min(0),
  method: z.enum(["cash", "check", "ach", "credit", "other"]).optional(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

app.get("/api/rent-charges/:id/payments", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const rows = await query("SELECT * FROM payments WHERE charge_id = ? ORDER BY paid_at DESC", [id]);
  return c.json({ payments: rows });
});

app.post("/api/payments", async (c) => {
  const parsed = await parseJson(c, PaymentInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  await run(
    `INSERT INTO payments (charge_id, paid_at, amount, method, reference, notes)
     VALUES (?, COALESCE(?, datetime('now')), ?, ?, ?, ?)`,
    [d.charge_id, d.paid_at ?? null, d.amount, d.method ?? "cash", d.reference ?? null, d.notes ?? null],
  );
  // Recompute the charge's amount_paid + status.
  const charge = await get<{ amount: number }>("SELECT amount FROM rent_charges WHERE id = ?", [d.charge_id]);
  if (!charge) return c.json({ error: "Charge not found" }, 404);
  const sumRow = await get<{ total: number }>("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE charge_id = ?", [d.charge_id]);
  const paid = Number(sumRow?.total ?? 0);
  const status = paid >= charge.amount ? "paid" : paid > 0 ? "partial" : "open";
  await run("UPDATE rent_charges SET amount_paid = ?, status = ? WHERE id = ?", [paid, status, d.charge_id]);
  const updated = await get(`${CHARGE_SELECT} WHERE c.id = ?`, [d.charge_id]);
  return c.json({ charge: updated }, 201);
});

app.delete("/api/payments/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const row = await get<{ charge_id: number }>("SELECT charge_id FROM payments WHERE id = ?", [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  await run("DELETE FROM payments WHERE id = ?", [id]);
  // Recompute the charge.
  const sumRow = await get<{ total: number }>("SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE charge_id = ?", [row.charge_id]);
  const charge = await get<{ amount: number }>("SELECT amount FROM rent_charges WHERE id = ?", [row.charge_id]);
  const paid = Number(sumRow?.total ?? 0);
  const status = !charge ? "open" : paid >= charge.amount ? "paid" : paid > 0 ? "partial" : "open";
  await run("UPDATE rent_charges SET amount_paid = ?, status = ? WHERE id = ?", [paid, status, row.charge_id]);
  return c.json({ ok: true });
});

// ── Vendors ────────────────────────────────────────────────────────

const VendorInput = z.object({
  name: z.string().min(1),
  category: z.enum(["plumber", "electrician", "hvac", "handyman", "cleaning", "landscaping", "general"]).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  color: z.string().optional(),
});

app.get("/api/vendors", async (c) => {
  const rows = await query("SELECT * FROM vendors ORDER BY name");
  return c.json({ vendors: rows });
});

app.post("/api/vendors", async (c) => {
  const parsed = await parseJson(c, VendorInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    "INSERT INTO vendors (name, category, phone, email, notes, color) VALUES (?, ?, ?, ?, ?, ?)",
    [d.name, d.category ?? "general", d.phone ?? null, d.email ?? null, d.notes ?? null, d.color ?? "slate"],
  );
  const row = await get("SELECT * FROM vendors WHERE id = ?", [result.lastInsertRowid]);
  return c.json({ vendor: row }, 201);
});

app.put("/api/vendors/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, VendorInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const r = await run(`UPDATE vendors SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get("SELECT * FROM vendors WHERE id = ?", [id]);
  return c.json({ vendor: row });
});

app.delete("/api/vendors/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM vendors WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Work orders ────────────────────────────────────────────────────

const WorkOrderInput = z.object({
  property_id: z.number().int().nullable().optional(),
  unit_id: z.number().int().nullable().optional(),
  tenant_id: z.number().int().nullable().optional(),
  vendor_id: z.number().int().nullable().optional(),
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  status: z.enum(["open", "assigned", "in_progress", "completed", "cancelled"]).optional(),
  scheduled_at: z.string().optional().nullable(),
  completed_at: z.string().optional().nullable(),
  cost: z.number().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});

const WO_SELECT = `
  SELECT w.*,
    p.name as property_name, p.color as property_color,
    u.name as unit_name,
    t.first_name as tenant_first_name, t.last_name as tenant_last_name,
    v.name as vendor_name, v.category as vendor_category, v.color as vendor_color
  FROM work_orders w
  LEFT JOIN properties p ON p.id = w.property_id
  LEFT JOIN units u ON u.id = w.unit_id
  LEFT JOIN tenants t ON t.id = w.tenant_id
  LEFT JOIN vendors v ON v.id = w.vendor_id
`;

app.get("/api/work-orders", async (c) => {
  const status = c.req.query("status");
  const propertyId = intParam(c.req.query("property_id"));
  const unitId = intParam(c.req.query("unit_id"));
  const where: string[] = [];
  const params: unknown[] = [];
  if (status) { where.push("w.status = ?"); params.push(status); }
  if (propertyId) { where.push("w.property_id = ?"); params.push(propertyId); }
  if (unitId) { where.push("w.unit_id = ?"); params.push(unitId); }
  const sql = `${WO_SELECT}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY
    CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
    w.created_at DESC`;
  const rows = await query(sql, params).catch(() => []);
  return c.json({ work_orders: rows });
});

app.post("/api/work-orders", async (c) => {
  const parsed = await parseJson(c, WorkOrderInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO work_orders (property_id, unit_id, tenant_id, vendor_id, title, description, priority, status, scheduled_at, completed_at, cost, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.property_id ?? null, d.unit_id ?? null, d.tenant_id ?? null, d.vendor_id ?? null,
      d.title, d.description ?? null,
      d.priority ?? "normal", d.status ?? "open",
      d.scheduled_at ?? null, d.completed_at ?? null,
      d.cost ?? null, d.notes ?? null,
    ],
  );
  const row = await get(`${WO_SELECT} WHERE w.id = ?`, [result.lastInsertRowid]);
  return c.json({ work_order: row }, 201);
});

app.put("/api/work-orders/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, WorkOrderInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const r = await run(`UPDATE work_orders SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get(`${WO_SELECT} WHERE w.id = ?`, [id]);
  return c.json({ work_order: row });
});

app.delete("/api/work-orders/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM work_orders WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Applications ───────────────────────────────────────────────────

const ApplicationInput = z.object({
  unit_id: z.number().int().nullable().optional(),
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  monthly_income: z.number().optional().nullable(),
  employer: z.string().optional().nullable(),
  desired_move_in: z.string().optional().nullable(),
  status: z.enum(["new", "screening", "approved", "declined", "withdrawn"]).optional(),
  notes: z.string().optional().nullable(),
});

app.get("/api/applications", async (c) => {
  const rows = await query(
    `SELECT a.*, u.name as unit_name, p.name as property_name
     FROM applications a
     LEFT JOIN units u ON u.id = a.unit_id
     LEFT JOIN properties p ON p.id = u.property_id
     ORDER BY a.created_at DESC`,
  ).catch(() => []);
  return c.json({ applications: rows });
});

app.post("/api/applications", async (c) => {
  const parsed = await parseJson(c, ApplicationInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO applications (unit_id, first_name, last_name, email, phone, monthly_income, employer, desired_move_in, status, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.unit_id ?? null, d.first_name, d.last_name,
      d.email ?? null, d.phone ?? null, d.monthly_income ?? null, d.employer ?? null,
      d.desired_move_in ?? null, d.status ?? "new", d.notes ?? null,
    ],
  );
  const row = await get(
    `SELECT a.*, u.name as unit_name, p.name as property_name
     FROM applications a LEFT JOIN units u ON u.id = a.unit_id LEFT JOIN properties p ON p.id = u.property_id
     WHERE a.id = ?`,
    [result.lastInsertRowid],
  );
  return c.json({ application: row }, 201);
});

app.put("/api/applications/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, ApplicationInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const r = await run(`UPDATE applications SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  const row = await get(
    `SELECT a.*, u.name as unit_name, p.name as property_name
     FROM applications a LEFT JOIN units u ON u.id = a.unit_id LEFT JOIN properties p ON p.id = u.property_id
     WHERE a.id = ?`,
    [id],
  );
  return c.json({ application: row });
});

app.delete("/api/applications/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM applications WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Dashboard summary ──────────────────────────────────────────────

app.get("/api/dashboard/summary", async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const periodNow = today.slice(0, 7);

  const safeGet = <T,>(sql: string, params: unknown[] = [], fallback: T) =>
    get<T>(sql, params).catch(() => fallback as T | undefined).then((v) => v ?? fallback);
  const safeQuery = <T,>(sql: string, params: unknown[] = []): Promise<T[]> =>
    query<T>(sql, params).catch(() => [] as T[]);

  const [
    propertyCount,
    unitCount,
    occupiedCount,
    vacantCount,
    activeLeases,
    upcomingMoveOuts,
    monthOutstanding,
    monthCollected,
    overdueRow,
    openWorkOrders,
    urgentWorkOrders,
    recentWorkOrders,
    upcomingExpirations,
    airbnbUnitsRow,
    airbnbActiveGuestsRow,
    airbnbMonthRevenueRow,
    airbnbUpcomingCheckinsRow,
  ] = await Promise.all([
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM properties", [], { n: 0 }),
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM units", [], { n: 0 }),
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM units WHERE status = 'occupied'", [], { n: 0 }),
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM units WHERE status = 'vacant'", [], { n: 0 }),
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM leases WHERE status = 'active'", [], { n: 0 }),
    safeGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM leases WHERE status = 'active' AND end_date <= date('now', '+30 days')",
      [], { n: 0 },
    ),
    safeGet<{ total: number }>(
      "SELECT COALESCE(SUM(amount - amount_paid), 0) as total FROM rent_charges WHERE period = ? AND status != 'waived'",
      [periodNow], { total: 0 },
    ),
    safeGet<{ total: number }>(
      "SELECT COALESCE(SUM(amount_paid), 0) as total FROM rent_charges WHERE period = ?",
      [periodNow], { total: 0 },
    ),
    safeGet<{ total: number; n: number }>(
      "SELECT COALESCE(SUM(amount - amount_paid), 0) as total, COUNT(*) as n FROM rent_charges WHERE due_date < date('now') AND amount_paid < amount AND status != 'waived'",
      [], { total: 0, n: 0 },
    ),
    safeGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM work_orders WHERE status NOT IN ('completed', 'cancelled')",
      [], { n: 0 },
    ),
    safeGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM work_orders WHERE priority = 'urgent' AND status NOT IN ('completed', 'cancelled')",
      [], { n: 0 },
    ),
    safeQuery<{ id: number; title: string; priority: string; status: string; property_name: string | null; unit_name: string | null; created_at: string }>(
      `SELECT w.id, w.title, w.priority, w.status, p.name as property_name, u.name as unit_name, w.created_at
       FROM work_orders w
       LEFT JOIN properties p ON p.id = w.property_id
       LEFT JOIN units u ON u.id = w.unit_id
       WHERE w.status NOT IN ('completed', 'cancelled')
       ORDER BY CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, w.created_at DESC
       LIMIT 6`,
    ),
    safeQuery<{ id: number; end_date: string; tenant_first_name: string | null; tenant_last_name: string | null; unit_name: string | null; property_name: string | null }>(
      `SELECT l.id, l.end_date,
         t.first_name as tenant_first_name, t.last_name as tenant_last_name,
         u.name as unit_name, p.name as property_name
       FROM leases l
       LEFT JOIN tenants t ON t.id = l.primary_tenant_id
       LEFT JOIN units u ON u.id = l.unit_id
       LEFT JOIN properties p ON p.id = u.property_id
       WHERE l.status = 'active' AND l.end_date <= date('now', '+60 days')
       ORDER BY l.end_date ASC LIMIT 6`,
    ),
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM units WHERE type = 'airbnb'", [], { n: 0 }),
    safeGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM airbnb_bookings WHERE booking_status = 'checked_in' OR (booking_status = 'confirmed' AND check_in_date <= date('now') AND check_out_date >= date('now'))",
      [], { n: 0 },
    ),
    safeGet<{ total: number }>(
      "SELECT COALESCE(SUM(net_payout), 0) as total FROM airbnb_bookings WHERE (payout_date LIKE ? OR check_in_date LIKE ?) AND booking_status != 'cancelled'",
      [periodNow + "%", periodNow + "%"], { total: 0 },
    ),
    safeGet<{ n: number }>(
      "SELECT COUNT(*) as n FROM airbnb_bookings WHERE check_in_date >= date('now') AND check_in_date <= date('now', '+7 days') AND booking_status != 'cancelled'",
      [], { n: 0 },
    ),
  ]);

  return c.json({
    period: periodNow,
    properties: propertyCount.n,
    units: unitCount.n,
    occupied: occupiedCount.n,
    vacant: vacantCount.n,
    occupancy_rate: unitCount.n ? Math.round((occupiedCount.n / unitCount.n) * 100) : 0,
    active_leases: activeLeases.n,
    upcoming_move_outs: upcomingMoveOuts.n,
    month_outstanding: monthOutstanding.total,
    month_collected: monthCollected.total,
    overdue_total: overdueRow.total,
    overdue_count: overdueRow.n,
    open_work_orders: openWorkOrders.n,
    urgent_work_orders: urgentWorkOrders.n,
    recent_work_orders: recentWorkOrders,
    upcoming_expirations: upcomingExpirations,
    airbnb_units: airbnbUnitsRow.n,
    airbnb_active_guests: airbnbActiveGuestsRow.n,
    airbnb_month_revenue: airbnbMonthRevenueRow.total,
    airbnb_upcoming_checkins: airbnbUpcomingCheckinsRow.n,
  });
});

// ── Settings (key/value) ───────────────────────────────────────────

app.get("/api/settings", async (c) => {
  const rows = await query<{ key: string; value: string }>("SELECT key, value FROM settings").catch(() => []);
  // Defaults first, so a caller always gets a currency and a due day even if
  // the seed has not run yet (a brand-new database, or a deleted row).
  const out: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return c.json({ settings: out });
});

app.put("/api/settings", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  if (!body || typeof body !== "object") return c.json({ error: "Body must be an object" }, 400);
  const entries = Object.entries(body as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null);
  for (const [key, value] of entries) {
    await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [key, String(value)],
    );
  }
  const rows = await query<{ key: string; value: string }>("SELECT key, value FROM settings");
  const out: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return c.json({ settings: out });
});

// ── Keycloak Authentication ─────────────────────────────────────────

app.get("/api/auth/config", async (c) => {
  const config = await getKeycloakConfig(c);
  return c.json(config);
});

app.get("/api/auth/me", (c) => {
  const user = c.get("user");
  const config = c.get("keycloakConfig");
  return c.json({
    authenticated: !!user,
    user: user || null,
    keycloakEnabled: config?.enabled ?? false,
  });
});

app.post("/api/auth/test-connection", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    body = {};
  }
  const data = body && typeof body === "object" ? (body as Record<string, string>) : {};
  const currentConfig = await getKeycloakConfig(c);
  const rawUrl = data.url || currentConfig.url;
  const url = rawUrl.replace(/\/+$/, "");
  const realm = data.realm || currentConfig.realm;

  const oidcUrl = `${url}/realms/${realm}/.well-known/openid-configuration`;
  try {
    const res = await fetch(oidcUrl, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return c.json(
        {
          ok: false,
          error: `Keycloak returned status ${res.status} (${res.statusText})`,
          oidcUrl,
        },
        400,
      );
    }
    const oidcData = (await res.json()) as Record<string, unknown>;
    return c.json({
      ok: true,
      issuer: oidcData.issuer,
      authorization_endpoint: oidcData.authorization_endpoint,
      token_endpoint: oidcData.token_endpoint,
      jwks_uri: oidcData.jwks_uri,
      oidcUrl,
    });
  } catch (err) {
    return c.json(
      {
        ok: false,
        error: `Failed to connect to Keycloak: ${(err as Error).message}`,
        oidcUrl,
      },
      500,
    );
  }
});

// ── Operating Costs ────────────────────────────────────────────────
const OperatingCostInput = z.object({
  property_id: z.number().int(),
  year: z.number().int(),
  cost_type: z.string().min(1),
  amount: z.number().min(0),
  is_commercial_only: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

app.get("/api/operating-costs", async (c) => {
  const propertyId = intParam(c.req.query("property_id"));
  const year = intParam(c.req.query("year"));
  const where: string[] = [];
  const params: unknown[] = [];
  if (propertyId) { where.push("property_id = ?"); params.push(propertyId); }
  if (year) { where.push("year = ?"); params.push(year); }
  const sql = `SELECT * FROM operating_costs ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY year DESC, cost_type ASC`;
  const rows = await query(sql, params).catch(() => []);
  return c.json({ operating_costs: rows });
});

app.post("/api/operating-costs", async (c) => {
  const parsed = await parseJson(c, OperatingCostInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO operating_costs (property_id, year, cost_type, amount, is_commercial_only, notes) VALUES (?, ?, ?, ?, ?, ?)`,
    [d.property_id, d.year, d.cost_type, d.amount, d.is_commercial_only ? 1 : 0, d.notes ?? null],
  );
  const row = await get(`SELECT * FROM operating_costs WHERE id = ?`, [result.lastInsertRowid]);
  return c.json({ operating_cost: row }, 201);
});

app.delete("/api/operating-costs/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM operating_costs WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// Batch create operating costs
app.post("/api/operating-costs/batch", async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    property_id: number;
    year: number;
    costs: Array<{ cost_type: string; amount: number; is_commercial_only?: boolean; notes?: string | null }>;
  };
  if (!body.property_id || !body.year || !Array.isArray(body.costs)) {
    return c.json({ error: "Invalid payload" }, 400);
  }
  let added = 0;
  for (const item of body.costs) {
    if (!item.cost_type || typeof item.amount !== "number" || item.amount <= 0) continue;
    await run(
      `INSERT INTO operating_costs (property_id, year, cost_type, amount, is_commercial_only, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [body.property_id, body.year, item.cost_type, item.amount, item.is_commercial_only ? 1 : 0, item.notes ?? null],
    );
    added++;
  }
  return c.json({ added });
});

// Detailed property operating costs summary & per-unit space calculation
app.get("/api/properties/:id/operating-costs-summary", async (c) => {
  const propertyId = intParam(c.req.param("id"));
  const year = intParam(c.req.query("year")) || new Date().getFullYear();
  if (!propertyId) return c.json({ error: "Invalid property ID" }, 400);

  const property = await get<{ id: number; name: string; type: string }>(
    "SELECT id, name, type FROM properties WHERE id = ?",
    [propertyId],
  );
  if (!property) return c.json({ error: "Property not found" }, 404);

  // 1. Costs for this property and year
  const costs = await query<{ id: number; property_id: number; year: number; cost_type: string; amount: number; is_commercial_only: number; notes: string | null; created_at: string }>(
    "SELECT * FROM operating_costs WHERE property_id = ? AND year = ? ORDER BY cost_type ASC",
    [propertyId, year],
  );

  let totalPropertyCosts = 0;
  let sharedCosts = 0;
  let commercialOnlyCosts = 0;
  for (const cost of costs) {
    totalPropertyCosts += cost.amount;
    if (cost.is_commercial_only) {
      commercialOnlyCosts += cost.amount;
    } else {
      sharedCosts += cost.amount;
    }
  }

  // 2. Units in property
  const units = await query<{ id: number; name: string; type: string; sqft: number | null; status: string; monthly_operating_cost: number }>(
    "SELECT id, name, type, sqft, status, monthly_operating_cost FROM units WHERE property_id = ? ORDER BY name ASC",
    [propertyId],
  );

  let totalSqft = 0;
  let totalResidentialSqft = 0;
  let totalCommercialSqft = 0;
  let commercialUnitsCount = 0;
  for (const u of units) {
    const s = u.sqft || 0;
    totalSqft += s;
    if (u.type === "commercial") {
      totalCommercialSqft += s;
      commercialUnitsCount++;
    } else {
      totalResidentialSqft += s;
    }
  }

  const costPerSqft = totalSqft > 0 ? (totalPropertyCosts / totalSqft) : 0;
  const sharedCostPerSqft = totalSqft > 0 ? (sharedCosts / totalSqft) : 0;

  // 3. Active leases covering this year
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const leases = await query<{
    id: number;
    unit_id: number;
    operating_cost_advance: number;
    heating_cost_advance: number;
    start_date: string;
    end_date: string;
    first_name: string | null;
    last_name: string | null;
  }>(
    `SELECT l.id, l.unit_id, l.operating_cost_advance, l.heating_cost_advance, l.start_date, l.end_date,
            t.first_name, t.last_name
     FROM leases l
     JOIN units u ON u.id = l.unit_id
     LEFT JOIN tenants t ON t.id = l.primary_tenant_id
     WHERE u.property_id = ? AND (l.start_date <= ? AND l.end_date >= ?) AND l.status != 'cancelled'
     ORDER BY l.id DESC`,
    [propertyId, yearEnd, yearStart],
  );

  // 4. Existing statements
  const statements = await query<{ id: number; lease_id: number; year: number; total_actual_costs: number; total_advance_paid: number; balance: number }>(
    `SELECT s.* FROM nebenkosten_statements s
     JOIN leases l ON l.id = s.lease_id
     JOIN units u ON u.id = l.unit_id
     WHERE u.property_id = ? AND s.year = ?`,
    [propertyId, year],
  );

  // 5. Per-unit breakdown calculation based on space
  const unitsBreakdown = units.map((u) => {
    const s = u.sqft || 0;
    const isCommercial = u.type === "commercial";
    const sqftSharePct = totalSqft > 0 ? (s / totalSqft) * 100 : 0;

    const costItems = costs.map((cost) => {
      let unitShare = 0;
      let key = "";
      if (cost.is_commercial_only) {
        if (isCommercial) {
          if (totalCommercialSqft > 0) {
            unitShare = cost.amount * (s / totalCommercialSqft);
            key = `${s} m² / ${totalCommercialSqft} m² (Gewerbe)`;
          } else {
            unitShare = commercialUnitsCount > 0 ? cost.amount / commercialUnitsCount : 0;
            key = "Equal split (Gewerbe)";
          }
        } else {
          unitShare = 0;
          key = "Vorwegabzug (nur Gewerbe)";
        }
      } else {
        if (totalSqft > 0) {
          unitShare = cost.amount * (s / totalSqft);
          key = `${s} m² / ${totalSqft} m² (Gesamt)`;
        } else {
          unitShare = units.length > 0 ? cost.amount / units.length : 0;
          key = "Equal split";
        }
      }
      return {
        cost_id: cost.id,
        cost_type: cost.cost_type,
        total_property_amount: cost.amount,
        is_commercial_only: !!cost.is_commercial_only,
        allocation_key: key,
        unit_share_amount: Math.round(unitShare * 100) / 100,
      };
    });

    const allocatedCost = Math.round(costItems.reduce((acc, ci) => acc + ci.unit_share_amount, 0) * 100) / 100;

    const lease = leases.find((l) => l.unit_id === u.id);
    const statement = lease ? statements.find((st) => st.lease_id === lease.id) : null;

    const leaseAdvance = lease ? (lease.operating_cost_advance || 0) + (lease.heating_cost_advance || 0) : 0;
    const monthlyAdvance = leaseAdvance > 0 ? leaseAdvance : (lease ? (u.monthly_operating_cost || 0) : 0);
    const annualAdvance = Math.round(monthlyAdvance * 12 * 100) / 100;
    const balance = lease ? Math.round((allocatedCost - annualAdvance) * 100) / 100 : allocatedCost;

    return {
      unit_id: u.id,
      unit_name: u.name,
      unit_type: u.type as "residential" | "commercial" | "airbnb",
      sqft: s,
      sqft_share_pct: Math.round(sqftSharePct * 10) / 10,
      allocated_cost: allocatedCost,
      lease_id: lease ? lease.id : null,
      tenant_name: lease ? `${lease.first_name || ""} ${lease.last_name || ""}`.trim() || "Tenant" : null,
      operating_cost_advance: lease?.operating_cost_advance || 0,
      heating_cost_advance: lease?.heating_cost_advance || 0,
      monthly_advance: monthlyAdvance,
      annual_advance: annualAdvance,
      balance,
      is_vacant: !lease,
      cost_items: costItems,
      statement_id: statement?.id ?? null,
    };
  });

  return c.json({
    summary: {
      property_id: property.id,
      property_name: property.name,
      year,
      total_property_costs: Math.round(totalPropertyCosts * 100) / 100,
      shared_costs: Math.round(sharedCosts * 100) / 100,
      commercial_only_costs: Math.round(commercialOnlyCosts * 100) / 100,
      total_sqft: totalSqft,
      total_residential_sqft: totalResidentialSqft,
      total_commercial_sqft: totalCommercialSqft,
      cost_per_sqft: Math.round(costPerSqft * 100) / 100,
      shared_cost_per_sqft: Math.round(sharedCostPerSqft * 100) / 100,
      costs: costs.map((c) => ({ ...c, is_commercial_only: !!c.is_commercial_only })),
      units: unitsBreakdown,
    },
  });
});

// Generate / Save Statement (space-based distribution + commercial Vorwegabzug)
app.post("/api/nebenkosten-statements/generate", async (c) => {
  const body = await c.req.json().catch(() => ({})) as { property_id?: number; year?: number };
  if (!body.property_id || !body.year) return c.json({ error: "property_id and year required" }, 400);
  const { property_id, year } = body;

  // 1. Get all costs
  const costs = await query<{ amount: number; is_commercial_only: number }>(
    "SELECT amount, is_commercial_only FROM operating_costs WHERE property_id = ? AND year = ?",
    [property_id, year],
  );
  let sharedCosts = 0;
  let commercialOnlyCosts = 0;
  for (const cost of costs) {
    if (cost.is_commercial_only) {
      commercialOnlyCosts += cost.amount;
    } else {
      sharedCosts += cost.amount;
    }
  }

  // 2. Get units and their sqft
  const units = await query<{ id: number; type: string; sqft: number | null; monthly_operating_cost: number }>(
    "SELECT id, type, sqft, monthly_operating_cost FROM units WHERE property_id = ?",
    [property_id],
  );
  let totalSqft = 0;
  let totalCommercialSqft = 0;
  let commUnitsCount = 0;
  for (const u of units) {
    const s = u.sqft || 0;
    totalSqft += s;
    if (u.type === "commercial") {
      totalCommercialSqft += s;
      commUnitsCount++;
    }
  }

  // 3. Process active leases for this year
  const leases = await query<{ id: number; unit_id: number; operating_cost_advance: number; heating_cost_advance: number }>(
    `SELECT l.id, l.unit_id, l.operating_cost_advance, l.heating_cost_advance 
     FROM leases l JOIN units u ON u.id = l.unit_id 
     WHERE u.property_id = ? AND (l.start_date <= ? AND l.end_date >= ?) AND l.status != 'cancelled'`,
    [property_id, `${year}-12-31`, `${year}-01-01`],
  );

  let generated = 0;
  for (const l of leases) {
    const u = units.find((x) => x.id === l.unit_id);
    const s = u?.sqft || 0;
    if (!u || !s || !totalSqft) continue;
    
    // Exact space-based share
    let allocatedCost = sharedCosts * (s / totalSqft);
    if (u.type === "commercial") {
      if (totalCommercialSqft > 0) {
        allocatedCost += commercialOnlyCosts * (s / totalCommercialSqft);
      } else if (commUnitsCount > 0) {
        allocatedCost += commercialOnlyCosts / commUnitsCount;
      }
    }
    allocatedCost = Math.round(allocatedCost * 100) / 100;
    
    const leaseAdv = (l.operating_cost_advance || 0) + (l.heating_cost_advance || 0);
    const monthlyAdv = leaseAdv > 0 ? leaseAdv : (u?.monthly_operating_cost || 0);
    const annualAdvance = Math.round(monthlyAdv * 12 * 100) / 100;
    const balance = Math.round((allocatedCost - annualAdvance) * 100) / 100;

    // Idempotent: delete existing statement for this lease and year
    await run("DELETE FROM nebenkosten_statements WHERE lease_id = ? AND year = ?", [l.id, year]);

    const r = await run(
      `INSERT INTO nebenkosten_statements (lease_id, year, total_actual_costs, total_advance_paid, balance) 
       VALUES (?, ?, ?, ?, ?)`,
      [l.id, year, allocatedCost, annualAdvance, balance],
    );
    if (r.changes) generated++;
  }
  return c.json({ generated, year });
});

app.get("/api/nebenkosten-statements", async (c) => {
  const leaseId = intParam(c.req.query("lease_id"));
  const rows = await query("SELECT * FROM nebenkosten_statements " + (leaseId ? "WHERE lease_id = ?" : ""), leaseId ? [leaseId] : []);
  return c.json({ statements: rows });
});

// ── Airbnb & Short-Term Rentals ─────────────────────────────────────

const AirbnbBookingInput = z.object({
  unit_id: z.number().int(),
  guest_name: z.string().min(1),
  guest_email: z.string().optional().nullable(),
  guest_phone: z.string().optional().nullable(),
  num_guests: z.number().int().min(1).default(1),
  check_in_date: z.string().min(1),
  check_out_date: z.string().min(1),
  nights: z.number().int().min(1).optional(),
  nightly_rate: z.number().min(0).optional(),
  total_nights_amount: z.number().min(0).optional(),
  cleaning_fee: z.number().min(0).optional(),
  platform_fee: z.number().min(0).optional(),
  tax_amount: z.number().min(0).optional(),
  gross_amount: z.number().min(0).optional(),
  net_payout: z.number().min(0).optional(),
  payout_status: z.enum(["pending", "received", "refunded"]).default("pending"),
  payout_date: z.string().optional().nullable(),
  booking_status: z.enum(["confirmed", "checked_in", "checked_out", "cancelled"]).default("confirmed"),
  platform: z.enum(["airbnb", "vrbo", "booking_com", "direct", "other"]).default("airbnb"),
  confirmation_code: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const AIRBNB_BOOKING_SELECT = `
  SELECT b.*,
    u.name as unit_name,
    u.airbnb_lockbox_code as lockbox_code,
    u.airbnb_wifi_ssid as wifi_ssid,
    u.airbnb_wifi_password as wifi_password,
    u.airbnb_check_in_time as check_in_time,
    u.airbnb_check_out_time as check_out_time,
    u.airbnb_house_rules as house_rules,
    p.id as property_id,
    p.name as property_name,
    p.color as property_color,
    p.address as property_address,
    p.city as property_city
  FROM airbnb_bookings b
  JOIN units u ON u.id = b.unit_id
  JOIN properties p ON p.id = u.property_id
`;

app.get("/api/airbnb/bookings", async (c) => {
  const unitId = intParam(c.req.query("unit_id"));
  const propertyId = intParam(c.req.query("property_id"));
  const status = c.req.query("status");
  const payoutStatus = c.req.query("payout_status");
  const q = c.req.query("q")?.trim().toLowerCase();

  const where: string[] = [];
  const params: unknown[] = [];
  if (unitId) { where.push("b.unit_id = ?"); params.push(unitId); }
  if (propertyId) { where.push("u.property_id = ?"); params.push(propertyId); }
  if (status) { where.push("b.booking_status = ?"); params.push(status); }
  if (payoutStatus) { where.push("b.payout_status = ?"); params.push(payoutStatus); }
  if (q) {
    where.push("(LOWER(b.guest_name) LIKE ? OR LOWER(b.confirmation_code) LIKE ? OR LOWER(COALESCE(b.notes, '')) LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const sql = `${AIRBNB_BOOKING_SELECT}${where.length ? " WHERE " + where.join(" AND ") : ""} ORDER BY b.check_in_date DESC`;
  const rows = await query(sql, params).catch(() => []);
  return c.json({ bookings: rows });
});

app.get("/api/airbnb/bookings/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const row = await get(`${AIRBNB_BOOKING_SELECT} WHERE b.id = ?`, [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ booking: row });
});

app.post("/api/airbnb/bookings", async (c) => {
  const parsed = await parseJson(c, AirbnbBookingInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  // Auto calculate nights
  const start = new Date(d.check_in_date).getTime();
  const end = new Date(d.check_out_date).getTime();
  const diffDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  const nights = d.nights ?? diffDays;

  // Get unit defaults if needed
  const unit = await get<{ airbnb_nightly_rate: number; airbnb_cleaning_fee: number; market_rent: number }>(
    "SELECT airbnb_nightly_rate, airbnb_cleaning_fee, market_rent FROM units WHERE id = ?",
    [d.unit_id],
  );
  const nightlyRate = d.nightly_rate ?? (unit?.airbnb_nightly_rate || unit?.market_rent || 0);
  const cleaningFee = d.cleaning_fee ?? (unit?.airbnb_cleaning_fee || 0);
  const totalNights = d.total_nights_amount ?? (nights * nightlyRate);
  const taxAmount = d.tax_amount ?? 0;
  const grossAmount = d.gross_amount ?? (totalNights + cleaningFee + taxAmount);
  const platformFee = d.platform_fee ?? (d.platform === "airbnb" ? Math.round(totalNights * 0.03 * 100) / 100 : 0);
  const netPayout = d.net_payout ?? Math.round((grossAmount - platformFee - taxAmount) * 100) / 100;
  const confirmationCode = d.confirmation_code || `HM-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const result = await run(
    `INSERT INTO airbnb_bookings (
      unit_id, guest_name, guest_email, guest_phone, num_guests,
      check_in_date, check_out_date, nights, nightly_rate, total_nights_amount,
      cleaning_fee, platform_fee, tax_amount, gross_amount, net_payout,
      payout_status, payout_date, booking_status, platform, confirmation_code, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.unit_id, d.guest_name, d.guest_email ?? null, d.guest_phone ?? null, d.num_guests,
      d.check_in_date, d.check_out_date, nights, nightlyRate, totalNights,
      cleaningFee, platformFee, taxAmount, grossAmount, netPayout,
      d.payout_status, d.payout_date ?? null, d.booking_status, d.platform, confirmationCode, d.notes ?? null,
    ],
  );

  // Sync unit occupancy status if checking in
  if (d.booking_status === "checked_in") {
    await run("UPDATE units SET status = 'occupied' WHERE id = ?", [d.unit_id]);
  } else if (d.booking_status === "checked_out") {
    await run("UPDATE units SET status = 'turnover' WHERE id = ?", [d.unit_id]);
  }

  const row = await get(`${AIRBNB_BOOKING_SELECT} WHERE b.id = ?`, [result.lastInsertRowid]);
  return c.json({ booking: row }, 201);
});

app.put("/api/airbnb/bookings/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const parsed = await parseJson(c, AirbnbBookingInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const existing = await get<{ unit_id: number; booking_status: string }>("SELECT unit_id, booking_status FROM airbnb_bookings WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);

  const { sets, params } = buildUpdate(parsed.data);
  if (!sets.length) return c.json({ error: "No fields" }, 400);
  params.push(id);
  const r = await run(`UPDATE airbnb_bookings SET ${sets.join(", ")} WHERE id = ?`, params);
  if (!r.changes) return c.json({ error: "Not found" }, 404);

  if (parsed.data.booking_status) {
    if (parsed.data.booking_status === "checked_in") {
      await run("UPDATE units SET status = 'occupied' WHERE id = ?", [existing.unit_id]);
    } else if (parsed.data.booking_status === "checked_out") {
      await run("UPDATE units SET status = 'turnover' WHERE id = ?", [existing.unit_id]);
    }
  }

  const row = await get(`${AIRBNB_BOOKING_SELECT} WHERE b.id = ?`, [id]);
  return c.json({ booking: row });
});

app.delete("/api/airbnb/bookings/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const r = await run("DELETE FROM airbnb_bookings WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// One-click action to schedule a turnover cleaning work order for this checkout
app.post("/api/airbnb/bookings/:id/schedule-cleaning", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);

  const booking = await get<{
    id: number; unit_id: number; guest_name: string; check_out_date: string; cleaning_fee: number;
  }>("SELECT id, unit_id, guest_name, check_out_date, cleaning_fee FROM airbnb_bookings WHERE id = ?", [id]);
  if (!booking) return c.json({ error: "Booking not found" }, 404);

  const unit = await get<{
    id: number; property_id: number; name: string; airbnb_cleaning_fee: number; airbnb_lockbox_code: string | null; airbnb_check_out_time: string | null;
  }>("SELECT id, property_id, name, airbnb_cleaning_fee, airbnb_lockbox_code, airbnb_check_out_time FROM units WHERE id = ?", [booking.unit_id]);
  if (!unit) return c.json({ error: "Unit not found" }, 404);

  // Find a cleaning vendor if available
  const vendor = await get<{ id: number }>("SELECT id FROM vendors WHERE category = 'cleaning' LIMIT 1");

  const title = `Turnover Cleaning - ${unit.name} (Guest: ${booking.guest_name})`;
  const cost = booking.cleaning_fee || unit.airbnb_cleaning_fee || 50;
  const description = `Turnover cleaning and linen change following guest check-out on ${booking.check_out_date} at ${unit.airbnb_check_out_time || '11:00'}. Unit must be prepared for incoming guests.`;
  const notes = unit.airbnb_lockbox_code ? `Lockbox Code: ${unit.airbnb_lockbox_code}` : null;

  const result = await run(
    `INSERT INTO work_orders (
      property_id, unit_id, vendor_id, title, description, priority, status, scheduled_at, cost, notes
    ) VALUES (?, ?, ?, ?, ?, 'high', ?, ?, ?, ?)`,
    [
      unit.property_id,
      unit.id,
      vendor?.id ?? null,
      title,
      description,
      vendor ? "assigned" : "open",
      booking.check_out_date,
      cost,
      notes,
    ],
  );

  const wo = await get("SELECT * FROM work_orders WHERE id = ?", [result.lastInsertRowid]);
  return c.json({ ok: true, work_order: wo }, 201);
});

// Comprehensive Airbnb Analytics
app.get("/api/airbnb/analytics", async (c) => {
  const propertyId = intParam(c.req.query("property_id"));

  const whereUnit: string[] = ["u.type = 'airbnb'"];
  const whereBooking: string[] = ["b.booking_status != 'cancelled'"];
  const paramsUnit: unknown[] = [];
  const paramsBooking: unknown[] = [];

  if (propertyId) {
    whereUnit.push("u.property_id = ?");
    paramsUnit.push(propertyId);
    whereBooking.push("u.property_id = ?");
    paramsBooking.push(propertyId);
  }

  const units = await query<{
    id: number; name: string; property_id: number; property_name: string;
    airbnb_nightly_rate: number; airbnb_cleaning_fee: number; status: string;
  }>(
    `SELECT u.id, u.name, u.property_id, p.name as property_name,
            u.airbnb_nightly_rate, u.airbnb_cleaning_fee, u.status
     FROM units u
     JOIN properties p ON p.id = u.property_id
     WHERE ${whereUnit.join(" AND ")}
     ORDER BY p.name, u.name`,
    paramsUnit,
  ).catch(() => []);

  const bookings = await query<{
    id: number; unit_id: number; guest_name: string; check_in_date: string; check_out_date: string;
    nights: number; nightly_rate: number; gross_amount: number; net_payout: number;
    booking_status: string; payout_status: string;
  }>(
    `SELECT b.id, b.unit_id, b.guest_name, b.check_in_date, b.check_out_date,
            b.nights, b.nightly_rate, b.gross_amount, b.net_payout,
            b.booking_status, b.payout_status
     FROM airbnb_bookings b
     JOIN units u ON u.id = b.unit_id
     WHERE ${whereBooking.join(" AND ")}
     ORDER BY b.check_in_date DESC`,
    paramsBooking,
  ).catch(() => []);

  const today = new Date().toISOString().slice(0, 10);
  const next7d = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  let totalRevenue = 0;
  let totalNights = 0;
  let activeStays = 0;
  let upcomingIn7d = 0;
  let upcomingOut7d = 0;

  for (const b of bookings) {
    totalRevenue += b.net_payout || 0;
    totalNights += b.nights || 0;
    if (b.booking_status === "checked_in" || (b.booking_status === "confirmed" && b.check_in_date <= today && b.check_out_date >= today)) {
      activeStays++;
    }
    if (b.check_in_date >= today && b.check_in_date <= next7d) {
      upcomingIn7d++;
    }
    if (b.check_out_date >= today && b.check_out_date <= next7d) {
      upcomingOut7d++;
    }
  }

  const adr = totalNights > 0 ? Math.round((totalRevenue / totalNights) * 100) / 100 : (units.length > 0 ? units[0].airbnb_nightly_rate : 0);

  // Group by month
  const monthMap: Record<string, { month: string; revenue: number; nights: number }> = {};
  for (const b of bookings) {
    const m = b.check_in_date.slice(0, 7);
    if (!monthMap[m]) monthMap[m] = { month: m, revenue: 0, nights: 0 };
    monthMap[m].revenue += b.net_payout || 0;
    monthMap[m].nights += b.nights || 0;
  }
  const revenueByMonth = Object.values(monthMap).sort((a, b) => a.month.localeCompare(b.month)).slice(-6);

  // Per-unit breakdown
  const unitsSummary = units.map((u) => {
    const uBookings = bookings.filter((b) => b.unit_id === u.id);
    const uRev = uBookings.reduce((sum, b) => sum + (b.net_payout || 0), 0);
    const uNights = uBookings.reduce((sum, b) => sum + (b.nights || 0), 0);
    const active = uBookings.find(
      (b) => b.booking_status === "checked_in" || (b.booking_status === "confirmed" && b.check_in_date <= today && b.check_out_date >= today),
    );
    // Rough 30-day occupancy estimate
    const occPct = Math.min(100, Math.round((uNights / 30) * 100));
    return {
      unit_id: u.id,
      unit_name: u.name,
      property_id: u.property_id,
      property_name: u.property_name,
      bookings_count: uBookings.length,
      revenue: Math.round(uRev * 100) / 100,
      occupancy_rate: occPct,
      current_guest: active ? active.guest_name : null,
    };
  });

  const totalPossibleDays = (units.length || 1) * 30;
  const overallOccupancy = Math.min(100, Math.round((totalNights / totalPossibleDays) * 100));

  return c.json({
    total_revenue: Math.round(totalRevenue * 100) / 100,
    total_bookings: bookings.length,
    active_stays: activeStays,
    upcoming_check_ins_7d: upcomingIn7d,
    upcoming_check_outs_7d: upcomingOut7d,
    average_daily_rate: adr,
    occupancy_rate: overallOccupancy,
    revenue_by_month: revenueByMonth,
    units_summary: unitsSummary,
  });
});

// ── Health ─────────────────────────────────────────────────────────

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
