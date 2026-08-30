export function isXanoConfigured(): boolean {
  return Boolean(process.env.XANO_API_BASE);
}

async function request(method: string, path: string, body?: unknown, query?: Record<string, string>) {
  const url = new URL(process.env.XANO_API_BASE! + path);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(process.env.XANO_API_TOKEN ? { Authorization: `Bearer ${process.env.XANO_API_TOKEN}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Xano HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

export const xano = {
  get: (path: string, query?: Record<string, string>) => request("GET", path, undefined, query),
  post: (path: string, body: unknown) => request("POST", path, body),
  patch: (path: string, body: unknown) => request("PATCH", path, body),
};