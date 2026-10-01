export type TokenProvider = () => Promise<string | null> | string | null;

let tokenProvider: TokenProvider | null = null;

export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
}

export async function api<T>(method: string, path: string, body?: unknown, customHeaders?: Record<string, string>): Promise<T> {
  const headers: Record<string, string> = { ...customHeaders };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
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
