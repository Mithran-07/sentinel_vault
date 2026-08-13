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
    credentials: "include",
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
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  if (data.accessToken) {
    sessionStorage.setItem("accessToken", data.accessToken);
    if (data.refreshToken) localStorage.setItem("refreshToken", data.refreshToken);
    return true;
  }
  return false;
}

export const api = {
  post: (path: string, body?: unknown) => request(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: (path: string, body?: unknown) => request(path, { method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: (path: string, body?: unknown) => request(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  get: (path: string) => request(path),
  del: (path: string, body?: unknown) => request(path, { method: "DELETE", body: body !== undefined ? JSON.stringify(body) : undefined }),
};
