export async function apiFetch(input: RequestInfo, init: RequestInit = {}) {
  const res = await fetch(input, { credentials: 'include', ...init, headers: { ...(init.headers || {}) } });
  if (!res.ok) throw new Error(await res.text().catch(() => res.statusText));
  return res;
}

export const jsonFetch = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const res = await apiFetch(url, init);
  return res.json();
};

export const jsonWrite = async <T>(url: string, method: 'POST'|'PUT'|'DELETE', body?: any): Promise<T> => {
  const res = await apiFetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.json();
};