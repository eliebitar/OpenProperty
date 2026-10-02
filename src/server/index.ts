import { Hono, type Context } from "hono";
import { z } from "zod";
import { initDB, query, get, run } from "./db";
import { authMiddleware, getKeycloakConfig, type ServerEnv } from "./auth";
import {
  getEmailConfig,
  sendEmail,
  renderInviteEmailHtml,
  renderTestEmailHtml,
  renderCleaningAssignmentEmailHtml,
  renderCleaningReminderEmailHtml,
  renderCleaningCompletedEmailHtml,
  type EmailConfig,
  type EmailProvider,
  type SendEmailResult,
} from "./email";

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
  email_enabled: "false",
  email_provider: "smtp",
  email_from_address: "noreply@openproperty.local",
  email_from_name: "OpenProperty",
  email_reply_to: "",
  email_smtp_host: "smtp.gmail.com",
  email_smtp_port: "465",
  email_smtp_secure: "true",
  email_smtp_user: "",
  email_smtp_pass: "",
  email_api_key: "",
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

    // Organizations and Organization Members DDL & seeding
    await run(`
      CREATE TABLE IF NOT EXISTS organizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        description TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    await run(`
      CREATE TABLE IF NOT EXISTS organization_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id TEXT,
        email TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'manager',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(organization_id, email)
      )
    `);

    await run("CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(organization_id)");
    await run("CREATE INDEX IF NOT EXISTS idx_org_members_email ON organization_members(email)");

    await run(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        to_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        provider TEXT NOT NULL,
        status TEXT NOT NULL,
        error TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await run("CREATE INDEX IF NOT EXISTS idx_email_logs_created ON email_logs(created_at DESC)");

    // Add organization_id to properties table
    try {
      await run("ALTER TABLE properties ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE");
    } catch {
      // Column already exists
    }
    await run("CREATE INDEX IF NOT EXISTS idx_properties_org ON properties(organization_id)");

    // Add organization_id to tenants table
    try {
      await run("ALTER TABLE tenants ADD COLUMN organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE");
    } catch {
      // Column already exists
    }
    await run("CREATE INDEX IF NOT EXISTS idx_tenants_org ON tenants(organization_id)");

    // Cleaning tasks table
    await run(`
      CREATE TABLE IF NOT EXISTS cleaning_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
        booking_id INTEGER REFERENCES airbnb_bookings(id) ON DELETE SET NULL,
        cleaner_id INTEGER REFERENCES organization_members(id) ON DELETE SET NULL,
        scheduled_date TEXT NOT NULL,
        scheduled_time TEXT NOT NULL DEFAULT '11:00',
        next_check_in_date TEXT,
        next_check_in_time TEXT DEFAULT '15:00',
        status TEXT NOT NULL DEFAULT 'scheduled',
        started_at TEXT,
        completed_at TEXT,
        checklist TEXT,
        notes TEXT,
        issue_reported TEXT,
        reminder_sent_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await run("CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_org ON cleaning_tasks(organization_id)");
    await run("CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_unit ON cleaning_tasks(unit_id)");
    await run("CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_cleaner ON cleaning_tasks(cleaner_id)");
    await run("CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_status ON cleaning_tasks(status)");
    await run("CREATE INDEX IF NOT EXISTS idx_cleaning_tasks_date ON cleaning_tasks(scheduled_date)");

    // Add cleaner_id and cleaning_checklist to units table
    try {
      await run("ALTER TABLE units ADD COLUMN cleaner_id INTEGER REFERENCES organization_members(id) ON DELETE SET NULL");
    } catch {
      // Column already exists
    }
    try {
      await run("ALTER TABLE units ADD COLUMN cleaning_checklist TEXT");
    } catch {
      // Column already exists
    }
    try {
      await run("ALTER TABLE cleaning_tasks ADD COLUMN inspection_photos TEXT");
    } catch {
      // Column already exists
    }

    // Ensure default organization exists
    const orgCount = await get<{ n: number }>("SELECT COUNT(*) as n FROM organizations");
    let defaultOrgId = 1;
    if ((orgCount?.n ?? 0) === 0) {
      const res = await run(
        "INSERT INTO organizations (id, name, slug, description) VALUES (1, 'Primary Portfolio', 'primary-portfolio', 'Default real estate portfolio and properties')"
      );
      defaultOrgId = res.lastInsertRowid ? Number(res.lastInsertRowid) : 1;
    } else {
      const firstOrg = await get<{ id: number }>("SELECT id FROM organizations ORDER BY id ASC LIMIT 1");
      if (firstOrg?.id) defaultOrgId = firstOrg.id;
    }

    // Ensure all existing properties (including real property Mauerstraße 15) and tenants are associated with default organization
    await run("UPDATE properties SET organization_id = ? WHERE organization_id IS NULL", [defaultOrgId]);
    await run("UPDATE tenants SET organization_id = ? WHERE organization_id IS NULL", [defaultOrgId]);

    // Seed default team members for the organization if empty
    const memberCount = await get<{ n: number }>("SELECT COUNT(*) as n FROM organization_members WHERE organization_id = ?", [defaultOrgId]);
    if ((memberCount?.n ?? 0) === 0) {
      await run(
        `INSERT OR IGNORE INTO organization_members (organization_id, user_id, email, name, role, status)
         VALUES (?, '206532d2-d8af-4ef0-bdcd-6a9c2d444b57', 'admin@openproperty.local', 'Alex Admin', 'owner', 'active')`,
        [defaultOrgId]
      );
      await run(
        `INSERT OR IGNORE INTO organization_members (organization_id, user_id, email, name, role, status)
         VALUES (?, '388572cb-5970-481c-8aab-c9616e28242c', 'anna.karpinski7@gmail.com', 'Anna Karpinski', 'owner', 'active')`,
        [defaultOrgId]
      );
      await run(
        `INSERT OR IGNORE INTO organization_members (organization_id, user_id, email, name, role, status)
         VALUES (?, NULL, 'elie.bitar7@gmail.com', 'Elie Bitar', 'owner', 'active')`,
        [defaultOrgId]
      );
    }
    await run(
      `INSERT OR IGNORE INTO organization_members (organization_id, user_id, email, name, role, status)
       VALUES (?, '388572cb-5970-481c-8aab-c9616e28242c', 'anna.karpinski7@gmail.com', 'Anna Karpinski', 'owner', 'active')`,
      [defaultOrgId]
    );
    await run(
      `INSERT OR IGNORE INTO organization_members (organization_id, user_id, email, name, role, status)
       VALUES (?, NULL, 'elie.bitar7@gmail.com', 'Elie Bitar', 'owner', 'active')`,
      [defaultOrgId]
    );
    await run(
      `INSERT OR IGNORE INTO organization_members (organization_id, user_id, email, name, role, status)
       VALUES (?, 'cleaner-maria-garcia-id', 'cleaner@openproperty.local', 'Maria Garcia', 'cleaner', 'active')`,
      [defaultOrgId]
    );

    // Clean up any corrupt user_id linkage so user IDs match exact email
    await run(
      "UPDATE organization_members SET user_id = '206532d2-d8af-4ef0-bdcd-6a9c2d444b57' WHERE LOWER(email) = 'admin@openproperty.local'",
    );
    await run(
      "UPDATE organization_members SET user_id = '388572cb-5970-481c-8aab-c9616e28242c' WHERE LOWER(email) = 'anna.karpinski7@gmail.com'",
    );
    await run(
      "UPDATE organization_members SET user_id = NULL WHERE user_id = '4d558420-ae37-4f2a-9d66-7d704ce384dc' AND LOWER(email) != 'elie.bitar@eb-net.org'",
    );

    const cleared = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'sample_data_cleared'");
    if (cleared?.value === "true") {
      return;
    }

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

    // Ensure default cleaning checklist and assigned cleaner on Airbnb units
    const airbnbUnits = await query<{ id: number; property_id: number; cleaner_id: number | null; cleaning_checklist: string | null }>(
      "SELECT id, property_id, cleaner_id, cleaning_checklist FROM units WHERE type = 'airbnb'"
    );
    const mariaMember = await get<{ id: number; organization_id: number }>(
      "SELECT id, organization_id FROM organization_members WHERE email = 'cleaner@openproperty.local' LIMIT 1"
    );
    const defaultChecklistJson = JSON.stringify([
      { id: "1", text: "Strip bed linens and wash at 60°C", done: false },
      { id: "2", text: "Make bed with fresh crisp sheets, pillowcases & duvet", done: false },
      { id: "3", text: "Clean & sanitize bathroom (shower glass, toilet, sink & mirrors)", done: false },
      { id: "4", text: "Restock fresh bath towels, hand towels & toilet paper (min 2 rolls)", done: false },
      { id: "5", text: "Clean kitchen counters, sink & empty refrigerator/microwave", done: false },
      { id: "6", text: "Restock coffee pods, tea bags, sugar & bottled water", done: false },
      { id: "7", text: "Vacuum all rugs and mop hardwood floors throughout", done: false },
      { id: "8", text: "Empty all trash bins and replace with fresh liners", done: false },
      { id: "9", text: "Confirm Wi-Fi card visible, TV remotes working & key in lockbox", done: false }
    ]);

    for (const au of airbnbUnits) {
      if (!au.cleaner_id && mariaMember?.id) {
        await run("UPDATE units SET cleaner_id = ? WHERE id = ?", [mariaMember.id, au.id]);
      }
      if (!au.cleaning_checklist) {
        await run("UPDATE units SET cleaning_checklist = ? WHERE id = ?", [defaultChecklistJson, au.id]);
      }
    }

    if (airbnbUnits.length > 0 && mariaMember?.id) {
      const taskCount = await get<{ n: number }>("SELECT COUNT(*) as n FROM cleaning_tasks WHERE unit_id = ?", [airbnbUnits[0].id]);
      if ((taskCount?.n ?? 0) === 0) {
        const todayStr = new Date().toISOString().slice(0, 10);
        await run(
          `INSERT INTO cleaning_tasks (
            organization_id, unit_id, cleaner_id, scheduled_date, scheduled_time,
            next_check_in_date, next_check_in_time, status, checklist, notes
          ) VALUES (?, ?, ?, ?, '11:00', ?, '15:00', 'scheduled', ?, ?)`,
          [
            mariaMember.organization_id || 1,
            airbnbUnits[0].id,
            mariaMember.id,
            todayStr,
            todayStr,
            defaultChecklistJson,
            "Turnover between guests. Please ensure fresh towels and extra espresso pods are stocked in the kitchen."
          ]
        );
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

// ── Organizations & Team Members ──────────────────────────────────

export interface CurrentUser {
  email: string | null;
  username: string | null;
  userId: string | null;
  name: string | null;
  isAuthenticated: boolean;
}

function getCurrentUser(c: Context<Env>): CurrentUser {
  const keycloakUser = c.get("user");
  const simUser = c.req.header("X-Simulated-User")?.trim().toLowerCase();
  const config = c.get("keycloakConfig");

  // 1. Authenticated Keycloak user (real authenticated token ALWAYS takes precedence)
  if (keycloakUser) {
    const rawEmail = (keycloakUser.email || (keycloakUser.username?.includes("@") ? keycloakUser.username : null))?.trim().toLowerCase() || null;
    const username = keycloakUser.username?.trim().toLowerCase() || null;
    const name = keycloakUser.name || [keycloakUser.givenName, keycloakUser.familyName].filter(Boolean).join(" ") || keycloakUser.username || "User";
    return {
      email: rawEmail,
      username,
      userId: keycloakUser.id || null,
      name,
      isAuthenticated: true,
    };
  }

  // 2. Explicit simulated user (dev testing / local switcher ONLY when NO real auth is present)
  if (simUser) {
    return {
      email: simUser,
      username: simUser,
      userId: null,
      name: simUser.split("@")[0],
      isAuthenticated: true,
    };
  }

  // 3. Local dev fallback when Keycloak is NOT enabled
  if (config && !config.enabled) {
    return {
      email: "admin@openproperty.local",
      username: "admin",
      userId: "local-admin",
      name: "Alex Admin",
      isAuthenticated: true,
    };
  }

  // 4. Keycloak is enabled but request has no valid user token
  return {
    email: null,
    username: null,
    userId: null,
    name: null,
    isAuthenticated: false,
  };
}

async function getUserAllowedOrgIds(c: Context<Env>): Promise<number[]> {
  const user = getCurrentUser(c);
  if (!user.isAuthenticated) {
    return [];
  }

  const email = user.email?.toLowerCase();
  const username = user.username?.toLowerCase();
  const userId = user.userId;

  if (!email && !username && !userId) {
    return [];
  }

  // An organization member is identified strictly by their email address.
  // Never match a different email address via OR on user_id or username!
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (email) {
    conditions.push("LOWER(m.email) = ?");
    params.push(email);
  } else if (username && username.includes("@")) {
    conditions.push("LOWER(m.email) = ?");
    params.push(username);
  } else if (userId) {
    conditions.push("m.user_id = ?");
    params.push(userId);
  }

  if (conditions.length === 0) {
    return [];
  }

  // Safely link user_id only to the exact matching email row
  if (userId && email) {
    run(
      "UPDATE organization_members SET user_id = ? WHERE LOWER(email) = ? AND (user_id IS NULL OR user_id = '')",
      [userId, email]
    ).catch(() => {});
  }

  // Automatically activate invited member upon login
  if (email) {
    run(
      "UPDATE organization_members SET status = 'active' WHERE LOWER(email) = ? AND status = 'invited'",
      [email]
    ).catch(() => {});
  }

  const rows = await query<{ organization_id: number }>(
    `SELECT DISTINCT m.organization_id
     FROM organization_members m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.status IN ('active', 'invited') AND (${conditions.join(" OR ")})
     ORDER BY m.organization_id ASC`,
    params
  ).catch(() => []);

  return rows.map((r) => r.organization_id);
}

async function getUserOrgRole(c: Context<Env>, orgId: number): Promise<string | null> {
  const user = getCurrentUser(c);
  if (!user.isAuthenticated) return null;

  const email = user.email?.toLowerCase();
  const username = user.username?.toLowerCase();
  const userId = user.userId;

  const userConds: string[] = [];
  const params: unknown[] = [orgId];

  if (email) {
    userConds.push("LOWER(email) = ?");
    params.push(email);
  } else if (username && username.includes("@")) {
    userConds.push("LOWER(email) = ?");
    params.push(username);
  } else if (userId) {
    userConds.push("user_id = ?");
    params.push(userId);
  }

  if (userConds.length === 0) return null;

  const row = await get<{ role: string }>(
    `SELECT role FROM organization_members
     WHERE organization_id = ? AND status IN ('active', 'invited') AND (${userConds.join(" OR ")})
     LIMIT 1`,
    params
  ).catch(() => null);

  return row ? row.role : null;
}

async function getCurrentMember(c: Context<Env>, orgId: number): Promise<{ id: number; name: string; email: string; role: string } | null> {
  const user = getCurrentUser(c);
  if (!user.isAuthenticated) return null;

  const email = user.email?.toLowerCase();
  const username = user.username?.toLowerCase();
  const userId = user.userId;

  const userConds: string[] = [];
  const params: unknown[] = [orgId];

  if (email) {
    userConds.push("LOWER(email) = ?");
    params.push(email);
  } else if (username && username.includes("@")) {
    userConds.push("LOWER(email) = ?");
    params.push(username);
  } else if (userId) {
    userConds.push("user_id = ?");
    params.push(userId);
  }

  if (userConds.length === 0) return null;

  const member = await get<{ id: number; name: string; email: string; role: string }>(
    `SELECT id, name, email, role FROM organization_members
     WHERE organization_id = ? AND status = 'active' AND (${userConds.join(" OR ")})
     LIMIT 1`,
    params
  ).catch(() => null);

  return member ?? null;
}

async function getActiveOrganizationId(c: Context<Env>): Promise<number | null> {
  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (allowedOrgIds.length === 0) {
    return null;
  }

  const headerOrgId = c.req.header("X-Organization-Id");
  if (headerOrgId) {
    const parsed = parseInt(headerOrgId, 10);
    if (Number.isFinite(parsed) && allowedOrgIds.includes(parsed)) {
      return parsed;
    }
  }

  return allowedOrgIds[0];
}

const OrganizationInput = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional().nullable(),
  slug: z.string().optional(),
});

app.get("/api/organizations", async (c) => {
  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (allowedOrgIds.length === 0) {
    return c.json({ organizations: [], active_organization_id: null });
  }

  const activeOrgId = await getActiveOrganizationId(c);
  const placeholders = allowedOrgIds.map(() => "?").join(",");

  const rows = await query<{
    id: number;
    name: string;
    slug: string;
    description: string | null;
    created_at: string;
    property_count: number;
    member_count: number;
  }>(
    `SELECT o.*,
       (SELECT COUNT(*) FROM properties p WHERE p.organization_id = o.id) as property_count,
       (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id = o.id) as member_count
     FROM organizations o
     WHERE o.id IN (${placeholders})
     ORDER BY o.name ASC`,
    allowedOrgIds
  );

  const orgsWithRole = await Promise.all(
    rows.map(async (org) => {
      const role = await getUserOrgRole(c, org.id);
      return {
        ...org,
        is_active: org.id === activeOrgId,
        user_role: role || "viewer",
        user_status: "active",
      };
    })
  );

  return c.json({ organizations: orgsWithRole, active_organization_id: activeOrgId });
});

app.get("/api/organizations/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid organization ID" }, 400);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(id)) {
    return c.json({ error: "Access denied to this organization" }, 403);
  }

  const org = await get<{
    id: number;
    name: string;
    slug: string;
    description: string | null;
    created_at: string;
    property_count: number;
    member_count: number;
  }>(
    `SELECT o.*,
       (SELECT COUNT(*) FROM properties p WHERE p.organization_id = o.id) as property_count,
       (SELECT COUNT(*) FROM organization_members m WHERE m.organization_id = o.id) as member_count
     FROM organizations o WHERE o.id = ?`,
    [id]
  );
  if (!org) return c.json({ error: "Organization not found" }, 404);

  const role = await getUserOrgRole(c, id);
  return c.json({ organization: { ...org, user_role: role || "viewer" } });
});

app.post("/api/organizations", async (c) => {
  const user = getCurrentUser(c);
  if (!user.isAuthenticated) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const parsed = await parseJson(c, OrganizationInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  let slug = (d.slug || d.name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) slug = "org";

  const existingSlug = await get<{ id: number }>("SELECT id FROM organizations WHERE slug = ?", [slug]);
  if (existingSlug) {
    slug = `${slug}-${Date.now().toString().slice(-4)}`;
  }

  const result = await run(
    "INSERT INTO organizations (name, slug, description) VALUES (?, ?, ?)",
    [d.name.trim(), slug, d.description?.trim() ?? null]
  );
  const newOrgId = Number(result.lastInsertRowid);

  // Add the creator as owner in organization_members
  const creatorEmail = (user.email || user.username || "user@openproperty.local").toLowerCase();
  const creatorName = user.name || (creatorEmail.includes("@") ? creatorEmail.split("@")[0] : "Admin");

  await run(
    "INSERT INTO organization_members (organization_id, user_id, email, name, role, status) VALUES (?, ?, ?, ?, 'owner', 'active')",
    [newOrgId, user.userId, creatorEmail, creatorName]
  );

  const org = await get("SELECT * FROM organizations WHERE id = ?", [newOrgId]);
  return c.json({ organization: { ...org, user_role: "owner" } }, 201);
});

app.put("/api/organizations/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid organization ID" }, 400);

  const role = await getUserOrgRole(c, id);
  if (role !== "owner" && role !== "admin") {
    return c.json({ error: "Forbidden: owner or admin role required" }, 403);
  }

  const parsed = await parseJson(c, OrganizationInput.partial());
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  const { sets, params } = buildUpdate(parsed.data);
  if (sets.length === 0) return c.json({ error: "No fields to update" }, 400);

  sets.push("updated_at = datetime('now')");
  params.push(id);
  await run(`UPDATE organizations SET ${sets.join(", ")} WHERE id = ?`, params);

  const org = await get("SELECT * FROM organizations WHERE id = ?", [id]);
  return c.json({ organization: org });
});

app.delete("/api/organizations/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid organization ID" }, 400);

  const role = await getUserOrgRole(c, id);
  if (role !== "owner") {
    return c.json({ error: "Forbidden: owner role required to delete organization" }, 403);
  }

  const userOrgs = await getUserAllowedOrgIds(c);
  if (userOrgs.length <= 1) {
    return c.json({ error: "Cannot delete your only remaining organization" }, 400);
  }

  await run("DELETE FROM organizations WHERE id = ?", [id]);
  return c.json({ ok: true });
});

// Organization members
app.get("/api/organizations/:id/members", async (c) => {
  const orgId = intParam(c.req.param("id"));
  if (!orgId) return c.json({ error: "Invalid organization ID" }, 400);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(orgId)) {
    return c.json({ error: "Access denied to this organization" }, 403);
  }

  const members = await query(
    `SELECT * FROM organization_members
     WHERE organization_id = ?
     ORDER BY
       CASE role
         WHEN 'owner' THEN 1
         WHEN 'admin' THEN 2
         WHEN 'manager' THEN 3
         ELSE 4
       END, name ASC`,
    [orgId]
  );
  return c.json({ members });
});

const AddMemberInput = z.object({
  email: z.string().email(),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["owner", "admin", "manager", "viewer", "cleaner"]).default("manager"),
  status: z.enum(["active", "invited"]).default("active"),
});

app.post("/api/organizations/:id/members", async (c) => {
  const orgId = intParam(c.req.param("id"));
  if (!orgId) return c.json({ error: "Invalid organization ID" }, 400);

  const role = await getUserOrgRole(c, orgId);
  if (role !== "owner" && role !== "admin") {
    return c.json({ error: "Forbidden: owner or admin role required to invite members" }, 403);
  }

  const parsed = await parseJson(c, AddMemberInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  const existing = await get(
    "SELECT id FROM organization_members WHERE organization_id = ? AND LOWER(email) = ?",
    [orgId, d.email.trim().toLowerCase()]
  );
  if (existing) {
    return c.json({ error: "A member with this email already belongs to this organization" }, 400);
  }

  const result = await run(
    `INSERT INTO organization_members (organization_id, email, name, role, status)
     VALUES (?, ?, ?, ?, ?)`,
    [orgId, d.email.trim().toLowerCase(), d.name.trim(), d.role, d.status]
  );

  const member = await get("SELECT * FROM organization_members WHERE id = ?", [result.lastInsertRowid]);

  // Dispatch Invitation Email
  let emailResult: SendEmailResult = { ok: true, simulated: true };
  try {
    const emailCfg = await getEmailConfig(c);
    const org = await get<{ name: string }>("SELECT name FROM organizations WHERE id = ?", [orgId]);
    const currentUser = getCurrentUser(c);
    const appOrigin = c.req.header("Origin") || c.req.header("Referer")?.replace(/\/[^/]*$/, "") || "http://localhost:5173";

    const inviteHtml = renderInviteEmailHtml({
      inviteeName: d.name.trim(),
      inviteeEmail: d.email.trim(),
      organizationName: org?.name || "Organization",
      role: d.role || "manager",
      inviterName: currentUser.name || undefined,
      inviterEmail: currentUser.email || undefined,
      appUrl: `${appOrigin}/organization`,
    });

    emailResult = await sendEmail(
      emailCfg,
      {
        to: d.email.trim(),
        subject: `Invitation to join ${org?.name || "OpenProperty"}`,
        html: inviteHtml,
      },
      c
    );
  } catch (mailErr) {
    emailResult = { ok: false, error: (mailErr as Error).message };
  }

  return c.json({ member, email_result: emailResult }, 201);
});

app.post("/api/organizations/:id/members/:memberId/resend-invite", async (c) => {
  const orgId = intParam(c.req.param("id"));
  const memberId = intParam(c.req.param("memberId"));
  if (!orgId || !memberId) return c.json({ error: "Invalid ID" }, 400);

  const currentRole = await getUserOrgRole(c, orgId);
  if (currentRole !== "owner" && currentRole !== "admin") {
    return c.json({ error: "Forbidden: owner or admin role required" }, 403);
  }

  const member = await get<{ id: number; email: string; name: string; role: string; status: string }>(
    "SELECT * FROM organization_members WHERE id = ? AND organization_id = ?",
    [memberId, orgId]
  );
  if (!member) return c.json({ error: "Member not found" }, 404);

  const org = await get<{ name: string }>("SELECT name FROM organizations WHERE id = ?", [orgId]);
  const currentUser = getCurrentUser(c);
  const appOrigin = c.req.header("Origin") || c.req.header("Referer")?.replace(/\/[^/]*$/, "") || "http://localhost:5173";

  let emailResult: SendEmailResult = { ok: true, simulated: true };
  try {
    const emailCfg = await getEmailConfig(c);
    const inviteHtml = renderInviteEmailHtml({
      inviteeName: member.name,
      inviteeEmail: member.email,
      organizationName: org?.name || "Organization",
      role: member.role,
      inviterName: currentUser.name || undefined,
      inviterEmail: currentUser.email || undefined,
      appUrl: `${appOrigin}/organization`,
    });

    emailResult = await sendEmail(
      emailCfg,
      {
        to: member.email,
        subject: `Invitation to join ${org?.name || "OpenProperty"} (Resent)`,
        html: inviteHtml,
      },
      c
    );

    await run("UPDATE organization_members SET updated_at = datetime('now') WHERE id = ?", [memberId]);
  } catch (err) {
    emailResult = { ok: false, error: (err as Error).message };
  }

  return c.json({ ok: emailResult.ok, email_result: emailResult });
});

const UpdateMemberInput = z.object({
  name: z.string().optional(),
  role: z.enum(["owner", "admin", "manager", "viewer", "cleaner"]).optional(),
  status: z.enum(["active", "invited"]).optional(),
});

app.put("/api/organizations/:id/members/:memberId", async (c) => {
  const orgId = intParam(c.req.param("id"));
  const memberId = intParam(c.req.param("memberId"));
  if (!orgId || !memberId) return c.json({ error: "Invalid ID" }, 400);

  const currentRole = await getUserOrgRole(c, orgId);
  if (currentRole !== "owner" && currentRole !== "admin") {
    return c.json({ error: "Forbidden: owner or admin role required" }, 403);
  }

  const member = await get<{ id: number; role: string }>(
    "SELECT * FROM organization_members WHERE id = ? AND organization_id = ?",
    [memberId, orgId]
  );
  if (!member) return c.json({ error: "Member not found" }, 404);

  const parsed = await parseJson(c, UpdateMemberInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  if (parsed.data.role && parsed.data.role !== "owner" && member.role === "owner") {
    const ownerCount = await get<{ n: number }>(
      "SELECT COUNT(*) as n FROM organization_members WHERE organization_id = ? AND role = 'owner'",
      [orgId]
    );
    if ((ownerCount?.n ?? 0) <= 1) {
      return c.json({ error: "Cannot demote the last owner. Transfer ownership or add another owner first." }, 400);
    }
  }

  const { sets, params } = buildUpdate(parsed.data);
  if (sets.length > 0) {
    sets.push("updated_at = datetime('now')");
    params.push(memberId, orgId);
    await run(`UPDATE organization_members SET ${sets.join(", ")} WHERE id = ? AND organization_id = ?`, params);
  }

  const updated = await get("SELECT * FROM organization_members WHERE id = ?", [memberId]);
  return c.json({ member: updated });
});

app.delete("/api/organizations/:id/members/:memberId", async (c) => {
  const orgId = intParam(c.req.param("id"));
  const memberId = intParam(c.req.param("memberId"));
  if (!orgId || !memberId) return c.json({ error: "Invalid ID" }, 400);

  const currentRole = await getUserOrgRole(c, orgId);
  if (currentRole !== "owner" && currentRole !== "admin") {
    return c.json({ error: "Forbidden: owner or admin role required" }, 403);
  }

  const member = await get<{ id: number; role: string }>(
    "SELECT * FROM organization_members WHERE id = ? AND organization_id = ?",
    [memberId, orgId]
  );
  if (!member) return c.json({ error: "Member not found" }, 404);

  if (member.role === "owner") {
    const ownerCount = await get<{ n: number }>(
      "SELECT COUNT(*) as n FROM organization_members WHERE organization_id = ? AND role = 'owner'",
      [orgId]
    );
    if ((ownerCount?.n ?? 0) <= 1) {
      return c.json({ error: "Cannot remove the only owner of this organization." }, 400);
    }
  }

  await run("DELETE FROM organization_members WHERE id = ? AND organization_id = ?", [memberId, orgId]);
  return c.json({ ok: true });
});

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
  organization_id: z.number().int().optional().nullable(),
});

app.get("/api/properties", async (c) => {
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) {
    return c.json({ properties: [] });
  }

  const rows = await query(
    `SELECT p.*,
       (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id) as unit_count,
       (SELECT COUNT(*) FROM units u WHERE u.property_id = p.id AND u.status = 'occupied') as occupied_count
     FROM properties p
     WHERE p.organization_id = ?
     ORDER BY p.name`,
    [activeOrgId]
  );
  return c.json({ properties: rows });
});

app.get("/api/properties/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (allowedOrgIds.length === 0) return c.json({ error: "Not found" }, 404);

  const placeholders = allowedOrgIds.map(() => "?").join(",");
  const row = await get(
    `SELECT * FROM properties WHERE id = ? AND organization_id IN (${placeholders})`,
    [id, ...allowedOrgIds]
  );
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ property: row });
});

app.post("/api/properties", async (c) => {
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) {
    return c.json({ error: "You must belong to an organization to create properties" }, 403);
  }

  const role = await getUserOrgRole(c, activeOrgId);
  if (role === "viewer") {
    return c.json({ error: "Viewers cannot create properties" }, 403);
  }

  const parsed = await parseJson(c, PropertyInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  const result = await run(
    `INSERT INTO properties (organization_id, name, type, address, city, state, zip, year_built, notes, color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [activeOrgId, d.name, d.type ?? "single_family", d.address ?? null, d.city ?? null, d.state ?? null, d.zip ?? null, d.year_built ?? null, d.notes ?? null, d.color ?? "sky"],
  );
  const row = await get("SELECT * FROM properties WHERE id = ?", [result.lastInsertRowid]);
  return c.json({ property: row }, 201);
});

app.put("/api/properties/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);

  const prop = await get<{ id: number; organization_id: number }>("SELECT id, organization_id FROM properties WHERE id = ?", [id]);
  if (!prop) return c.json({ error: "Not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(prop.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const role = await getUserOrgRole(c, prop.organization_id);
  if (role === "viewer") {
    return c.json({ error: "Viewers cannot modify properties" }, 403);
  }

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

  const prop = await get<{ id: number; organization_id: number }>("SELECT id, organization_id FROM properties WHERE id = ?", [id]);
  if (!prop) return c.json({ error: "Not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(prop.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const role = await getUserOrgRole(c, prop.organization_id);
  if (role !== "owner" && role !== "admin") {
    return c.json({ error: "Forbidden: only owners and admins can delete properties" }, 403);
  }

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
  cleaner_id: z.number().int().optional().nullable(),
  cleaning_checklist: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const UNIT_SELECT = `
  SELECT u.*,
    p.name as property_name,
    p.color as property_color,
    p.address as property_address,
    p.city as property_city,
    (SELECT m.name FROM organization_members m WHERE m.id = u.cleaner_id) as cleaner_name,
    (SELECT m.email FROM organization_members m WHERE m.id = u.cleaner_id) as cleaner_email,
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
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) return c.json({ units: [] });

  const where: string[] = ["p.organization_id = ?"];
  const params: unknown[] = [activeOrgId];
  if (propertyId) { where.push("u.property_id = ?"); params.push(propertyId); }
  if (status) { where.push("u.status = ?"); params.push(status); }
  const sql = `${UNIT_SELECT} WHERE ${where.join(" AND ")} ORDER BY p.name, u.name`;
  const rows = await query(sql, params);
  return c.json({ units: rows });
});

app.get("/api/units/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (allowedOrgIds.length === 0) return c.json({ error: "Not found" }, 404);

  const placeholders = allowedOrgIds.map(() => "?").join(",");
  const row = await get(`${UNIT_SELECT} WHERE u.id = ? AND p.organization_id IN (${placeholders})`, [id, ...allowedOrgIds]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ unit: row });
});

app.post("/api/units", async (c) => {
  const parsed = await parseJson(c, UnitInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  const prop = await get<{ id: number; organization_id: number }>("SELECT id, organization_id FROM properties WHERE id = ?", [d.property_id]);
  if (!prop) return c.json({ error: "Property not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(prop.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const role = await getUserOrgRole(c, prop.organization_id);
  if (role === "viewer") {
    return c.json({ error: "Viewers cannot create units" }, 403);
  }

  const result = await run(
    `INSERT INTO units (
       property_id, name, type, bedrooms, bathrooms, sqft, market_rent, monthly_operating_cost, status,
       airbnb_nightly_rate, airbnb_cleaning_fee, airbnb_max_guests, airbnb_min_nights,
       airbnb_check_in_time, airbnb_check_out_time, airbnb_wifi_ssid, airbnb_wifi_password,
       airbnb_lockbox_code, airbnb_listing_url, airbnb_house_rules, airbnb_check_out_instructions,
       cleaner_id, cleaning_checklist, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.property_id, d.name, d.type ?? "residential", d.bedrooms ?? 1, d.bathrooms ?? 1, d.sqft ?? null,
      d.market_rent ?? 0, d.monthly_operating_cost ?? 0, d.status ?? "vacant",
      d.airbnb_nightly_rate ?? 0, d.airbnb_cleaning_fee ?? 0, d.airbnb_max_guests ?? 2, d.airbnb_min_nights ?? 1,
      d.airbnb_check_in_time ?? "15:00", d.airbnb_check_out_time ?? "11:00", d.airbnb_wifi_ssid ?? null, d.airbnb_wifi_password ?? null,
      d.airbnb_lockbox_code ?? null, d.airbnb_listing_url ?? null, d.airbnb_house_rules ?? null, d.airbnb_check_out_instructions ?? null,
      d.cleaner_id ?? null, d.cleaning_checklist ?? null, d.notes ?? null,
    ],
  );
  const row = await get(`${UNIT_SELECT} WHERE u.id = ?`, [result.lastInsertRowid]);
  return c.json({ unit: row }, 201);
});

app.put("/api/units/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);

  const unit = await get<{ id: number; organization_id: number }>(
    "SELECT u.id, p.organization_id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ?",
    [id]
  );
  if (!unit) return c.json({ error: "Not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(unit.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const role = await getUserOrgRole(c, unit.organization_id);
  if (role === "viewer") {
    return c.json({ error: "Viewers cannot modify units" }, 403);
  }

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

  const unit = await get<{ id: number; organization_id: number }>(
    "SELECT u.id, p.organization_id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ?",
    [id]
  );
  if (!unit) return c.json({ error: "Not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(unit.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const role = await getUserOrgRole(c, unit.organization_id);
  if (role !== "owner" && role !== "admin") {
    return c.json({ error: "Forbidden: only owners and admins can delete units" }, 403);
  }

  const r = await run("DELETE FROM units WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

app.post("/api/units/:id/assign-tenant", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid unit ID" }, 400);

  const unit = await get<{ id: number; organization_id: number; market_rent: number; monthly_operating_cost: number }>(
    "SELECT u.id, p.organization_id, u.market_rent, u.monthly_operating_cost FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ?",
    [id],
  );
  if (!unit) return c.json({ error: "Unit not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(unit.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const role = await getUserOrgRole(c, unit.organization_id);
  if (role === "viewer") {
    return c.json({ error: "Viewers cannot assign tenants" }, 403);
  }

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

  const unit = await get<{ id: number; organization_id: number }>(
    "SELECT u.id, p.organization_id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ?",
    [id],
  );
  if (!unit) return c.json({ error: "Unit not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(unit.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const role = await getUserOrgRole(c, unit.organization_id);
  if (role === "viewer") {
    return c.json({ error: "Viewers cannot unassign tenants" }, 403);
  }

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
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) return c.json({ tenants: [] });

  const search = c.req.query("q")?.trim();
  const where: string[] = [
    `(t.organization_id = ? OR t.id IN (
       SELECT DISTINCT l.primary_tenant_id FROM leases l
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE p.organization_id = ? AND l.primary_tenant_id IS NOT NULL
     ))`
  ];
  const params: unknown[] = [activeOrgId, activeOrgId];

  if (search) {
    const like = `%${search}%`;
    where.push("(t.last_name LIKE ? OR t.first_name LIKE ? OR t.email LIKE ? OR t.phone LIKE ?)");
    params.push(like, like, like, like);
  }

  const rows = await query(
    `SELECT t.*,
       (SELECT u.id FROM leases l LEFT JOIN units u ON u.id = l.unit_id
          WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_id,
       (SELECT u.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id
          WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_unit_name,
       (SELECT p.name FROM leases l LEFT JOIN units u ON u.id = l.unit_id LEFT JOIN properties p ON p.id = u.property_id
          WHERE l.primary_tenant_id = t.id AND l.status = 'active' LIMIT 1) as active_property_name
     FROM tenants t
     WHERE ${where.join(" AND ")}
     ORDER BY t.last_name, t.first_name LIMIT 500`,
    params
  );
  return c.json({ tenants: rows });
});

app.get("/api/tenants/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (allowedOrgIds.length === 0) return c.json({ error: "Not found" }, 404);

  const placeholders = allowedOrgIds.map(() => "?").join(",");
  const row = await get(
    `SELECT * FROM tenants t
     WHERE t.id = ? AND (
       t.organization_id IN (${placeholders}) OR
       t.id IN (
         SELECT DISTINCT l.primary_tenant_id FROM leases l
         JOIN units u ON u.id = l.unit_id
         JOIN properties p ON p.id = u.property_id
         WHERE p.organization_id IN (${placeholders}) AND l.primary_tenant_id IS NOT NULL
       )
     )`,
    [id, ...allowedOrgIds, ...allowedOrgIds]
  );
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ tenant: row });
});

app.post("/api/tenants", async (c) => {
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) return c.json({ error: "You must belong to an organization to add tenants" }, 403);

  const role = await getUserOrgRole(c, activeOrgId);
  if (role === "viewer") return c.json({ error: "Viewers cannot create tenants" }, 403);

  const parsed = await parseJson(c, TenantInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;
  const result = await run(
    `INSERT INTO tenants (organization_id, first_name, last_name, email, phone, date_of_birth, emergency_contact, employer, monthly_income, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [activeOrgId, d.first_name, d.last_name, d.email ?? null, d.phone ?? null, d.date_of_birth ?? null, d.emergency_contact ?? null, d.employer ?? null, d.monthly_income ?? null, d.notes ?? null],
  );
  const row = await get("SELECT * FROM tenants WHERE id = ?", [result.lastInsertRowid]);
  return c.json({ tenant: row }, 201);
});

app.put("/api/tenants/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (allowedOrgIds.length === 0) return c.json({ error: "Not found" }, 404);

  const placeholders = allowedOrgIds.map(() => "?").join(",");
  const tenant = await get<{ id: number; organization_id: number | null }>(
    `SELECT t.id, t.organization_id FROM tenants t
     WHERE t.id = ? AND (
       t.organization_id IN (${placeholders}) OR
       t.id IN (
         SELECT DISTINCT l.primary_tenant_id FROM leases l
         JOIN units u ON u.id = l.unit_id
         JOIN properties p ON p.id = u.property_id
         WHERE p.organization_id IN (${placeholders}) AND l.primary_tenant_id IS NOT NULL
       )
     )`,
    [id, ...allowedOrgIds, ...allowedOrgIds]
  );
  if (!tenant) return c.json({ error: "Not found" }, 404);

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

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (allowedOrgIds.length === 0) return c.json({ error: "Not found" }, 404);

  const placeholders = allowedOrgIds.map(() => "?").join(",");
  const tenant = await get<{ id: number }>(
    `SELECT t.id FROM tenants t
     WHERE t.id = ? AND (
       t.organization_id IN (${placeholders}) OR
       t.id IN (
         SELECT DISTINCT l.primary_tenant_id FROM leases l
         JOIN units u ON u.id = l.unit_id
         JOIN properties p ON p.id = u.property_id
         WHERE p.organization_id IN (${placeholders}) AND l.primary_tenant_id IS NOT NULL
       )
     )`,
    [id, ...allowedOrgIds, ...allowedOrgIds]
  );
  if (!tenant) return c.json({ error: "Not found" }, 404);

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
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) return c.json({ leases: [] });

  const where: string[] = ["p.organization_id = ?"];
  const params: unknown[] = [activeOrgId];
  if (status) { where.push("l.status = ?"); params.push(status); }
  if (tenantId) { where.push("l.primary_tenant_id = ?"); params.push(tenantId); }
  if (unitId) { where.push("l.unit_id = ?"); params.push(unitId); }
  const sql = `${LEASE_SELECT} WHERE ${where.join(" AND ")} ORDER BY l.start_date DESC`;
  const rows = await query(sql, params);
  return c.json({ leases: rows });
});

app.get("/api/leases/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (allowedOrgIds.length === 0) return c.json({ error: "Not found" }, 404);

  const placeholders = allowedOrgIds.map(() => "?").join(",");
  const row = await get(`${LEASE_SELECT} WHERE l.id = ? AND p.organization_id IN (${placeholders})`, [id, ...allowedOrgIds]);
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ lease: row });
});

app.post("/api/leases", async (c) => {
  const parsed = await parseJson(c, LeaseInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  const unit = await get<{ id: number; organization_id: number }>(
    "SELECT u.id, p.organization_id FROM units u JOIN properties p ON p.id = u.property_id WHERE u.id = ?",
    [d.unit_id]
  );
  if (!unit) return c.json({ error: "Unit not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(unit.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const role = await getUserOrgRole(c, unit.organization_id);
  if (role === "viewer") {
    return c.json({ error: "Viewers cannot create leases" }, 403);
  }

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

  const lease = await get<{ id: number; organization_id: number }>(
    "SELECT l.id, p.organization_id FROM leases l JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id WHERE l.id = ?",
    [id]
  );
  if (!lease) return c.json({ error: "Not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(lease.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const role = await getUserOrgRole(c, lease.organization_id);
  if (role === "viewer") {
    return c.json({ error: "Viewers cannot modify leases" }, 403);
  }

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

  const lease = await get<{ id: number; unit_id: number; organization_id: number }>(
    "SELECT l.id, l.unit_id, p.organization_id FROM leases l JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id WHERE l.id = ?",
    [id]
  );
  if (!lease) return c.json({ error: "Not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(lease.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const role = await getUserOrgRole(c, lease.organization_id);
  if (role !== "owner" && role !== "admin") {
    return c.json({ error: "Forbidden: only owners and admins can delete leases" }, 403);
  }

  const r = await run("DELETE FROM leases WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);

  const activeCount = await get<{ n: number }>("SELECT COUNT(*) AS n FROM leases WHERE unit_id = ? AND status = 'active'", [lease.unit_id]);
  if ((activeCount?.n ?? 0) === 0) {
    await run("UPDATE units SET status = 'vacant' WHERE id = ?", [lease.unit_id]);
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
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) return c.json({ charges: [] });

  const period = c.req.query("period");
  const status = c.req.query("status");
  const where: string[] = ["p.organization_id = ?"];
  const params: unknown[] = [activeOrgId];
  if (period) { where.push("c.period = ?"); params.push(period); }
  if (status) { where.push("c.status = ?"); params.push(status); }
  const sql = `${CHARGE_SELECT} WHERE ${where.join(" AND ")} ORDER BY c.due_date, p.name, u.name`;
  const rows = await query(sql, params).catch(() => []);
  return c.json({ charges: rows });
});

app.post("/api/rent-charges", async (c) => {
  const parsed = await parseJson(c, ChargeInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  const lease = await get<{ id: number; organization_id: number }>(
    "SELECT l.id, p.organization_id FROM leases l JOIN units u ON u.id = l.unit_id JOIN properties p ON p.id = u.property_id WHERE l.id = ?",
    [d.lease_id]
  );
  if (!lease) return c.json({ error: "Lease not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(lease.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

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
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) return c.json({ created: 0, period: "" });

  const body = await c.req.json().catch(() => ({})) as { period?: string };
  const period = body.period;
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return c.json({ error: "period (YYYY-MM) required" }, 400);
  const leases = await query<{ id: number; monthly_rent: number; operating_cost_advance: number; heating_cost_advance: number; rent_due_day: number; start_date: string; end_date: string }>(
    `SELECT l.id, l.monthly_rent, l.operating_cost_advance, l.heating_cost_advance, l.rent_due_day, l.start_date, l.end_date
     FROM leases l
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE l.status = 'active' AND p.organization_id = ?`,
    [activeOrgId]
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
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) return c.json({ work_orders: [] });

  const status = c.req.query("status");
  const propertyId = intParam(c.req.query("property_id"));
  const unitId = intParam(c.req.query("unit_id"));
  const where: string[] = ["p.organization_id = ?"];
  const params: unknown[] = [activeOrgId];
  if (status) { where.push("w.status = ?"); params.push(status); }
  if (propertyId) { where.push("w.property_id = ?"); params.push(propertyId); }
  if (unitId) { where.push("w.unit_id = ?"); params.push(unitId); }
  const sql = `${WO_SELECT} WHERE ${where.join(" AND ")} ORDER BY
    CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
    w.created_at DESC`;
  const rows = await query(sql, params).catch(() => []);
  return c.json({ work_orders: rows });
});

app.post("/api/work-orders", async (c) => {
  const parsed = await parseJson(c, WorkOrderInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  if (d.property_id) {
    const prop = await get<{ id: number; organization_id: number }>("SELECT id, organization_id FROM properties WHERE id = ?", [d.property_id]);
    if (!prop) return c.json({ error: "Property not found" }, 404);
    const allowedOrgIds = await getUserAllowedOrgIds(c);
    if (!allowedOrgIds.includes(prop.organization_id)) return c.json({ error: "Access denied" }, 403);
  }

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

  const existing = await get<{ property_id: number | null }>("SELECT property_id FROM work_orders WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (existing.property_id) {
    const prop = await get<{ organization_id: number }>("SELECT organization_id FROM properties WHERE id = ?", [existing.property_id]);
    const allowedOrgIds = await getUserAllowedOrgIds(c);
    if (!prop || !allowedOrgIds.includes(prop.organization_id)) return c.json({ error: "Not found" }, 404);
    const role = await getUserOrgRole(c, prop.organization_id);
    if (role === "viewer") return c.json({ error: "Viewers cannot edit work orders" }, 403);
  }

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

  const existing = await get<{ property_id: number | null }>("SELECT property_id FROM work_orders WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (existing.property_id) {
    const prop = await get<{ organization_id: number }>("SELECT organization_id FROM properties WHERE id = ?", [existing.property_id]);
    const allowedOrgIds = await getUserAllowedOrgIds(c);
    if (!prop || !allowedOrgIds.includes(prop.organization_id)) return c.json({ error: "Not found" }, 404);
    const role = await getUserOrgRole(c, prop.organization_id);
    if (role === "viewer") return c.json({ error: "Viewers cannot delete work orders" }, 403);
  }

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
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) return c.json({ applications: [] });

  const rows = await query(
    `SELECT a.*, u.name as unit_name, p.name as property_name
     FROM applications a
     LEFT JOIN units u ON u.id = a.unit_id
     LEFT JOIN properties p ON p.id = u.property_id
     WHERE p.organization_id = ?
     ORDER BY a.created_at DESC`,
    [activeOrgId]
  ).catch(() => []);
  return c.json({ applications: rows });
});

app.post("/api/applications", async (c) => {
  const parsed = await parseJson(c, ApplicationInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  if (d.unit_id) {
    const unit = await get<{ property_id: number }>("SELECT property_id FROM units WHERE id = ?", [d.unit_id]);
    if (!unit) return c.json({ error: "Unit not found" }, 404);
    const prop = await get<{ organization_id: number }>("SELECT organization_id FROM properties WHERE id = ?", [unit.property_id]);
    const allowedOrgIds = await getUserAllowedOrgIds(c);
    if (!prop || !allowedOrgIds.includes(prop.organization_id)) return c.json({ error: "Access denied" }, 403);
    const role = await getUserOrgRole(c, prop.organization_id);
    if (role === "viewer") return c.json({ error: "Viewers cannot create applications" }, 403);
  }

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

  const existing = await get<{ unit_id: number | null }>("SELECT unit_id FROM applications WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (existing.unit_id) {
    const unit = await get<{ property_id: number }>("SELECT property_id FROM units WHERE id = ?", [existing.unit_id]);
    const prop = unit ? await get<{ organization_id: number }>("SELECT organization_id FROM properties WHERE id = ?", [unit.property_id]) : null;
    const allowedOrgIds = await getUserAllowedOrgIds(c);
    if (!prop || !allowedOrgIds.includes(prop.organization_id)) return c.json({ error: "Not found" }, 404);
    const role = await getUserOrgRole(c, prop.organization_id);
    if (role === "viewer") return c.json({ error: "Viewers cannot edit applications" }, 403);
  }

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

  const existing = await get<{ unit_id: number | null }>("SELECT unit_id FROM applications WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (existing.unit_id) {
    const unit = await get<{ property_id: number }>("SELECT property_id FROM units WHERE id = ?", [existing.unit_id]);
    const prop = unit ? await get<{ organization_id: number }>("SELECT organization_id FROM properties WHERE id = ?", [unit.property_id]) : null;
    const allowedOrgIds = await getUserAllowedOrgIds(c);
    if (!prop || !allowedOrgIds.includes(prop.organization_id)) return c.json({ error: "Not found" }, 404);
    const role = await getUserOrgRole(c, prop.organization_id);
    if (role === "viewer") return c.json({ error: "Viewers cannot delete applications" }, 403);
  }

  const r = await run("DELETE FROM applications WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// ── Dashboard summary ──────────────────────────────────────────────

app.get("/api/dashboard/summary", async (c) => {
  const today = new Date().toISOString().slice(0, 10);
  const periodNow = today.slice(0, 7);
  const activeOrgId = await getActiveOrganizationId(c);

  if (!activeOrgId) {
    return c.json({
      period: periodNow,
      properties: 0,
      units: 0,
      occupied: 0,
      vacant: 0,
      occupancy_rate: 0,
      active_leases: 0,
      upcoming_move_outs: 0,
      month_outstanding: 0,
      month_collected: 0,
      overdue_total: 0,
      overdue_count: 0,
      open_work_orders: 0,
      urgent_work_orders: 0,
      recent_work_orders: [],
      upcoming_expirations: [],
      airbnb_units: 0,
      airbnb_active_guests: 0,
      airbnb_month_revenue: 0,
      airbnb_upcoming_checkins: 0,
    });
  }

  const safeGet = <T,>(sql: string, params: unknown[] = [], fallback: T) =>
    get<T>(sql, params).catch(() => fallback as T | undefined).then((v) => v ?? fallback);
  const safeQuery = <T,>(sql: string, params: unknown[] = []): Promise<T[]> =>
    query<T>(sql, params).catch(() => [] as T[]);

  const orgPropFilter = "p.organization_id = ?";
  const orgPropSub = `(SELECT id FROM properties WHERE organization_id = ?)`;

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
    safeGet<{ n: number }>("SELECT COUNT(*) as n FROM properties WHERE organization_id = ?", [activeOrgId], { n: 0 }),
    safeGet<{ n: number }>(`SELECT COUNT(*) as n FROM units u JOIN properties p ON u.property_id = p.id WHERE ${orgPropFilter}`, [activeOrgId], { n: 0 }),
    safeGet<{ n: number }>(`SELECT COUNT(*) as n FROM units u JOIN properties p ON u.property_id = p.id WHERE ${orgPropFilter} AND u.status = 'occupied'`, [activeOrgId], { n: 0 }),
    safeGet<{ n: number }>(`SELECT COUNT(*) as n FROM units u JOIN properties p ON u.property_id = p.id WHERE ${orgPropFilter} AND u.status = 'vacant'`, [activeOrgId], { n: 0 }),
    safeGet<{ n: number }>(`SELECT COUNT(*) as n FROM leases l JOIN units u ON l.unit_id = u.id JOIN properties p ON u.property_id = p.id WHERE ${orgPropFilter} AND l.status = 'active'`, [activeOrgId], { n: 0 }),
    safeGet<{ n: number }>(
      `SELECT COUNT(*) as n FROM leases l JOIN units u ON l.unit_id = u.id JOIN properties p ON u.property_id = p.id WHERE ${orgPropFilter} AND l.status = 'active' AND l.end_date <= date('now', '+30 days')`,
      [activeOrgId], { n: 0 },
    ),
    safeGet<{ total: number }>(
      `SELECT COALESCE(SUM(rc.amount - rc.amount_paid), 0) as total FROM rent_charges rc JOIN leases l ON rc.lease_id = l.id JOIN units u ON l.unit_id = u.id JOIN properties p ON u.property_id = p.id WHERE ${orgPropFilter} AND rc.period = ? AND rc.status != 'waived'`,
      [activeOrgId, periodNow], { total: 0 },
    ),
    safeGet<{ total: number }>(
      `SELECT COALESCE(SUM(rc.amount_paid), 0) as total FROM rent_charges rc JOIN leases l ON rc.lease_id = l.id JOIN units u ON l.unit_id = u.id JOIN properties p ON u.property_id = p.id WHERE ${orgPropFilter} AND rc.period = ?`,
      [activeOrgId, periodNow], { total: 0 },
    ),
    safeGet<{ total: number; n: number }>(
      `SELECT COALESCE(SUM(rc.amount - rc.amount_paid), 0) as total, COUNT(*) as n FROM rent_charges rc JOIN leases l ON rc.lease_id = l.id JOIN units u ON l.unit_id = u.id JOIN properties p ON u.property_id = p.id WHERE ${orgPropFilter} AND rc.due_date < date('now') AND rc.amount_paid < rc.amount AND rc.status != 'waived'`,
      [activeOrgId], { total: 0, n: 0 },
    ),
    safeGet<{ n: number }>(
      `SELECT COUNT(*) as n FROM work_orders w WHERE w.property_id IN ${orgPropSub} AND w.status NOT IN ('completed', 'cancelled')`,
      [activeOrgId], { n: 0 },
    ),
    safeGet<{ n: number }>(
      `SELECT COUNT(*) as n FROM work_orders w WHERE w.property_id IN ${orgPropSub} AND w.priority = 'urgent' AND w.status NOT IN ('completed', 'cancelled')`,
      [activeOrgId], { n: 0 },
    ),
    safeQuery<{ id: number; title: string; priority: string; status: string; property_name: string | null; unit_name: string | null; created_at: string }>(
      `SELECT w.id, w.title, w.priority, w.status, p.name as property_name, u.name as unit_name, w.created_at
       FROM work_orders w
       JOIN properties p ON p.id = w.property_id
       LEFT JOIN units u ON u.id = w.unit_id
       WHERE w.property_id IN ${orgPropSub} AND w.status NOT IN ('completed', 'cancelled')
       ORDER BY CASE w.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, w.created_at DESC
       LIMIT 6`,
      [activeOrgId],
    ),
    safeQuery<{ id: number; end_date: string; tenant_first_name: string | null; tenant_last_name: string | null; unit_name: string | null; property_name: string | null }>(
      `SELECT l.id, l.end_date,
         t.first_name as tenant_first_name, t.last_name as tenant_last_name,
         u.name as unit_name, p.name as property_name
       FROM leases l
       LEFT JOIN tenants t ON t.id = l.primary_tenant_id
       JOIN units u ON u.id = l.unit_id
       JOIN properties p ON p.id = u.property_id
       WHERE ${orgPropFilter} AND l.status = 'active' AND l.end_date <= date('now', '+60 days')
       ORDER BY l.end_date ASC LIMIT 6`,
      [activeOrgId],
    ),
    safeGet<{ n: number }>(`SELECT COUNT(*) as n FROM units u JOIN properties p ON u.property_id = p.id WHERE ${orgPropFilter} AND u.type = 'airbnb'`, [activeOrgId], { n: 0 }),
    safeGet<{ n: number }>(
      `SELECT COUNT(*) as n FROM airbnb_bookings b JOIN units u ON b.unit_id = u.id JOIN properties p ON u.property_id = p.id WHERE ${orgPropFilter} AND (b.booking_status = 'checked_in' OR (b.booking_status = 'confirmed' AND b.check_in_date <= date('now') AND b.check_out_date >= date('now')))`,
      [activeOrgId], { n: 0 },
    ),
    safeGet<{ total: number }>(
      `SELECT COALESCE(SUM(b.net_payout), 0) as total FROM airbnb_bookings b JOIN units u ON b.unit_id = u.id JOIN properties p ON u.property_id = p.id WHERE ${orgPropFilter} AND (b.payout_date LIKE ? OR b.check_in_date LIKE ?) AND b.booking_status != 'cancelled'`,
      [activeOrgId, periodNow + "%", periodNow + "%"], { total: 0 },
    ),
    safeGet<{ n: number }>(
      `SELECT COUNT(*) as n FROM airbnb_bookings b JOIN units u ON b.unit_id = u.id JOIN properties p ON u.property_id = p.id WHERE ${orgPropFilter} AND b.check_in_date >= date('now') AND b.check_in_date <= date('now', '+7 days') AND b.booking_status != 'cancelled'`,
      [activeOrgId], { n: 0 },
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

// ── Demo / Sample Data Management ──────────────────────────────────

const DEMO_PROPERTY_NAMES = ["Oakwood Estate", "Honeybee Hideaway", "308 Mission Apartments"];
const DEMO_UNIT_NAMES = ["Suite 4B - Designer Loft (Airbnb)"];
const DEMO_VENDOR_NAMES = [
  "Emerald Pool Service",
  "Hill Country Plumbing",
  "Bright Spark Electric",
  "Sparkle Clean Turnover Services",
];

app.get("/api/demo-data/status", async (c) => {
  const allowed = await getUserAllowedOrgIds(c);
  if (allowed.length === 0) {
    return c.json({
      hasDemoData: false,
      counts: { properties: 0, units: 0, bookings: 0, vendors: 0, workOrders: 0 },
      demoProperties: [],
    });
  }

  const pPlaceholders = DEMO_PROPERTY_NAMES.map(() => "?").join(",");
  const demoProps = await query<{ id: number; name: string }>(
    `SELECT id, name FROM properties WHERE name IN (${pPlaceholders})`,
    DEMO_PROPERTY_NAMES,
  ).catch(() => []);
  const demoPropIds = demoProps.map((p) => p.id);

  let demoUnitIds: number[] = [];
  if (demoPropIds.length > 0) {
    const propPlaceholders = demoPropIds.map(() => "?").join(",");
    const demoUnits = await query<{ id: number; name: string }>(
      `SELECT id, name FROM units WHERE property_id IN (${propPlaceholders}) OR name IN ('Suite 4B - Designer Loft (Airbnb)')`,
      demoPropIds,
    ).catch(() => []);
    demoUnitIds = demoUnits.map((u) => u.id);
  } else {
    const demoUnits = await query<{ id: number; name: string }>(
      `SELECT id, name FROM units WHERE name IN ('Suite 4B - Designer Loft (Airbnb)')`,
    ).catch(() => []);
    demoUnitIds = demoUnits.map((u) => u.id);
  }

  let bookingCount = 0;
  if (demoUnitIds.length > 0) {
    const uPlaceholders = demoUnitIds.map(() => "?").join(",");
    const bRow = await get<{ n: number }>(
      `SELECT COUNT(*) as n FROM airbnb_bookings WHERE unit_id IN (${uPlaceholders})`,
      demoUnitIds,
    ).catch(() => ({ n: 0 }));
    bookingCount = bRow?.n ?? 0;
  }

  const vPlaceholders = DEMO_VENDOR_NAMES.map(() => "?").join(",");
  const vRow = await get<{ n: number }>(
    `SELECT COUNT(*) as n FROM vendors WHERE name IN (${vPlaceholders})`,
    DEMO_VENDOR_NAMES,
  ).catch(() => ({ n: 0 }));
  const vendorCount = vRow?.n ?? 0;

  let workOrdersCount = 0;
  if (demoPropIds.length > 0 || demoUnitIds.length > 0) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (demoPropIds.length > 0) {
      clauses.push(`property_id IN (${demoPropIds.map(() => "?").join(",")})`);
      params.push(...demoPropIds);
    }
    if (demoUnitIds.length > 0) {
      clauses.push(`unit_id IN (${demoUnitIds.map(() => "?").join(",")})`);
      params.push(...demoUnitIds);
    }
    const woRow = await get<{ n: number }>(
      `SELECT COUNT(*) as n FROM work_orders WHERE ${clauses.join(" OR ")}`,
      params,
    ).catch(() => ({ n: 0 }));
    workOrdersCount = woRow?.n ?? 0;
  }

  const hasDemoData = demoProps.length > 0 || demoUnitIds.length > 0;

  return c.json({
    hasDemoData,
    counts: {
      properties: demoProps.length,
      units: demoUnitIds.length,
      bookings: bookingCount,
      vendors: vendorCount,
      workOrders: workOrdersCount,
    },
    demoProperties: demoProps.map((p) => p.name),
  });
});

app.post("/api/demo-data/delete", async (c) => {
  const allowed = await getUserAllowedOrgIds(c);
  if (allowed.length === 0) return c.json({ error: "Forbidden: You are not a member of any organization" }, 403);

  const pPlaceholders = DEMO_PROPERTY_NAMES.map(() => "?").join(",");
  const demoProps = await query<{ id: number; name: string }>(
    `SELECT id, name FROM properties WHERE name IN (${pPlaceholders})`,
    DEMO_PROPERTY_NAMES,
  ).catch(() => []);
  const demoPropIds = demoProps.map((p) => p.id);

  let demoUnitIds: number[] = [];
  if (demoPropIds.length > 0) {
    const propPlaceholders = demoPropIds.map(() => "?").join(",");
    const demoUnits = await query<{ id: number; name: string }>(
      `SELECT id, name FROM units WHERE property_id IN (${propPlaceholders}) OR name IN ('Suite 4B - Designer Loft (Airbnb)')`,
      demoPropIds,
    ).catch(() => []);
    demoUnitIds = demoUnits.map((u) => u.id);
  } else {
    const demoUnits = await query<{ id: number; name: string }>(
      `SELECT id FROM units WHERE name IN ('Suite 4B - Designer Loft (Airbnb)')`,
    ).catch(() => []);
    demoUnitIds = demoUnits.map((u) => u.id);
  }

  const deletedCounts = {
    properties: demoProps.length,
    units: demoUnitIds.length,
    bookings: 0,
    workOrders: 0,
    vendors: 0,
    leases: 0,
  };

  // 1. Delete work orders for demo properties or demo units
  if (demoPropIds.length > 0 || demoUnitIds.length > 0) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (demoPropIds.length > 0) {
      clauses.push(`property_id IN (${demoPropIds.map(() => "?").join(",")})`);
      params.push(...demoPropIds);
    }
    if (demoUnitIds.length > 0) {
      clauses.push(`unit_id IN (${demoUnitIds.map(() => "?").join(",")})`);
      params.push(...demoUnitIds);
    }
    const woCount = await get<{ n: number }>(`SELECT COUNT(*) as n FROM work_orders WHERE ${clauses.join(" OR ")}`, params);
    deletedCounts.workOrders = woCount?.n ?? 0;
    await run(`DELETE FROM work_orders WHERE ${clauses.join(" OR ")}`, params);
  }

  // 2. Delete airbnb bookings for demo units
  if (demoUnitIds.length > 0) {
    const uPlaceholders = demoUnitIds.map(() => "?").join(",");
    const bCount = await get<{ n: number }>(`SELECT COUNT(*) as n FROM airbnb_bookings WHERE unit_id IN (${uPlaceholders})`, demoUnitIds);
    deletedCounts.bookings = bCount?.n ?? 0;
    await run(`DELETE FROM airbnb_bookings WHERE unit_id IN (${uPlaceholders})`, demoUnitIds);
  }

  // 3. Delete payments, charges, leases, and nebenkosten for demo units
  if (demoUnitIds.length > 0) {
    const uPlaceholders = demoUnitIds.map(() => "?").join(",");
    await run(`
      DELETE FROM payments WHERE charge_id IN (
        SELECT id FROM rent_charges WHERE lease_id IN (
          SELECT id FROM leases WHERE unit_id IN (${uPlaceholders})
        )
      )
    `, demoUnitIds);

    await run(`
      DELETE FROM rent_charges WHERE lease_id IN (
        SELECT id FROM leases WHERE unit_id IN (${uPlaceholders})
      )
    `, demoUnitIds);

    await run(`
      DELETE FROM nebenkosten_statements WHERE lease_id IN (
        SELECT id FROM leases WHERE unit_id IN (${uPlaceholders})
      )
    `, demoUnitIds);

    const lCount = await get<{ n: number }>(`SELECT COUNT(*) as n FROM leases WHERE unit_id IN (${uPlaceholders})`, demoUnitIds);
    deletedCounts.leases = lCount?.n ?? 0;
    await run(`DELETE FROM leases WHERE unit_id IN (${uPlaceholders})`, demoUnitIds);
  }

  // 4. Delete operating costs for demo properties
  if (demoPropIds.length > 0) {
    const pPlaceholders = demoPropIds.map(() => "?").join(",");
    await run(`DELETE FROM operating_costs WHERE property_id IN (${pPlaceholders})`, demoPropIds);
  }

  // 5. Delete demo units
  if (demoUnitIds.length > 0) {
    const uPlaceholders = demoUnitIds.map(() => "?").join(",");
    await run(`DELETE FROM units WHERE id IN (${uPlaceholders})`, demoUnitIds);
  }

  // 6. Delete demo properties
  if (demoPropIds.length > 0) {
    const pPlaceholders = demoPropIds.map(() => "?").join(",");
    await run(`DELETE FROM properties WHERE id IN (${pPlaceholders})`, demoPropIds);
  }

  // 7. Delete demo vendors only if they have NO remaining work orders
  const vPlaceholders = DEMO_VENDOR_NAMES.map(() => "?").join(",");
  const safeVendors = await query<{ id: number }>(`
    SELECT id FROM vendors
    WHERE name IN (${vPlaceholders})
      AND id NOT IN (SELECT DISTINCT vendor_id FROM work_orders WHERE vendor_id IS NOT NULL)
  `, DEMO_VENDOR_NAMES).catch(() => []);

  if (safeVendors.length > 0) {
    deletedCounts.vendors = safeVendors.length;
    const svPlaceholders = safeVendors.map(() => "?").join(",");
    await run(`DELETE FROM vendors WHERE id IN (${svPlaceholders})`, safeVendors.map((v) => v.id));
  }

  // 8. Mark sample data as cleared in settings so ensureSeeded() will never restore it
  await run(`
    INSERT INTO settings (key, value, updated_at) VALUES ('sample_data_cleared', 'true', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = datetime('now')
  `);

  return c.json({
    ok: true,
    message: "Dummy data successfully deleted. Your real properties and data are preserved.",
    deleted: deletedCounts,
  });
});

app.post("/api/demo-data/restore", async (c) => {
  const allowed = await getUserAllowedOrgIds(c);
  if (allowed.length === 0) return c.json({ error: "Forbidden: You are not a member of any organization" }, 403);

  await run(`
    INSERT INTO settings (key, value, updated_at) VALUES ('sample_data_cleared', 'false', datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = 'false', updated_at = datetime('now')
  `);
  seeded = false;
  await ensureSeeded();
  return c.json({ ok: true, message: "Sample data restored successfully." });
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

// ── Email Sender & Outbound Delivery ────────────────────────────────

app.get("/api/email/config", async (c) => {
  const cfg = await getEmailConfig(c);
  return c.json({
    ...cfg,
    smtpPass: cfg.smtpPass ? "••••••••" : "",
    apiKey: cfg.apiKey ? (cfg.apiKey.length > 8 ? `${cfg.apiKey.slice(0, 4)}••••${cfg.apiKey.slice(-4)}` : "••••••••") : "",
  });
});

app.put("/api/email/config", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }
  if (!body || typeof body !== "object") return c.json({ error: "Body must be an object" }, 400);
  const d = body as Record<string, unknown>;

  const updates: Record<string, string> = {};
  if (d.enabled !== undefined) updates["email_enabled"] = d.enabled ? "true" : "false";
  if (d.provider !== undefined) updates["email_provider"] = String(d.provider);
  if (d.fromAddress !== undefined) updates["email_from_address"] = String(d.fromAddress);
  if (d.fromName !== undefined) updates["email_from_name"] = String(d.fromName);
  if (d.replyTo !== undefined) updates["email_reply_to"] = String(d.replyTo);
  if (d.smtpHost !== undefined) updates["email_smtp_host"] = String(d.smtpHost);
  if (d.smtpPort !== undefined) updates["email_smtp_port"] = String(d.smtpPort);
  if (d.smtpSecure !== undefined) updates["email_smtp_secure"] = d.smtpSecure ? "true" : "false";
  if (d.smtpUser !== undefined) updates["email_smtp_user"] = String(d.smtpUser);
  if (d.smtpPass !== undefined && d.smtpPass !== "••••••••") updates["email_smtp_pass"] = String(d.smtpPass);
  if (d.apiKey !== undefined && !String(d.apiKey).includes("••••")) updates["email_api_key"] = String(d.apiKey);

  for (const [key, value] of Object.entries(updates)) {
    await run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      [key, value]
    );
  }

  const newCfg = await getEmailConfig(c);
  return c.json({
    ok: true,
    config: {
      ...newCfg,
      smtpPass: newCfg.smtpPass ? "••••••••" : "",
      apiKey: newCfg.apiKey ? (newCfg.apiKey.length > 8 ? `${newCfg.apiKey.slice(0, 4)}••••${newCfg.apiKey.slice(-4)}` : "••••••••") : "",
    },
  });
});

app.post("/api/email/test", async (c) => {
  let body: unknown;
  try { body = await c.req.json(); } catch { body = {}; }
  const d = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const targetEmail = String(d.to || "").trim();
  if (!targetEmail || !targetEmail.includes("@")) {
    return c.json({ ok: false, error: "Please provide a valid recipient email address for testing." }, 400);
  }

  const currentCfg = await getEmailConfig(c);
  const cfgToTest: EmailConfig = {
    ...currentCfg,
    enabled: true, // test mode sends even if global toggle is off
    provider: (d.provider ? String(d.provider) : currentCfg.provider) as EmailProvider,
    fromAddress: d.fromAddress ? String(d.fromAddress) : currentCfg.fromAddress,
    fromName: d.fromName ? String(d.fromName) : currentCfg.fromName,
    smtpHost: d.smtpHost ? String(d.smtpHost) : currentCfg.smtpHost,
    smtpPort: d.smtpPort ? Number(d.smtpPort) : currentCfg.smtpPort,
    smtpSecure: d.smtpSecure !== undefined ? Boolean(d.smtpSecure) : currentCfg.smtpSecure,
    smtpUser: d.smtpUser ? String(d.smtpUser) : currentCfg.smtpUser,
    smtpPass: d.smtpPass && d.smtpPass !== "••••••••" ? String(d.smtpPass) : currentCfg.smtpPass,
    apiKey: d.apiKey && !String(d.apiKey).includes("••••") ? String(d.apiKey) : currentCfg.apiKey,
  };

  const html = renderTestEmailHtml(cfgToTest.provider, cfgToTest.fromAddress);
  const result = await sendEmail(
    cfgToTest,
    {
      to: targetEmail,
      subject: `[OpenProperty] Email Sender Test (${cfgToTest.provider.toUpperCase()})`,
      html,
    },
    c
  );

  return c.json(result);
});

app.get("/api/email/logs", async (c) => {
  const rows = await query<{
    id: number;
    to_email: string;
    subject: string;
    provider: string;
    status: string;
    error: string | null;
    created_at: string;
  }>("SELECT * FROM email_logs ORDER BY id DESC LIMIT 50").catch(() => []);
  return c.json({ logs: rows });
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
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) return c.json({ operating_costs: [] });

  const propertyId = intParam(c.req.query("property_id"));
  const year = intParam(c.req.query("year"));
  const where: string[] = ["p.organization_id = ?"];
  const params: unknown[] = [activeOrgId];
  if (propertyId) { where.push("oc.property_id = ?"); params.push(propertyId); }
  if (year) { where.push("oc.year = ?"); params.push(year); }
  const sql = `SELECT oc.* FROM operating_costs oc JOIN properties p ON p.id = oc.property_id WHERE ${where.join(" AND ")} ORDER BY oc.year DESC, oc.cost_type ASC`;
  const rows = await query(sql, params).catch(() => []);
  return c.json({ operating_costs: rows });
});

app.post("/api/operating-costs", async (c) => {
  const parsed = await parseJson(c, OperatingCostInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  const prop = await get<{ organization_id: number }>("SELECT organization_id FROM properties WHERE id = ?", [d.property_id]);
  if (!prop) return c.json({ error: "Property not found" }, 404);
  const allowed = await getUserAllowedOrgIds(c);
  if (!allowed.includes(prop.organization_id)) return c.json({ error: "Forbidden" }, 403);
  const role = await getUserOrgRole(c, prop.organization_id);
  if (role === "viewer") return c.json({ error: "Viewers cannot create operating costs" }, 403);

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

  const existing = await get<{ property_id: number; organization_id: number }>(
    "SELECT oc.property_id, p.organization_id FROM operating_costs oc JOIN properties p ON p.id = oc.property_id WHERE oc.id = ?",
    [id],
  );
  if (!existing) return c.json({ error: "Not found" }, 404);
  const allowed = await getUserAllowedOrgIds(c);
  if (!allowed.includes(existing.organization_id)) return c.json({ error: "Forbidden" }, 403);
  const role = await getUserOrgRole(c, existing.organization_id);
  if (role === "viewer") return c.json({ error: "Viewers cannot delete operating costs" }, 403);

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

  const prop = await get<{ organization_id: number }>("SELECT organization_id FROM properties WHERE id = ?", [body.property_id]);
  if (!prop) return c.json({ error: "Property not found" }, 404);
  const allowed = await getUserAllowedOrgIds(c);
  if (!allowed.includes(prop.organization_id)) return c.json({ error: "Forbidden" }, 403);
  const role = await getUserOrgRole(c, prop.organization_id);
  if (role === "viewer") return c.json({ error: "Viewers cannot create operating costs" }, 403);

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

  const property = await get<{ id: number; name: string; type: string; organization_id: number }>(
    "SELECT id, name, type, organization_id FROM properties WHERE id = ?",
    [propertyId],
  );
  if (!property) return c.json({ error: "Property not found" }, 404);
  const allowed = await getUserAllowedOrgIds(c);
  if (!allowed.includes(property.organization_id)) return c.json({ error: "Property not found" }, 404);

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

  const prop = await get<{ organization_id: number }>("SELECT organization_id FROM properties WHERE id = ?", [property_id]);
  if (!prop) return c.json({ error: "Property not found" }, 404);
  const allowed = await getUserAllowedOrgIds(c);
  if (!allowed.includes(prop.organization_id)) return c.json({ error: "Forbidden" }, 403);
  const role = await getUserOrgRole(c, prop.organization_id);
  if (role === "viewer") return c.json({ error: "Viewers cannot generate statements" }, 403);

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
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) return c.json({ statements: [] });

  const where: string[] = ["p.organization_id = ?"];
  const params: unknown[] = [activeOrgId];
  if (leaseId) { where.push("s.lease_id = ?"); params.push(leaseId); }
  const rows = await query(
    `SELECT s.* FROM nebenkosten_statements s
     JOIN leases l ON l.id = s.lease_id
     JOIN units u ON u.id = l.unit_id
     JOIN properties p ON p.id = u.property_id
     WHERE ${where.join(" AND ")}`,
    params,
  ).catch(() => []);
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
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) return c.json({ bookings: [] });

  const unitId = intParam(c.req.query("unit_id"));
  const propertyId = intParam(c.req.query("property_id"));
  const status = c.req.query("status");
  const payoutStatus = c.req.query("payout_status");
  const q = c.req.query("q")?.trim().toLowerCase();

  const where: string[] = ["p.organization_id = ?"];
  const params: unknown[] = [activeOrgId];
  if (unitId) { where.push("b.unit_id = ?"); params.push(unitId); }
  if (propertyId) { where.push("u.property_id = ?"); params.push(propertyId); }
  if (status) { where.push("b.booking_status = ?"); params.push(status); }
  if (payoutStatus) { where.push("b.payout_status = ?"); params.push(payoutStatus); }
  if (q) {
    where.push("(LOWER(b.guest_name) LIKE ? OR LOWER(b.confirmation_code) LIKE ? OR LOWER(COALESCE(b.notes, '')) LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const sql = `${AIRBNB_BOOKING_SELECT} WHERE ${where.join(" AND ")} ORDER BY b.check_in_date DESC`;
  const rows = await query(sql, params).catch(() => []);
  return c.json({ bookings: rows });
});

app.get("/api/airbnb/bookings/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const row = await get<any>(`${AIRBNB_BOOKING_SELECT} WHERE b.id = ?`, [id]);
  if (!row) return c.json({ error: "Not found" }, 404);
  const prop = await get<{ organization_id: number }>("SELECT organization_id FROM properties WHERE id = ?", [row.property_id]);
  const allowed = await getUserAllowedOrgIds(c);
  if (!prop || !allowed.includes(prop.organization_id)) return c.json({ error: "Not found" }, 404);
  return c.json({ booking: row });
});

app.post("/api/airbnb/bookings", async (c) => {
  const parsed = await parseJson(c, AirbnbBookingInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  // Get unit defaults if needed
  const unit = await get<{ airbnb_nightly_rate: number; airbnb_cleaning_fee: number; market_rent: number; property_id: number }>(
    "SELECT airbnb_nightly_rate, airbnb_cleaning_fee, market_rent, property_id FROM units WHERE id = ?",
    [d.unit_id],
  );
  if (!unit) return c.json({ error: "Unit not found" }, 404);
  const prop = await get<{ organization_id: number }>("SELECT organization_id FROM properties WHERE id = ?", [unit.property_id]);
  if (!prop) return c.json({ error: "Property not found" }, 404);
  const allowed = await getUserAllowedOrgIds(c);
  if (!allowed.includes(prop.organization_id)) return c.json({ error: "Forbidden" }, 403);
  const role = await getUserOrgRole(c, prop.organization_id);
  if (role === "viewer") return c.json({ error: "Viewers cannot create bookings" }, 403);

  // Auto calculate nights
  const start = new Date(d.check_in_date).getTime();
  const end = new Date(d.check_out_date).getTime();
  const diffDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  const nights = d.nights ?? diffDays;

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

  const unit = await get<{ property_id: number }>("SELECT property_id FROM units WHERE id = ?", [existing.unit_id]);
  const prop = unit ? await get<{ id: number; name: string; address: string; organization_id: number }>("SELECT id, name, address, organization_id FROM properties WHERE id = ?", [unit.property_id]) : null;
  const allowed = await getUserAllowedOrgIds(c);
  if (!prop || !allowed.includes(prop.organization_id)) return c.json({ error: "Not found" }, 404);
  const role = await getUserOrgRole(c, prop.organization_id);
  if (role === "viewer") return c.json({ error: "Viewers cannot update bookings" }, 403);

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

      // Automatically create or verify a cleaning task exists for this turnover
      const currentBooking = await get<{ check_out_date: string; guest_name: string }>(
        "SELECT check_out_date, guest_name FROM airbnb_bookings WHERE id = ?",
        [id]
      );
      const unitDetails = await get<{
        name: string; airbnb_lockbox_code: string | null; airbnb_check_out_time: string | null;
        airbnb_check_in_time: string | null; cleaner_id: number | null; cleaning_checklist: string | null;
      }>(
        "SELECT name, airbnb_lockbox_code, airbnb_check_out_time, airbnb_check_in_time, cleaner_id, cleaning_checklist FROM units WHERE id = ?",
        [existing.unit_id]
      );

      if (currentBooking && unitDetails) {
        const existingTask = await get<{ id: number }>("SELECT id FROM cleaning_tasks WHERE booking_id = ?", [id]);
        if (!existingTask) {
          const nextBooking = await get<{ check_in_date: string; check_in_time?: string }>(
            "SELECT check_in_date FROM airbnb_bookings WHERE unit_id = ? AND check_in_date >= ? AND booking_status != 'cancelled' AND id != ? ORDER BY check_in_date ASC LIMIT 1",
            [existing.unit_id, currentBooking.check_out_date, id]
          );

          await run(
            `INSERT INTO cleaning_tasks (
              organization_id, unit_id, booking_id, cleaner_id,
              scheduled_date, scheduled_time, next_check_in_date, next_check_in_time,
              status, checklist, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
            [
              prop.organization_id,
              existing.unit_id,
              id,
              unitDetails.cleaner_id ?? null,
              currentBooking.check_out_date,
              unitDetails.airbnb_check_out_time || "11:00",
              nextBooking?.check_in_date ?? null,
              unitDetails.airbnb_check_in_time || "15:00",
              unitDetails.cleaning_checklist || null,
              `Turnover cleaning after ${currentBooking.guest_name}'s checkout.`,
            ]
          );

          if (unitDetails.cleaner_id) {
            const cleaner = await get<{ name: string; email: string }>(
              "SELECT name, email FROM organization_members WHERE id = ?",
              [unitDetails.cleaner_id]
            );
            if (cleaner?.email) {
              const appUrl = (c.req.header("Origin") || "http://localhost:5173") + "/cleaner";
              const emailCfg = await getEmailConfig(c);
              const emailHtml = renderCleaningAssignmentEmailHtml({
                cleanerName: cleaner.name,
                unitName: unitDetails.name,
                propertyName: prop.name,
                propertyAddress: prop.address,
                scheduledDate: currentBooking.check_out_date,
                scheduledTime: unitDetails.airbnb_check_out_time || "11:00",
                nextCheckInDate: nextBooking?.check_in_date ?? undefined,
                nextCheckInTime: unitDetails.airbnb_check_in_time || "15:00",
                lockboxCode: unitDetails.airbnb_lockbox_code ?? undefined,
                notes: `Turnover cleaning after ${currentBooking.guest_name}'s checkout.`,
                appUrl,
              });

              sendEmail(emailCfg, {
                to: cleaner.email,
                subject: `New Turnover Cleaning Assigned: ${unitDetails.name} on ${currentBooking.check_out_date}`,
                html: emailHtml,
                text: `You have been assigned a cleaning task at ${unitDetails.name} on ${currentBooking.check_out_date}. Access Code: ${unitDetails.airbnb_lockbox_code || 'N/A'}. Details: ${appUrl}`,
              }).catch(() => {});
            }
          }
        }
      }
    }
  }

  const row = await get(`${AIRBNB_BOOKING_SELECT} WHERE b.id = ?`, [id]);
  return c.json({ booking: row });
});

app.delete("/api/airbnb/bookings/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);
  const existing = await get<{ unit_id: number }>("SELECT unit_id FROM airbnb_bookings WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Not found" }, 404);
  const unit = await get<{ property_id: number }>("SELECT property_id FROM units WHERE id = ?", [existing.unit_id]);
  const prop = unit ? await get<{ organization_id: number }>("SELECT organization_id FROM properties WHERE id = ?", [unit.property_id]) : null;
  const allowed = await getUserAllowedOrgIds(c);
  if (!prop || !allowed.includes(prop.organization_id)) return c.json({ error: "Not found" }, 404);
  const role = await getUserOrgRole(c, prop.organization_id);
  if (role === "viewer") return c.json({ error: "Viewers cannot delete bookings" }, 403);

  const r = await run("DELETE FROM airbnb_bookings WHERE id = ?", [id]);
  if (!r.changes) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

// One-click action to schedule a turnover cleaning task and work order for this checkout
app.post("/api/airbnb/bookings/:id/schedule-cleaning", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);

  const booking = await get<{
    id: number; unit_id: number; guest_name: string; check_out_date: string; cleaning_fee: number;
  }>("SELECT id, unit_id, guest_name, check_out_date, cleaning_fee FROM airbnb_bookings WHERE id = ?", [id]);
  if (!booking) return c.json({ error: "Booking not found" }, 404);

  const unit = await get<{
    id: number; property_id: number; name: string; airbnb_cleaning_fee: number;
    airbnb_lockbox_code: string | null; airbnb_check_out_time: string | null;
    airbnb_check_in_time: string | null; cleaner_id: number | null; cleaning_checklist: string | null;
  }>(
    "SELECT id, property_id, name, airbnb_cleaning_fee, airbnb_lockbox_code, airbnb_check_out_time, airbnb_check_in_time, cleaner_id, cleaning_checklist FROM units WHERE id = ?",
    [booking.unit_id]
  );
  if (!unit) return c.json({ error: "Unit not found" }, 404);

  const prop = await get<{ id: number; name: string; address: string; organization_id: number }>(
    "SELECT id, name, address, organization_id FROM properties WHERE id = ?",
    [unit.property_id]
  );
  const allowed = await getUserAllowedOrgIds(c);
  if (!prop || !allowed.includes(prop.organization_id)) return c.json({ error: "Forbidden" }, 403);
  const role = await getUserOrgRole(c, prop.organization_id);
  if (role === "viewer") return c.json({ error: "Viewers cannot schedule cleanings" }, 403);

  // Set unit status to turnover
  await run("UPDATE units SET status = 'turnover' WHERE id = ?", [unit.id]);

  // Create or retrieve cleaning task
  let cleaningTask = await get("SELECT * FROM cleaning_tasks WHERE booking_id = ?", [booking.id]);
  if (!cleaningTask) {
    const nextBooking = await get<{ check_in_date: string }>(
      "SELECT check_in_date FROM airbnb_bookings WHERE unit_id = ? AND check_in_date >= ? AND booking_status != 'cancelled' AND id != ? ORDER BY check_in_date ASC LIMIT 1",
      [unit.id, booking.check_out_date, booking.id]
    );

    const taskResult = await run(
      `INSERT INTO cleaning_tasks (
        organization_id, unit_id, booking_id, cleaner_id,
        scheduled_date, scheduled_time, next_check_in_date, next_check_in_time,
        status, checklist, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
      [
        prop.organization_id,
        unit.id,
        booking.id,
        unit.cleaner_id ?? null,
        booking.check_out_date,
        unit.airbnb_check_out_time || "11:00",
        nextBooking?.check_in_date ?? null,
        unit.airbnb_check_in_time || "15:00",
        unit.cleaning_checklist || null,
        `Turnover cleaning after ${booking.guest_name}'s checkout.`,
      ]
    );
    cleaningTask = await get("SELECT * FROM cleaning_tasks WHERE id = ?", [taskResult.lastInsertRowid]);

    if (unit.cleaner_id) {
      const cleaner = await get<{ name: string; email: string }>(
        "SELECT name, email FROM organization_members WHERE id = ?",
        [unit.cleaner_id]
      );
      if (cleaner?.email) {
        const appUrl = (c.req.header("Origin") || "http://localhost:5173") + "/cleaner";
        const emailCfg = await getEmailConfig(c);
        const emailHtml = renderCleaningAssignmentEmailHtml({
          cleanerName: cleaner.name,
          unitName: unit.name,
          propertyName: prop.name,
          propertyAddress: prop.address,
          scheduledDate: booking.check_out_date,
          scheduledTime: unit.airbnb_check_out_time || "11:00",
          nextCheckInDate: nextBooking?.check_in_date ?? undefined,
          nextCheckInTime: unit.airbnb_check_in_time || "15:00",
          lockboxCode: unit.airbnb_lockbox_code ?? undefined,
          notes: `Turnover cleaning after ${booking.guest_name}'s checkout.`,
          appUrl,
        });

        sendEmail(emailCfg, {
          to: cleaner.email,
          subject: `New Turnover Cleaning Assigned: ${unit.name} on ${booking.check_out_date}`,
          html: emailHtml,
          text: `You have been assigned a cleaning task at ${unit.name} on ${booking.check_out_date}. Access Code: ${unit.airbnb_lockbox_code || 'N/A'}. Details: ${appUrl}`,
        }).catch(() => {});
      }
    }
  }

  // Also create a vendor work order if cleaning vendor exists
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
  return c.json({ ok: true, work_order: wo, cleaning_task: cleaningTask }, 201);
});

// Comprehensive Airbnb Analytics
app.get("/api/airbnb/analytics", async (c) => {
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) {
    return c.json({
      total_revenue: 0,
      total_bookings: 0,
      active_stays: 0,
      upcoming_check_ins_7d: 0,
      upcoming_check_outs_7d: 0,
      average_daily_rate: 0,
      occupancy_rate: 0,
      revenue_by_month: [],
      units_summary: [],
    });
  }

  const propertyId = intParam(c.req.query("property_id"));

  const whereUnit: string[] = ["u.type = 'airbnb'", "p.organization_id = ?"];
  const whereBooking: string[] = ["b.booking_status != 'cancelled'", "p.organization_id = ?"];
  const paramsUnit: unknown[] = [activeOrgId];
  const paramsBooking: unknown[] = [activeOrgId];

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
     JOIN properties p ON p.id = u.property_id
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

// ── Cleaners and Cleaning Tasks ─────────────────────────────────────

const CLEANING_TASK_SELECT = `
  SELECT
    ct.*,
    u.name as unit_name,
    u.type as unit_type,
    u.airbnb_lockbox_code,
    u.airbnb_check_in_time as unit_default_check_in_time,
    u.airbnb_check_out_time as unit_default_check_out_time,
    u.airbnb_wifi_ssid,
    u.airbnb_wifi_password,
    u.airbnb_house_rules,
    u.airbnb_check_out_instructions,
    p.id as property_id,
    p.name as property_name,
    p.address as property_address,
    p.city as property_city,
    p.color as property_color,
    m.name as cleaner_name,
    m.email as cleaner_email,
    b.guest_name as booking_guest_name,
    b.check_in_date as booking_check_in_date,
    b.check_out_date as booking_check_out_date,
    b.num_guests as booking_num_guests
  FROM cleaning_tasks ct
  JOIN units u ON u.id = ct.unit_id
  JOIN properties p ON p.id = u.property_id
  LEFT JOIN organization_members m ON m.id = ct.cleaner_id
  LEFT JOIN airbnb_bookings b ON b.id = ct.booking_id
`;

app.get("/api/cleaners", async (c) => {
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) return c.json({ cleaners: [] });

  const cleaners = await query(
    `SELECT id, organization_id, user_id, email, name, role, status
     FROM organization_members
     WHERE organization_id = ? AND status = 'active' AND (role = 'cleaner' OR role = 'manager')
     ORDER BY CASE role WHEN 'cleaner' THEN 1 ELSE 2 END, name ASC`,
    [activeOrgId]
  );
  return c.json({ cleaners });
});

app.get("/api/cleaning-tasks", async (c) => {
  const activeOrgId = await getActiveOrganizationId(c);
  if (!activeOrgId) return c.json({ tasks: [] });

  const role = await getUserOrgRole(c, activeOrgId);
  const currentMember = await getCurrentMember(c, activeOrgId);

  const where: string[] = ["ct.organization_id = ?"];
  const params: unknown[] = [activeOrgId];

  // If cleaner, automatically filter tasks to their own or unassigned tasks
  if (role === "cleaner" && currentMember) {
    where.push("(ct.cleaner_id = ? OR ct.cleaner_id IS NULL)");
    params.push(currentMember.id);
  } else {
    const cleanerIdParam = intParam(c.req.query("cleaner_id"));
    if (cleanerIdParam) {
      where.push("ct.cleaner_id = ?");
      params.push(cleanerIdParam);
    }
  }

  const unitIdParam = intParam(c.req.query("unit_id"));
  if (unitIdParam) {
    where.push("ct.unit_id = ?");
    params.push(unitIdParam);
  }

  const statusParam = c.req.query("status");
  if (statusParam) {
    where.push("ct.status = ?");
    params.push(statusParam);
  }

  const fromDate = c.req.query("from_date");
  if (fromDate) {
    where.push("ct.scheduled_date >= ?");
    params.push(fromDate);
  }

  const toDate = c.req.query("to_date");
  if (toDate) {
    where.push("ct.scheduled_date <= ?");
    params.push(toDate);
  }

  const sql = `
    ${CLEANING_TASK_SELECT}
    WHERE ${where.join(" AND ")}
    ORDER BY
      CASE ct.status
        WHEN 'in_progress' THEN 1
        WHEN 'scheduled' THEN 2
        WHEN 'completed' THEN 3
        ELSE 4
      END,
      ct.scheduled_date ASC,
      ct.scheduled_time ASC
  `;

  const tasks = await query(sql, params);
  return c.json({ tasks });
});

app.get("/api/cleaning-tasks/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (allowedOrgIds.length === 0) return c.json({ error: "Not found" }, 404);

  const placeholders = allowedOrgIds.map(() => "?").join(",");
  const task = await get(
    `${CLEANING_TASK_SELECT} WHERE ct.id = ? AND ct.organization_id IN (${placeholders})`,
    [id, ...allowedOrgIds]
  );
  if (!task) return c.json({ error: "Task not found" }, 404);
  return c.json({ task });
});

const CleaningTaskInput = z.object({
  unit_id: z.number().int(),
  booking_id: z.number().int().optional().nullable(),
  cleaner_id: z.number().int().optional().nullable(),
  scheduled_date: z.string().min(10),
  scheduled_time: z.string().default("11:00"),
  next_check_in_date: z.string().optional().nullable(),
  next_check_in_time: z.string().default("15:00").optional().nullable(),
  checklist: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

app.post("/api/cleaning-tasks", async (c) => {
  const parsed = await parseJson(c, CleaningTaskInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const d = parsed.data;

  const unit = await get<{
    id: number; name: string; property_id: number; airbnb_lockbox_code: string | null;
    cleaner_id: number | null; cleaning_checklist: string | null;
  }>(
    "SELECT id, name, property_id, airbnb_lockbox_code, cleaner_id, cleaning_checklist FROM units WHERE id = ?",
    [d.unit_id]
  );
  if (!unit) return c.json({ error: "Unit not found" }, 404);

  const prop = await get<{ id: number; name: string; address: string; organization_id: number }>(
    "SELECT id, name, address, organization_id FROM properties WHERE id = ?",
    [unit.property_id]
  );
  if (!prop) return c.json({ error: "Property not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(prop.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const role = await getUserOrgRole(c, prop.organization_id);
  if (role === "viewer" || role === "cleaner") {
    return c.json({ error: "Viewers and cleaners cannot schedule new cleaning tasks" }, 403);
  }

  const cleanerId = d.cleaner_id ?? unit.cleaner_id;
  const checklist = d.checklist || unit.cleaning_checklist || JSON.stringify([
    { id: "1", text: "Strip bed linens and wash at 60°C", done: false },
    { id: "2", text: "Make bed with fresh crisp sheets, pillowcases & duvet", done: false },
    { id: "3", text: "Clean & sanitize bathroom (shower, toilet, sink & mirrors)", done: false },
    { id: "4", text: "Restock fresh bath towels, hand towels & toilet paper", done: false },
    { id: "5", text: "Clean kitchen counters, sink & empty refrigerator/microwave", done: false },
    { id: "6", text: "Restock coffee pods, tea bags, sugar & welcome water", done: false },
    { id: "7", text: "Vacuum all rugs and mop hardwood floors throughout", done: false },
    { id: "8", text: "Empty all trash bins and replace with fresh liners", done: false },
    { id: "9", text: "Confirm Wi-Fi card visible, TV remotes working & key in lockbox", done: false }
  ]);

  const result = await run(
    `INSERT INTO cleaning_tasks (
      organization_id, unit_id, booking_id, cleaner_id,
      scheduled_date, scheduled_time, next_check_in_date, next_check_in_time,
      status, checklist, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?)`,
    [
      prop.organization_id,
      unit.id,
      d.booking_id ?? null,
      cleanerId ?? null,
      d.scheduled_date,
      d.scheduled_time || "11:00",
      d.next_check_in_date ?? null,
      d.next_check_in_time || "15:00",
      checklist,
      d.notes ?? null,
    ]
  );

  const newTaskId = Number(result.lastInsertRowid);
  const task = await get(`${CLEANING_TASK_SELECT} WHERE ct.id = ?`, [newTaskId]);

  if (cleanerId) {
    const cleaner = await get<{ name: string; email: string }>(
      "SELECT name, email FROM organization_members WHERE id = ?",
      [cleanerId]
    );
    if (cleaner && cleaner.email) {
      try {
        const appUrl = (c.req.header("Origin") || "http://localhost:5173") + "/cleaner";
        const emailCfg = await getEmailConfig(c);
        const emailHtml = renderCleaningAssignmentEmailHtml({
          cleanerName: cleaner.name,
          unitName: unit.name,
          propertyName: prop.name,
          propertyAddress: prop.address,
          scheduledDate: d.scheduled_date,
          scheduledTime: d.scheduled_time || "11:00",
          nextCheckInDate: d.next_check_in_date ?? undefined,
          nextCheckInTime: d.next_check_in_time || "15:00",
          lockboxCode: unit.airbnb_lockbox_code ?? undefined,
          notes: d.notes ?? undefined,
          appUrl,
        });

        await sendEmail(emailCfg, {
          to: cleaner.email,
          subject: `New Turnover Cleaning Assigned: ${unit.name} on ${d.scheduled_date}`,
          html: emailHtml,
          text: `You have been assigned a cleaning task at ${unit.name} (${prop.name}) on ${d.scheduled_date} at ${d.scheduled_time || '11:00'}. Access Code: ${unit.airbnb_lockbox_code || 'N/A'}. Details: ${appUrl}`,
        });
      } catch (err) {
        console.error("Failed to send cleaner assignment email:", err);
      }
    }
  }

  return c.json({ task }, 201);
});

const UpdateCleaningTaskInput = z.object({
  cleaner_id: z.number().int().optional().nullable(),
  scheduled_date: z.string().optional(),
  scheduled_time: z.string().optional(),
  next_check_in_date: z.string().optional().nullable(),
  next_check_in_time: z.string().optional().nullable(),
  status: z.enum(["scheduled", "in_progress", "completed", "cancelled"]).optional(),
  checklist: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  issue_reported: z.string().optional().nullable(),
  inspection_photos: z.string().optional().nullable(),
});

app.put("/api/cleaning-tasks/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);

  const existing = await get<{
    id: number; organization_id: number; unit_id: number; cleaner_id: number | null;
    status: string; scheduled_date: string; scheduled_time: string;
  }>("SELECT id, organization_id, unit_id, cleaner_id, status, scheduled_date, scheduled_time FROM cleaning_tasks WHERE id = ?", [id]);
  if (!existing) return c.json({ error: "Task not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(existing.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const parsed = await parseJson(c, UpdateCleaningTaskInput);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);
  const data = parsed.data;

  const sets: string[] = [];
  const params: unknown[] = [];

  if (data.cleaner_id !== undefined) { sets.push("cleaner_id = ?"); params.push(data.cleaner_id); }
  if (data.scheduled_date !== undefined) { sets.push("scheduled_date = ?"); params.push(data.scheduled_date); }
  if (data.scheduled_time !== undefined) { sets.push("scheduled_time = ?"); params.push(data.scheduled_time); }
  if (data.next_check_in_date !== undefined) { sets.push("next_check_in_date = ?"); params.push(data.next_check_in_date); }
  if (data.next_check_in_time !== undefined) { sets.push("next_check_in_time = ?"); params.push(data.next_check_in_time); }
  if (data.checklist !== undefined) { sets.push("checklist = ?"); params.push(data.checklist); }
  if (data.notes !== undefined) { sets.push("notes = ?"); params.push(data.notes); }
  if (data.issue_reported !== undefined) { sets.push("issue_reported = ?"); params.push(data.issue_reported); }
  if (data.inspection_photos !== undefined) { sets.push("inspection_photos = ?"); params.push(data.inspection_photos); }

  if (data.status !== undefined) {
    sets.push("status = ?");
    params.push(data.status);

    if (data.status === "in_progress") {
      sets.push("started_at = COALESCE(started_at, datetime('now'))");
      await run("UPDATE units SET status = 'turnover' WHERE id = ?", [existing.unit_id]);
    } else if (data.status === "completed") {
      sets.push("completed_at = datetime('now')");
      // Turn unit status to vacant and ready for incoming guests
      await run("UPDATE units SET status = 'vacant' WHERE id = ?", [existing.unit_id]);
    }
  }

  sets.push("updated_at = datetime('now')");
  params.push(id);

  await run(`UPDATE cleaning_tasks SET ${sets.join(", ")} WHERE id = ?`, params);

  const updatedTask = await get(`${CLEANING_TASK_SELECT} WHERE ct.id = ?`, [id]);

  // If marked completed, notify managers via email
  if (data.status === "completed" && existing.status !== "completed") {
    try {
      const unit = await get<{ name: string; property_id: number }>("SELECT name, property_id FROM units WHERE id = ?", [existing.unit_id]);
      const prop = unit ? await get<{ name: string }>("SELECT name FROM properties WHERE id = ?", [unit.property_id]) : null;
      const cleaner = existing.cleaner_id ? await get<{ name: string }>("SELECT name FROM organization_members WHERE id = ?", [existing.cleaner_id]) : null;
      const managers = await query<{ email: string }>(
        "SELECT email FROM organization_members WHERE organization_id = ? AND role IN ('owner', 'admin', 'manager') AND email != ''",
        [existing.organization_id]
      );
      const emailCfg = await getEmailConfig(c);
      const appUrl = (c.req.header("Origin") || "http://localhost:5173") + "/airbnb";

      const html = renderCleaningCompletedEmailHtml({
        cleanerName: cleaner?.name || "Cleaner",
        unitName: unit?.name || "Unit",
        propertyName: prop?.name || "Property",
        completedTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        notes: data.notes || undefined,
        issueReported: data.issue_reported || undefined,
        appUrl,
      });

      for (const m of managers) {
        sendEmail(emailCfg, {
          to: m.email,
          subject: `✨ Unit Ready: ${unit?.name || 'Unit'} has been cleaned!`,
          html,
          text: `${unit?.name} (${prop?.name}) was cleaned by ${cleaner?.name || 'cleaner'} and is ready for guests.`,
        }).catch(() => {});
      }
    } catch (e) {
      console.error("Failed to dispatch cleaning completion notification:", e);
    }
  }

  return c.json({ task: updatedTask });
});

app.post("/api/cleaning-tasks/:id/send-reminder", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);

  const task = await get<{
    id: number; organization_id: number; unit_id: number; cleaner_id: number | null;
    scheduled_date: string; scheduled_time: string; notes: string | null;
  }>("SELECT id, organization_id, unit_id, cleaner_id, scheduled_date, scheduled_time, notes FROM cleaning_tasks WHERE id = ?", [id]);
  if (!task) return c.json({ error: "Task not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(task.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  if (!task.cleaner_id) {
    return c.json({ error: "No cleaner is assigned to this task" }, 400);
  }

  const cleaner = await get<{ name: string; email: string }>(
    "SELECT name, email FROM organization_members WHERE id = ?",
    [task.cleaner_id]
  );
  if (!cleaner || !cleaner.email) {
    return c.json({ error: "Assigned cleaner has no email address" }, 400);
  }

  const unit = await get<{ name: string; property_id: number; airbnb_lockbox_code: string | null }>(
    "SELECT name, property_id, airbnb_lockbox_code FROM units WHERE id = ?",
    [task.unit_id]
  );
  const prop = unit ? await get<{ name: string; address: string }>("SELECT name, address FROM properties WHERE id = ?", [unit.property_id]) : null;

  const appUrl = (c.req.header("Origin") || "http://localhost:5173") + "/cleaner";
  const emailCfg = await getEmailConfig(c);
  const html = renderCleaningReminderEmailHtml({
    cleanerName: cleaner.name,
    unitName: unit?.name || "Unit",
    propertyName: prop?.name || "Property",
    propertyAddress: prop?.address || "",
    scheduledDate: task.scheduled_date,
    scheduledTime: task.scheduled_time,
    lockboxCode: unit?.airbnb_lockbox_code || undefined,
    notes: task.notes || undefined,
    appUrl,
  });

  const res = await sendEmail(emailCfg, {
    to: cleaner.email,
    subject: `⏰ Turnover Reminder: ${unit?.name || 'Unit'} on ${task.scheduled_date}`,
    html,
    text: `Reminder: you have a turnover cleaning scheduled at ${unit?.name} (${prop?.name}) on ${task.scheduled_date} at ${task.scheduled_time}. Key code: ${unit?.airbnb_lockbox_code || 'N/A'}. Details: ${appUrl}`,
  });

  await run("UPDATE cleaning_tasks SET reminder_sent_at = datetime('now') WHERE id = ?", [id]);

  return c.json({ ok: res.ok, email_result: res, reminder_sent_at: new Date().toISOString() });
});

app.delete("/api/cleaning-tasks/:id", async (c) => {
  const id = intParam(c.req.param("id"));
  if (!id) return c.json({ error: "Invalid ID" }, 400);

  const task = await get<{ organization_id: number }>("SELECT organization_id FROM cleaning_tasks WHERE id = ?", [id]);
  if (!task) return c.json({ error: "Task not found" }, 404);

  const allowedOrgIds = await getUserAllowedOrgIds(c);
  if (!allowedOrgIds.includes(task.organization_id)) {
    return c.json({ error: "Access denied" }, 403);
  }

  const role = await getUserOrgRole(c, task.organization_id);
  if (role === "viewer" || role === "cleaner") {
    return c.json({ error: "Forbidden: only owners, admins, or managers can delete tasks" }, 403);
  }

  await run("DELETE FROM cleaning_tasks WHERE id = ?", [id]);
  return c.json({ ok: true });
});

// ── Health ─────────────────────────────────────────────────────────

app.get("/api/health", (c) => c.json({ ok: true }));

export default app;
