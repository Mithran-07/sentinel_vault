const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

function getAccessToken(): string | null {
  return typeof window !== "undefined" ? sessionStorage.getItem("accessToken") : null;
}

export function setTokens(accessToken: string, _legacyRefreshToken?: string) {
  sessionStorage.setItem("accessToken", accessToken);
  // Security: Do NOT persist refresh token to localStorage. Refresh token is transported exclusively via HttpOnly cookie.
  if (typeof window !== "undefined") {
    localStorage.removeItem("refreshToken");
  }
}

export function clearTokens() {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
  }
}

async function request(path: string, options: RequestInit = {}, retry = true): Promise<Response> {
  const token = getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "SentinelVault",
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
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "SentinelVault",
      },
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (data.accessToken) {
      sessionStorage.setItem("accessToken", data.accessToken);
      return true;
    }
  } catch {
    return false;
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

export interface Wallet {
  id: string;
  name: string;
  isDefault: boolean;
  type: string;
  _count?: { vaultItems: number };
}

export const walletApi = {
  list: () => api.get("/wallets").then(res => res.json() as Promise<Wallet[]>),
  create: (name: string, type: string) => api.post("/wallets", { name, type }).then(res => res.json() as Promise<Wallet>),
  update: (id: string, name: string) => api.put(`/wallets/${id}`, { name }).then(res => res.json() as Promise<Wallet>),
  delete: (id: string) => api.del(`/wallets/${id}`),
};
