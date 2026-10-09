const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "content-type": "application/json", ...(options.token ? { authorization: `Bearer ${options.token}` } : {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Não foi possível comunicar com o servidor.");
  return body;
}

export const centralLogin = (email, password) => request("/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
});

export const centralBootstrap = (token) => request("/bootstrap", { token });

export const centralSync = (token, state) => request("/sync", {
  method: "POST",
  token,
  body: JSON.stringify({ state }),
});
