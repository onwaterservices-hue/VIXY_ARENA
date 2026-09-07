/* =============================================================
   ONE HTTP CLIENT for every Http*Source. Cookies travel with
   every request (same-origin, or credentials on the app origin).
   Errors carry the server's own message; the interface shows it
   verbatim rather than inventing a friendlier lie.
   ============================================================= */
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export async function apiFetch<T>(baseUrl: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(baseUrl + path, {
    method: init.method ?? 'GET',
    credentials: 'include',
    headers: init.body === undefined ? {} : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  if (!res.ok) {
    const e = (json ?? {}) as { error?: string; message?: string };
    throw new ApiError(res.status, e.error ?? `http_${res.status}`, e.message ?? `The server answered ${res.status}.`);
  }
  return json as T;
}
