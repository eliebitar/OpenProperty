export type TokenProvider = () => Promise<string | null> | string | null;

let tokenProvider: TokenProvider | null = null;
let activeOrgId: number | null = null;
let simulatedUserEmail: string | null = null;

export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export function getActiveOrganizationId(): number | null {
  if (activeOrgId) return activeOrgId;
  try {
    const stored = localStorage.getItem("openproperty:active_org_id");
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        activeOrgId = parsed;
        return parsed;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function setActiveOrganizationId(id: number | null): void {
  activeOrgId = id;
  try {
    if (id) {
      localStorage.setItem("openproperty:active_org_id", String(id));
    } else {
      localStorage.removeItem("openproperty:active_org_id");
    }
  } catch {
    /* ignore */
  }
}

export function getSimulatedUser(): string | null {
  if (simulatedUserEmail) return simulatedUserEmail;
  try {
    return localStorage.getItem("openproperty:simulated_user");
  } catch {
    return null;
  }
}

export function setSimulatedUser(email: string | null): void {
  simulatedUserEmail = email;
  try {
    if (email) {
      localStorage.setItem("openproperty:simulated_user", email);
    } else {
      localStorage.removeItem("openproperty:simulated_user");
    }
  } catch {
    /* ignore */
  }
}

export async function api<T>(method: string, path: string, body?: unknown, customHeaders?: Record<string, string>): Promise<T> {
  const headers: Record<string, string> = { ...customHeaders };

  const orgId = getActiveOrganizationId();
  if (orgId && !headers["X-Organization-Id"]) {
    headers["X-Organization-Id"] = String(orgId);
  }

  if (tokenProvider) {
    try {
      const token = await tokenProvider();
      if (token && !headers["Authorization"]) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn("Failed to get token from tokenProvider:", err);
    }
  }

  // Only send simulated user header if there is NO authenticated token!
  if (!headers["Authorization"]) {
    const simUser = getSimulatedUser();
    if (simUser && !headers["X-Simulated-User"]) {
      headers["X-Simulated-User"] = simUser;
    }
  }

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const opts: RequestInit = {
    method,
    headers,
  };

  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  const r = await fetch(path, opts);
  let data: unknown = null;
  try {
    data = await r.json();
  } catch {
    /* empty body */
  }

  if (!r.ok) {
    if (r.status === 401) {
      window.dispatchEvent(new CustomEvent("openproperty:unauthorized", { detail: { path, status: 401 } }));
    }
    const msg = (data as { error?: string; message?: string } | null)?.message ||
      (data as { error?: string } | null)?.error ||
      `${r.status} ${r.statusText}`;
    throw new Error(msg);
  }

  return data as T;
}
