// apps/server/src/lib/api.ts
const API_BASE =
  import.meta.env.VITE_API_BASE ?? "http://127.0.0.1:8000";

function assertApiBase() {
  if (!API_BASE || typeof API_BASE !== "string") {
    throw new Error("VITE_API_BASE is missing. Create apps/server/.env.development with VITE_API_BASE=http://127.0.0.1:8000 and restart `npm run dev`.");
  }
}

export async function ping() {
  assertApiBase();
  const url = `${API_BASE}/healthz`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ping failed: ${res.status}`);
  return res.json();
}

export async function startOptimization(spec: any) {
  assertApiBase();
  const url = `${API_BASE}/start-optimization`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spec }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${res.statusText} at ${url}\n${text}`);
    }
    return (await res.json()) as { job_id: string };
  } catch (err: any) {
    // This makes the browser alert show the real reason (CORS, refused, etc.)
    throw new Error(`Fetch to ${url} failed: ${err?.message || err}`);
  }
}

export async function getJob(jobId: string) {
  assertApiBase();
  const url = `${API_BASE}/job/${encodeURIComponent(jobId)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status}`);
  return res.json();
}
