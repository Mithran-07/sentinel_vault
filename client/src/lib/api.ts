const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

function getAccessToken(): string | null {
  return typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
}

export function setTokens(accessToken: string, refreshToken?: string) {
  sessionStorage.setItem("accessToken", accessToken);
  if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
}

export function clearTokens() {
  sessionStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
}

async function request(path: string, options: RequestInit = {}, retry = true): Promise<Response> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request(path, options, false);
  }
  return res;
}

async function tryRefresh(): Promise<boolean> {
  const refreshToken = typeof window !== "undefined" ? localStorage.getItem("refreshToken") : null;
  if (!refreshToken) return false;
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  sessionStorage.setItem("accessToken", data.accessToken);
  return true;
}

export const api = {
  post: (path: string, body: unknown) => request(path, { method: "POST", body: JSON.stringify(body) }),
  put: (path: string, body: unknown) => request(path, { method: "PUT", body: JSON.stringify(body) }),
  get: (path: string) => request(path),
  del: (path: string) => request(path, { method: "DELETE" }),
};
