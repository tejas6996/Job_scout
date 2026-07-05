// Thin client for the JobScout API. In dev, Vite proxies /api to the backend,
// so the default empty base (same-origin relative requests) just works.
const BASE = import.meta.env.VITE_API_BASE || '';

export async function fetchJobs(params = {}, signal) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === '' || value == null || value === false) continue;
    qs.set(key, String(value));
  }

  const res = await fetch(`${BASE}/api/jobs?${qs.toString()}`, { signal });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore body parse errors */
    }
    throw new Error(message);
  }
  return res.json();
}
