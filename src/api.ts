const K = 'apimeter_token'
export const token = () => localStorage.getItem(K)
export const setToken = (t: string | null) => (t ? localStorage.setItem(K, t) : localStorage.removeItem(K))

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || r.statusText)
  return j
}
