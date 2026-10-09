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

export const centralUsers = (token) => request("/users", { token });

export const centralCreateUser = (token, user) => request("/users", {
  method: "POST",
  token,
  body: JSON.stringify(user),
});

export const centralUpdateUser = (token, id, user) => request(`/users/${id}`, {
  method: "PATCH",
  token,
  body: JSON.stringify(user),
});

export const centralDeleteUser = (token, id) => request(`/users/${id}`, {
  method: "DELETE",
  token,
});

export const centralReinviteUser = (token, id) => request(`/users/${id}`, {
  method: "POST",
  token,
});

export const centralActivate = (invite, password) => request("/auth/activate", {
  method: "POST",
  body: JSON.stringify({ token: invite, password }),
});

export const centralRequestReset = (email) => request("/auth/password-reset", {
  method: "POST",
  body: JSON.stringify({ email }),
});

export const centralResetPassword = (reset, password) => request("/auth/reset-password", {
  method: "POST",
  body: JSON.stringify({ token: reset, password }),
});
