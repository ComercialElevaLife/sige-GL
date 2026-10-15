import { app } from "@azure/functions";
import { EmailClient } from "@azure/communication-email";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { query, database } from "./db.js";

let userSchemaReady;
let sessionStoreReady;

const json = (body, status = 200) => ({
  status,
  jsonBody: body,
  headers: { "content-type": "application/json; charset=utf-8" },
});

// Erros esperados carregam o status HTTP correto e uma mensagem segura para o usuário.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Qualquer outro erro (banco, rede, bug) vira 500 com mensagem genérica; o detalhe fica só no log do servidor.
const configurationError = (error) => {
  if (error?.code === "23505") return json({ error: "Já existe um usuário com este e-mail." }, 409);
  if (error?.code === "22P02") return json({ error: "Identificador inválido." }, 400);
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error?.message === "Banco de dados ainda não configurado.") {
    return json({ error: "Serviço temporariamente indisponível." }, 503);
  }
  console.error("sige-gl-api", error);
  return json({ error: "Não foi possível concluir a operação. Tente novamente." }, 500);
};

async function userFrom(request, suppliedToken = "") {
  const token = suppliedToken || request.headers.get("x-sige-session") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Sessão não informada.");
  await userStore();
  await sessionStore();
  const result = await query(
    `select u.id, u.name, u.email, u.role, u.client_ids, u.unit_ids, u.sector_ids, u.active
     from app_session s join app_user u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now() and u.active`,
    [tokenHash(token)],
  );
  const account = result.rows[0];
  if (!account) throw new HttpError(401, "Sessão expirada. Entre novamente.");
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    clientIds: account.client_ids || [],
    unitIds: account.unit_ids || [],
    sectorIds: account.sector_ids || [],
  };
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    clientIds: row.client_ids || [],
    unitIds: row.unit_ids || [],
    sectorIds: row.sector_ids || [],
    active: row.active,
    createdAt: row.created_at,
  };
}

function accessToken() {
  return randomBytes(32).toString("base64url");
}

function tokenHash(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function requireAdmin(request, suppliedToken = "") {
  const user = await userFrom(request, suppliedToken);
  if (user.role !== "admin") throw new HttpError(403, "Acesso restrito ao administrador.");
  return user;
}

// Gestor do cliente (role "client") pode ser restrito a unidades e/ou setores da empresa. Sem marcação, vê a empresa toda.
function normalizeScope(role, input) {
  if (role !== "client") return [];
  return [...new Set((Array.isArray(input) ? input : []).map((item) => String(item ?? "").trim()).filter(Boolean))].slice(0, 200);
}

function normalizeClientIds(role, input) {
  const ids = [...new Set((Array.isArray(input) ? input : []).filter(Boolean))];
  if (role === "admin") return [];
  if (role === "professor" && ids.length) return ids;
  if (role === "client" && ids.length === 1) return ids;
  throw new HttpError(400, role === "professor"
    ? "Professor deve possuir ao menos uma empresa vinculada."
    : "Usuário cliente deve possuir uma única empresa vinculada.");
}

// O link enviado por e-mail usa APP_PUBLIC_URL. Sem ela, só aceita o Origin da própria aplicação
// (Static Web Apps ou domínio elevalife.com.br); um Origin qualquer permitiria envenenar o link.
function publicUrl(request, token, kind) {
  let origin = process.env.APP_PUBLIC_URL || "";
  if (!origin) {
    const candidate = request.headers.get("origin") || "";
    try {
      const host = new URL(candidate).hostname;
      if (host.endsWith(".azurestaticapps.net") || host === "elevalife.com.br" || host.endsWith(".elevalife.com.br")) origin = candidate;
    } catch {
      origin = "";
    }
  }
  if (!origin) throw new HttpError(500, "Endereço público do aplicativo não configurado. Avise o administrador do sistema.");
  const url = new URL(origin);
  url.searchParams.set(kind, token);
  return url.toString();
}

// Limite simples de tentativas de login por e-mail e origem de rede (por instância da função).
const loginAttempts = new Map();
function loginThrottle(key, failed = false) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const entry = (loginAttempts.get(key) || []).filter((time) => now - time < windowMs);
  if (failed) entry.push(now);
  loginAttempts.set(key, entry);
  if (loginAttempts.size > 5000) loginAttempts.clear();
  return entry.length;
}

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Envio pela caixa sige@elevalife.com.br via Microsoft Graph (mesmo aplicativo registrado do SIGE Ergo).
// Variáveis: GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_CAIXA_ENVIO.
let graphToken = { value: null, expiresAt: 0 };

const graphConfigured = () =>
  Boolean(process.env.GRAPH_TENANT_ID && process.env.GRAPH_CLIENT_ID && process.env.GRAPH_CLIENT_SECRET && process.env.GRAPH_CAIXA_ENVIO);

async function getGraphToken() {
  if (graphToken.value && Date.now() < graphToken.expiresAt - 30000) return graphToken.value;
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(process.env.GRAPH_TENANT_ID)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GRAPH_CLIENT_ID,
        client_secret: process.env.GRAPH_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }).toString(),
    },
  );
  if (!response.ok) throw new Error(`Graph token HTTP ${response.status}`);
  const data = await response.json();
  graphToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return graphToken.value;
}

function accessEmailHtml({ name, url, intro }) {
  const safeUrl = escapeHtml(url);
  return `<div style="background:#F5EFEA;padding:24px;font-family:Montserrat,Segoe UI,Arial,sans-serif;color:#3A2A2E">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #EADDE0;border-radius:12px;overflow:hidden">
    <div style="background:#5E2A30;color:#fff;padding:18px 24px;font-size:18px;font-weight:600">SIGE GL · ElevaLife</div>
    <div style="padding:24px;font-size:15px;line-height:1.6">
      <p>Olá, ${escapeHtml(name)}.</p>
      <p>${escapeHtml(intro)}</p>
      <p style="margin:28px 0"><a href="${safeUrl}" style="background:#8B3A42;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">Acessar o SIGE GL</a></p>
      <p style="color:#8A7A78;font-size:13px">Se o botão não funcionar, copie e cole este link no navegador:<br>${safeUrl}</p>
      <p style="color:#8A7A78;font-size:13px">Se você não solicitou este acesso, ignore esta mensagem.</p>
    </div>
  </div>
</div>`;
}

async function sendViaGraph({ to, name, url, subject, intro }) {
  const token = await getGraphToken();
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.GRAPH_CAIXA_ENVIO)}/sendMail`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: accessEmailHtml({ name, url, intro }) },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: true,
      }),
    },
  );
  return response.ok;
}

async function sendAccessEmail({ to, name, url, subject, intro }) {
  if (graphConfigured()) {
    try {
      return { sent: await sendViaGraph({ to, name, url, subject, intro }), configured: true };
    } catch {
      return { sent: false, configured: true };
    }
  }
  if (process.env.EMAIL_WEBHOOK_URL) {
    try {
      const response = await fetch(process.env.EMAIL_WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, name, subject, intro, url, application: "SIGE GL" }),
      });
      return { sent: response.ok, configured: true };
    } catch {
      return { sent: false, configured: true };
    }
  }
  if (!process.env.AZURE_COMMUNICATION_CONNECTION_STRING || !process.env.EMAIL_SENDER_ADDRESS) {
    return { sent: false, configured: false };
  }
  try {
    const client = new EmailClient(process.env.AZURE_COMMUNICATION_CONNECTION_STRING);
    const poller = await client.beginSend({
      senderAddress: process.env.EMAIL_SENDER_ADDRESS,
      recipients: { to: [{ address: to, displayName: name }] },
      content: {
        subject,
        plainText: `${intro}\n\nAcesse: ${url}\n\nSe você não solicitou este acesso, ignore esta mensagem.`,
        html: accessEmailHtml({ name, url, intro }),
      },
    });
    await poller.pollUntilDone();
    return { sent: true, configured: true };
  } catch {
    // O acesso continua válido: o administrador recebe o link de contingência.
    return { sent: false, configured: true };
  }
}

let stateStoreReady;
async function stateStore() {
  stateStoreReady ??= (async () => {
    await query(`
      create table if not exists app_state (
        id smallint primary key check (id = 1),
        payload jsonb not null,
        updated_by uuid references app_user(id),
        updated_at timestamptz not null default now()
      )
    `);
    // Versão dos cadastros: sobe só quando o administrador grava. Gravação de professor não altera.
    await query("alter table app_state add column if not exists registry_version integer not null default 0");
  })().catch((error) => {
    stateStoreReady = undefined;
    throw error;
  });
  await stateStoreReady;
}

// Chave de matrícula por empresa, sem diferença de caixa nem espaços nas pontas.
const registrationKey = (person) => `${person?.clientId}|${String(person?.registration ?? "").trim().toLowerCase()}`;
function registrationCounts(state) {
  const counts = new Map();
  for (const person of state?.data?.people || []) {
    if (!String(person?.registration ?? "").trim()) continue;
    const key = registrationKey(person);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}
// Matrícula repetida na mesma empresa que não existia antes desta gravação. Duplicidades antigas não bloqueiam.
function newDuplicateRegistration(stored, incoming) {
  const before = registrationCounts(stored);
  for (const [key, count] of registrationCounts(incoming)) {
    if (count > 1 && count > (before.get(key) || 1)) return key.split("|")[1];
  }
  return null;
}

// Migração única de client_ids para text[]: só altera a tabela se o tipo ainda não for lista de textos.
async function userStore() {
  userSchemaReady ??= (async () => {
    const column = await query(
      "select data_type from information_schema.columns where table_name = 'app_user' and column_name = 'client_ids'",
    );
    if (column.rows[0] && column.rows[0].data_type !== "ARRAY") {
      await query("alter table app_user alter column client_ids type text[] using client_ids::text[]");
    }
    // Escopo opcional do gestor do cliente: colunas aditivas, vazias para todos os usuários existentes.
    await query("alter table app_user add column if not exists unit_ids text[] not null default '{}'");
    await query("alter table app_user add column if not exists sector_ids text[] not null default '{}'");
  })().catch((error) => {
    userSchemaReady = undefined;
    throw error;
  });
  await userSchemaReady;
}

async function sessionStore() {
  sessionStoreReady ??= query(`
    create table if not exists app_session (
      token_hash text primary key,
      user_id uuid not null references app_user(id) on delete cascade,
      expires_at timestamptz not null,
      created_at timestamptz not null default now()
    )
  `);
  await sessionStoreReady;
}

function scopedSnapshot(state, user) {
  if (user.role === "admin") return state;
  const allowedClients = new Set(user.clientIds || []);
  const data = state?.data || {};
  // Gestor do cliente restrito a unidades e/ou setores: o servidor só entrega esse recorte.
  const unitScope = new Set(user.role === "client" ? user.unitIds || [] : []);
  const sectorScope = new Set(user.role === "client" ? user.sectorIds || [] : []);
  const restricted = unitScope.size > 0 || sectorScope.size > 0;
  const inScope = (item) =>
    !restricted || ((!unitScope.size || unitScope.has(item.unitId)) && (!sectorScope.size || sectorScope.has(item.sectorId)));
  const people = (data.people || []).filter((item) => allowedClients.has(item.clientId) && inScope(item));
  const personIds = new Set(people.map((item) => item.id));
  const companyUnits = (data.units || []).filter((item) => allowedClients.has(item.clientId));
  const companyUnitIds = new Set(companyUnits.map((item) => item.id));
  const sectors = (data.sectors || []).filter(
    (item) =>
      companyUnitIds.has(item.unitId) &&
      (!restricted || ((!unitScope.size || unitScope.has(item.unitId)) && (!sectorScope.size || sectorScope.has(item.id)))),
  );
  const units = restricted
    ? companyUnits.filter((item) => (!unitScope.size || unitScope.has(item.id)) && sectors.some((sector) => sector.unitId === item.id))
    : companyUnits;
  const unitIds = new Set(units.map((item) => item.id));
  const attendance = Object.fromEntries(
    Object.entries(state?.attendance || {}).filter(([personId]) => personIds.has(personId)),
  );
  return {
    ...state,
    data: {
      clients: (data.clients || []).filter((item) => allowedClients.has(item.id)),
      units,
      workShifts: (data.workShifts || []).filter((item) => allowedClients.has(item.clientId)),
      routines: data.routines || [],
      sectors,
      locations: (data.locations || []).filter((item) => unitIds.has(item.unitId)),
      people,
    },
    schedules: (state?.schedules || []).filter((item) => allowedClients.has(item.clientId) && inScope(item)),
    classes: (state?.classes || []).filter((item) => allowedClients.has(item.clientId) && inScope(item)),
    attendance,
    // Professor não precisa dos logs operacionais de outros profissionais;
    // cliente não recebe logs de auditoria.
    audit: user.role === "professor"
      ? (state?.audit || []).filter((item) => item.teacherId === user.id)
      : [],
  };
}

function mergeProfessorSnapshot(current, incoming, user) {
  const allowedClients = new Set(user.clientIds || []);
  const currentData = current?.data || {};
  const incomingData = incoming?.data || {};
  const allowedPeople = new Set(
    (currentData.people || []).filter((item) => allowedClients.has(item.clientId)).map((item) => item.id),
  );
  const incomingPeople = new Set((incomingData.people || []).map((item) => item.id));
  return {
    ...current,
    classes: [
      ...(current.classes || []).filter((item) => !allowedClients.has(item.clientId)),
      ...(incoming.classes || []).filter((item) => allowedClients.has(item.clientId)),
    ],
    attendance: {
      ...Object.fromEntries(Object.entries(current.attendance || {}).filter(([personId]) => !allowedPeople.has(personId))),
      ...Object.fromEntries(Object.entries(incoming.attendance || {}).filter(([personId]) => incomingPeople.has(personId) && allowedPeople.has(personId))),
    },
    audit: [
      ...(current.audit || []).filter((item) => item.teacherId !== user.id),
      ...(incoming.audit || []).filter((item) => item.teacherId === user.id),
    ],
  };
}

app.http("health", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "health",
  handler: async () => json({ status: "ok", service: "sige-gl-api", time: new Date().toISOString() }),
});

app.http("login", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/login",
  handler: async (request) => {
    try {
      const { email, password } = await request.json();
      const throttleKey = `${String(email || "").toLowerCase()}|${request.headers.get("x-forwarded-for") || ""}`;
      if (loginThrottle(throttleKey) >= 8) {
        return json({ error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }, 429);
      }
      await userStore();
      const result = await query(
        "select id, name, email, password_hash, role, client_ids, unit_ids, sector_ids, active from app_user where lower(email) = lower($1)",
        [String(email || "")],
      );
      const account = result.rows[0];
      if (!account?.active || !(await bcrypt.compare(String(password || ""), account.password_hash))) {
        loginThrottle(throttleKey, true);
        return json({ error: "E-mail ou senha inválidos." }, 401);
      }
      const user = {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        clientIds: account.client_ids || [],
        unitIds: account.unit_ids || [],
        sectorIds: account.sector_ids || [],
      };
      await sessionStore();
      const token = accessToken();
      await query(
        `insert into app_session (token_hash, user_id, expires_at)
         values ($1, $2, now() + interval '8 hours')`,
        [tokenHash(token), account.id],
      );
      return json({ token, user });
    } catch (error) {
      return configurationError(error);
    }
  },
});

app.http("activateAccount", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/activate",
  handler: async (request) => {
    try {
      const { token, password } = await request.json();
      if (!token || !password || password.length < 8) return json({ error: "Defina uma senha com pelo menos 8 caracteres." }, 400);
      const result = await query(
        `select * from app_user
         where invitation_token_hash = $1 and invitation_expires_at > now()`,
        [tokenHash(token)],
      );
      const account = result.rows[0];
      if (!account) return json({ error: "Este convite expirou ou já foi utilizado." }, 400);
      await query(
        `update app_user set password_hash = $1, active = true,
         invitation_token_hash = null, invitation_expires_at = null where id = $2`,
        [await bcrypt.hash(password, 12), account.id],
      );
      await sessionStore();
      await query("delete from app_session where user_id = $1", [account.id]);
      return json({ message: "Senha definida. Você já pode entrar." });
    } catch (error) {
      return configurationError(error);
    }
  },
});

app.http("requestPasswordReset", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/password-reset",
  handler: async (request) => {
    try {
      const { email } = await request.json();
      const result = await query("select * from app_user where lower(email) = lower($1) and active", [email || ""]);
      const account = result.rows[0];
      if (!account) return json({ message: "Se o e-mail estiver cadastrado, você receberá as instruções." }, 202);
      const token = accessToken();
      await query(
        `update app_user set reset_token_hash = $1,
         reset_expires_at = now() + interval '60 minutes' where id = $2`,
        [tokenHash(token), account.id],
      );
      try {
        await sendAccessEmail({
          to: account.email,
          name: account.name,
          url: publicUrl(request, token, "reset"),
          subject: "Redefinição de senha · SIGE GL",
          intro: "Recebemos uma solicitação para redefinir sua senha.",
        });
      } catch (error) {
        console.error("sige-gl-api reset", error);
      }
      return json({ message: "Se o e-mail estiver cadastrado, você receberá as instruções." }, 202);
    } catch (error) {
      return configurationError(error);
    }
  },
});

app.http("resetPassword", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/reset-password",
  handler: async (request) => {
    try {
      const { token, password } = await request.json();
      if (!token || !password || password.length < 8) return json({ error: "Defina uma senha com pelo menos 8 caracteres." }, 400);
      const result = await query(
        `select * from app_user where reset_token_hash = $1 and reset_expires_at > now()`,
        [tokenHash(token)],
      );
      const account = result.rows[0];
      if (!account) return json({ error: "Este link expirou ou já foi utilizado." }, 400);
      await query(
        `update app_user set password_hash = $1, reset_token_hash = null,
         reset_expires_at = null where id = $2`,
        [await bcrypt.hash(password, 12), account.id],
      );
      await sessionStore();
      await query("delete from app_session where user_id = $1", [account.id]);
      return json({ message: "Senha redefinida. Você já pode entrar." });
    } catch (error) {
      return configurationError(error);
    }
  },
});

app.http("logout", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "auth/logout",
  handler: async (request) => {
    try {
      const body = await request.json().catch(() => ({}));
      const token = body.session || request.headers.get("x-sige-session") || "";
      if (token) {
        await sessionStore();
        await query("delete from app_session where token_hash = $1", [tokenHash(token)]);
      }
      return json({ loggedOut: true });
    } catch (error) {
      return configurationError(error);
    }
  },
});

app.http("users", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "users",
  handler: async (request) => {
    try {
      const { name, email, role, clientIds, unitIds, sectorIds, session } = await request.json();
      await requireAdmin(request, session);
      await userStore();
      if (!name?.trim() || !email?.trim() || !["admin", "professor", "client"].includes(role)) {
        return json({ error: "Nome, e-mail e perfil válido são obrigatórios." }, 400);
      }
      const invitation = accessToken();
      const invitationUrl = publicUrl(request, invitation, "invite");
      const ids = normalizeClientIds(role, clientIds);
      const result = await query(
        `insert into app_user (name, email, password_hash, role, client_ids, unit_ids, sector_ids, active, invitation_token_hash, invitation_expires_at)
         values ($1, lower($2), $3, $4, $5::text[], $7::text[], $8::text[], false, $6, now() + interval '7 days')
         returning id, name, email, role, client_ids, unit_ids, sector_ids, active, created_at`,
        [name.trim(), email.trim(), await bcrypt.hash(accessToken(), 12), role, ids, tokenHash(invitation), normalizeScope(role, unitIds), normalizeScope(role, sectorIds)],
      );
      const account = result.rows[0];
      const delivery = await sendAccessEmail({
        to: account.email,
        name: account.name,
        url: invitationUrl,
        subject: "Primeiro acesso · SIGE GL",
        intro: "Seu acesso ao SIGE GL foi criado. Defina sua senha para começar.",
      });
      return json({ user: publicUser(account), invitationUrl: delivery.sent ? undefined : invitationUrl, delivery }, 201);
    } catch (error) {
      return configurationError(error);
    }
  },
});

app.http("usersList", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "users-list",
  handler: async (request) => {
    try {
      const { session } = await request.json();
      await requireAdmin(request, session);
      await userStore();
      const result = await query("select id, name, email, role, client_ids, unit_ids, sector_ids, active, created_at from app_user order by name");
      return json({ users: result.rows.map(publicUser) });
    } catch (error) {
      return configurationError(error);
    }
  },
});

app.http("userById", {
  methods: ["PATCH", "DELETE", "POST"],
  authLevel: "anonymous",
  route: "users/{id}",
  handler: async (request) => {
    try {
      const payload = await request.json().catch(() => ({}));
      const actor = await requireAdmin(request, payload.session);
      await userStore();
      const id = request.params.id;
      if (request.method === "DELETE") {
        if (id === actor.id) return json({ error: "Não é permitido excluir o próprio acesso." }, 400);
        await query("delete from app_user where id = $1", [id]);
        return json({ deleted: true });
      }
      if (request.method === "POST") {
        const found = await query("select * from app_user where id = $1", [id]);
        const account = found.rows[0];
        if (!account) return json({ error: "Usuário não encontrado." }, 404);
        if (account.active) {
          return json({ error: "Este usuário já definiu a senha. Use \"Esqueci minha senha\" para redefinir o acesso." }, 409);
        }
        const invitation = accessToken();
        const invitationUrl = publicUrl(request, invitation, "invite");
        await query(
          `update app_user set invitation_token_hash = $1,
           invitation_expires_at = now() + interval '7 days' where id = $2`,
          [tokenHash(invitation), id],
        );
        const delivery = await sendAccessEmail({
          to: account.email,
          name: account.name,
          url: invitationUrl,
          subject: "Novo convite · SIGE GL",
          intro: "Um novo convite de acesso ao SIGE GL foi gerado. Defina sua senha para continuar.",
        });
        return json({ invitationUrl: delivery.sent ? undefined : invitationUrl, delivery });
      }
      const { name, email, role, clientIds, unitIds, sectorIds, active } = payload;
      if (!name?.trim() || !email?.trim() || !["admin", "professor", "client"].includes(role)) {
        return json({ error: "Nome, e-mail e perfil válido são obrigatórios." }, 400);
      }
      if (id === actor.id && (role !== "admin" || active === false)) {
        return json({ error: "Não é permitido remover o próprio acesso de administrador." }, 400);
      }
      const result = await query(
        `update app_user set name = $1, email = lower($2), role = $3,
         client_ids = $4::text[], unit_ids = $7::text[], sector_ids = $8::text[], active = coalesce($5::boolean, active) where id = $6
         returning id, name, email, role, client_ids, unit_ids, sector_ids, active, created_at`,
        [name.trim(), email.trim(), role, normalizeClientIds(role, clientIds), typeof active === "boolean" ? active : null, id, normalizeScope(role, unitIds), normalizeScope(role, sectorIds)],
      );
      if (!result.rows[0]) return json({ error: "Usuário não encontrado." }, 404);
      return json({ user: publicUser(result.rows[0]) });
    } catch (error) {
      return configurationError(error);
    }
  },
});

app.http("bootstrap", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "bootstrap",
  handler: async (request) => {
    try {
      const { session } = await request.json();
      const user = await userFrom(request, session);
      await stateStore();
      const snapshot = await query("select payload, registry_version from app_state where id = 1");
      if (snapshot.rows[0]) {
        return json({ user, initialized: true, registryVersion: snapshot.rows[0].registry_version, data: scopedSnapshot(snapshot.rows[0].payload, user) });
      }
      const values = user.role === "admin" ? [] : [user.clientIds];
      const clause = user.role === "admin" ? "" : " where client_id::text = any($1::text[])";
      const [clients, units, sectors, locations, people, schedules, classes, attendance] = await Promise.all([
        query(user.role === "admin" ? "select * from client order by name" : "select * from client where id::text = any($1::text[]) order by name", values),
        query(`select * from unit${clause} order by name`, values),
        query(`select * from sector${clause} order by name`, values),
        query(`select * from class_location${clause} order by name`, values),
        query(`select * from person${clause} order by name`, values),
        query(`select * from class_schedule${clause} order by weekday, time`, values),
        query(`select * from class_session${clause} order by occurred_at desc`, values),
        query(`select a.* from attendance a join person p on p.id = a.person_id${user.role === "admin" ? "" : " where p.client_id::text = any($1::text[])"}`, values),
      ]);
      return json({
        user,
        initialized: false,
        data: {
          clients: clients.rows, units: units.rows, sectors: sectors.rows, locations: locations.rows,
          people: people.rows, schedules: schedules.rows, classes: classes.rows, attendance: attendance.rows,
        },
      });
    } catch (error) {
      return configurationError(error);
    }
  },
});

app.http("sync", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "sync",
  handler: async (request) => {
    try {
      const { state, session, baseVersion } = await request.json();
      const user = await userFrom(request, session);
      if (user.role === "client") return json({ error: "Usuário cliente possui acesso somente de visualização." }, 403);
      if (!state || typeof state !== "object") return json({ error: "Estado de sincronização inválido." }, 400);
      await stateStore();
      const stored = await query("select payload, registry_version from app_state where id = 1");
      if (user.role === "professor") {
        if (!stored.rows[0]) return json({ error: "A base mestre ainda não foi inicializada por um administrador." }, 409);
        const merged = mergeProfessorSnapshot(stored.rows[0].payload, scopedSnapshot(state, user), user);
        await query("update app_state set payload = $1::jsonb, updated_by = $2, updated_at = now() where id = 1", [JSON.stringify(merged), user.id]);
        return json({ synchronizedAt: new Date().toISOString(), registryVersion: stored.rows[0].registry_version }, 202);
      }
      // Administrador: só grava se partiu da versão atual dos cadastros; senão alguém gravou antes e o app precisa recarregar.
      const conflict = (version) => json({
        error: "Os cadastros foram alterados por outra pessoa. Recarregue para ver a versão atual antes de editar de novo.",
        conflict: true,
        registryVersion: version,
      }, 409);
      const current = stored.rows[0];
      if (current) {
        if (!Number.isInteger(baseVersion) || baseVersion !== current.registry_version) return conflict(current.registry_version);
        const duplicate = newDuplicateRegistration(current.payload, state);
        if (duplicate) return json({ error: `Matrícula ${duplicate} repetida na mesma empresa. Corrija o cadastro antes de gravar.` }, 422);
        const saved = await query(
          `update app_state set payload = $1::jsonb, updated_by = $2, updated_at = now(), registry_version = registry_version + 1
           where id = 1 and registry_version = $3 returning registry_version`,
          [JSON.stringify(state), user.id, baseVersion],
        );
        if (!saved.rows[0]) return conflict((await query("select registry_version from app_state where id = 1")).rows[0]?.registry_version);
        return json({ synchronizedAt: new Date().toISOString(), registryVersion: saved.rows[0].registry_version }, 202);
      }
      const duplicate = newDuplicateRegistration(null, state);
      if (duplicate) return json({ error: `Matrícula ${duplicate} repetida na mesma empresa. Corrija o cadastro antes de gravar.` }, 422);
      const created = await query(
        `insert into app_state (id, payload, updated_by, updated_at, registry_version)
         values (1, $1::jsonb, $2, now(), 1) on conflict (id) do nothing returning registry_version`,
        [JSON.stringify(state), user.id],
      );
      if (!created.rows[0]) return conflict((await query("select registry_version from app_state where id = 1")).rows[0]?.registry_version);
      return json({ synchronizedAt: new Date().toISOString(), registryVersion: created.rows[0].registry_version }, 202);
    } catch (error) {
      return configurationError(error);
    }
  },
});

// ---------------------------------------------------------------------------
// Aula, presença por aula e foto de evidência (um registro por documento).
// Tabelas novas e aditivas: não alteram app_state nem as tabelas existentes.
// A foto é só evidência de auditoria: não há comparação nem reconhecimento facial.
// ---------------------------------------------------------------------------
let aulaStoreReady;
async function aulaStore() {
  aulaStoreReady ??= (async () => {
    await query(`
      create table if not exists aula (
        id text primary key,
        client_id text not null,
        unit_id text,
        sector_id text,
        location_id text,
        shift text,
        roteiro text,
        status text not null check (status in ('applied', 'cancelled')),
        cancelled_by text,
        cancellation_reason text,
        teacher_id uuid references app_user(id) on delete set null,
        representative_registration text,
        representative_person_id text,
        representative_name text,
        representative_method text check (representative_method in ('qr', 'matricula')),
        certificate text,
        latitude numeric(10, 6),
        longitude numeric(10, 6),
        accuracy numeric(10, 2),
        started_at timestamptz,
        device_closed_at timestamptz,
        closed_at timestamptz not null default now(),
        photo_status text not null default 'none' check (photo_status in ('captured', 'skipped', 'none'))
      )`);
    await query(`create index if not exists aula_client_closed_idx on aula (client_id, closed_at)`);
    await query(`
      create table if not exists presenca (
        aula_id text not null references aula(id) on delete cascade,
        person_id text not null,
        status text not null check (status in ('present', 'absent', 'missing')),
        method text,
        recorded_at timestamptz,
        primary key (aula_id, person_id)
      )`);
    await query(`
      create table if not exists evidencia_foto (
        aula_id text primary key references aula(id) on delete cascade,
        image bytea not null,
        mime text not null default 'image/jpeg',
        bytes integer not null,
        created_at timestamptz not null default now(),
        discard_at timestamptz not null
      )`);
  })();
  try {
    await aulaStoreReady;
  } catch (error) {
    aulaStoreReady = undefined;
    throw error;
  }
}

const PHOTO_MAX_BYTES = 400 * 1024;
const photoRetentionDays = () => Math.max(1, Number(process.env.FOTO_RETENCAO_DIAS) || 90);
const cleanText = (value, max = 120) => (value == null ? null : String(value).trim().slice(0, max) || null);
const cleanNumber = (value) => (Number.isFinite(Number(value)) && value !== "" && value != null ? Number(value) : null);
const cleanDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

app.http("saveClass", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "aulas",
  handler: async (request) => {
    try {
      const body = await request.json();
      const user = await userFrom(request, body.session);
      if (user.role === "client") throw new HttpError(403, "Usuário cliente possui acesso somente de visualização.");
      const a = body.aula || {};
      const id = String(a.id || "");
      if (!/^AULA-[A-Za-z0-9-]{4,60}$/.test(id)) throw new HttpError(400, "Identificador da aula inválido.");
      const clientId = cleanText(a.clientId, 64);
      if (!clientId) throw new HttpError(400, "Empresa da aula não informada.");
      if (user.role === "professor" && !user.clientIds.includes(clientId)) throw new HttpError(403, "Empresa fora do seu escopo.");
      const status = a.status === "cancelled" ? "cancelled" : "applied";
      await aulaStore();

      // Reenvio da fila offline: a aula já gravada não é duplicada.
      const existing = await query("select id, closed_at from aula where id = $1", [id]);
      if (existing.rows[0]) return json({ id, duplicate: true, closedAt: existing.rows[0].closed_at });

      // Fechamento conferido: a matrícula do representante precisa existir no cadastro da empresa.
      let representative = { person_id: null, name: null };
      if (status === "applied") {
        const registration = cleanText(a.representativeRegistration, 64);
        if (!registration) throw new HttpError(400, "Informe a matrícula do representante do local.");
        const found = await query(
          `select p->>'id' as person_id, p->>'name' as name
           from app_state s, jsonb_array_elements(coalesce(s.payload->'data'->'people', '[]'::jsonb)) p
           where s.id = 1 and p->>'clientId' = $1
             and lower(btrim(p->>'registration')) = lower(btrim($2))
             and coalesce(p->>'active', 'true') <> 'false'
           limit 1`,
          [clientId, registration],
        );
        if (!found.rows[0]) throw new HttpError(422, "Matrícula do representante não encontrada no cadastro desta empresa.");
        representative = found.rows[0];
      }

      let photo = null;
      if (body.photo) {
        const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.photo));
        if (!match) throw new HttpError(400, "Foto inválida. Envie uma imagem JPEG.");
        photo = Buffer.from(match[1], "base64");
        if (!photo.length || photo.length > PHOTO_MAX_BYTES) throw new HttpError(413, "Foto grande demais.");
      }

      const presences = (Array.isArray(body.presencas) ? body.presencas : []).slice(0, 1000);
      const valid = new Set(["present", "absent", "missing"]);
      const rows = presences.filter((item) => item?.personId && valid.has(item.status));

      const client = await database().connect();
      try {
        await client.query("begin");
        await client.query(
          `insert into aula (id, client_id, unit_id, sector_id, location_id, shift, roteiro, status, cancelled_by, cancellation_reason,
             teacher_id, representative_registration, representative_person_id, representative_name, representative_method, certificate,
             latitude, longitude, accuracy, started_at, device_closed_at, photo_status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
          [
            id, clientId, cleanText(a.unitId, 64), cleanText(a.sectorId, 64), cleanText(a.locationId, 64), cleanText(a.shift, 60), cleanText(a.roteiro, 120),
            status, cleanText(a.cancelledBy, 20), cleanText(a.reason, 200),
            user.id, cleanText(a.representativeRegistration, 64), representative.person_id, representative.name,
            a.representativeMethod === "qr" ? "qr" : status === "applied" ? "matricula" : null, cleanText(a.certificate, 64),
            cleanNumber(a.location?.latitude), cleanNumber(a.location?.longitude), cleanNumber(a.location?.accuracy),
            cleanDate(a.startedAt), cleanDate(a.at), photo ? "captured" : status === "applied" && body.photoSkipped ? "skipped" : "none",
          ],
        );
        if (rows.length) {
          await client.query(
            `insert into presenca (aula_id, person_id, status, method, recorded_at)
             select $1::text, * from unnest($2::text[], $3::text[], $4::text[], $5::timestamptz[])`,
            [id, rows.map((r) => String(r.personId).slice(0, 64)), rows.map((r) => r.status), rows.map((r) => cleanText(r.method, 20)), rows.map((r) => cleanDate(r.at))],
          );
        }
        if (photo) {
          await client.query(
            `insert into evidencia_foto (aula_id, image, bytes, discard_at) values ($1, $2, $3, now() + make_interval(days => $4::int))`,
            [id, photo, photo.length, photoRetentionDays()],
          );
        }
        await client.query("commit");
      } catch (error) {
        await client.query("rollback").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      // O Static Web Apps só executa funções HTTP: o descarte das fotos vencidas roda a cada gravação.
      await query("delete from evidencia_foto where discard_at < now()").catch(() => {});
      const saved = await query("select closed_at from aula where id = $1", [id]);
      return json({ id, closedAt: saved.rows[0]?.closed_at, representativeName: representative.name }, 201);
    } catch (error) {
      return configurationError(error);
    }
  },
});

app.http("classPhoto", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "aulas-foto",
  handler: async (request) => {
    try {
      const body = await request.json();
      const user = await userFrom(request, body.session);
      if (user.role === "client") throw new HttpError(403, "A foto de evidência é de uso interno da ElevaLife.");
      await aulaStore();
      const result = await query(
        `select a.client_id, f.image, f.mime, f.created_at, f.discard_at
         from evidencia_foto f join aula a on a.id = f.aula_id
         where f.aula_id = $1 and f.discard_at > now()`,
        [String(body.id || "")],
      );
      const row = result.rows[0];
      if (!row) throw new HttpError(404, "Foto não encontrada ou já descartada.");
      if (user.role !== "admin" && !user.clientIds.includes(row.client_id)) throw new HttpError(403, "Empresa fora do seu escopo.");
      return json({ image: `data:${row.mime};base64,${row.image.toString("base64")}`, capturedAt: row.created_at, discardAt: row.discard_at });
    } catch (error) {
      return configurationError(error);
    }
  },
});

// Aulas e presenças de um período (base dos indicadores). Cliente e professor só veem as empresas do seu escopo.
app.http("classList", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "aulas-lista",
  handler: async (request) => {
    try {
      const body = await request.json();
      const user = await userFrom(request, body.session);
      const from = cleanDate(body.from);
      const to = cleanDate(body.to);
      if (!from || !to || from >= to) throw new HttpError(400, "Período inválido.");
      if (new Date(to) - new Date(from) > 370 * 24 * 3600 * 1000) throw new HttpError(400, "Período máximo de 12 meses.");
      await aulaStore();
      const scoped = user.role !== "admin";
      // Gestor do cliente restrito a unidades/setores só recebe aulas desse recorte (aulas sem unidade/setor ficam de fora).
      const unitScope = user.role === "client" ? user.unitIds : [];
      const sectorScope = user.role === "client" ? user.sectorIds : [];
      const aulas = await query(
        `select id, client_id, unit_id, sector_id, location_id, shift, status, closed_at, photo_status
         from aula
         where closed_at >= $1 and closed_at < $2 and ($3::boolean = false or client_id = any($4::text[]))
           and (cardinality($5::text[]) = 0 or unit_id = any($5::text[]))
           and (cardinality($6::text[]) = 0 or sector_id = any($6::text[]))
         order by closed_at
         limit 5000`,
        [from, to, scoped, user.clientIds, unitScope, sectorScope],
      );
      const ids = aulas.rows.map((row) => row.id);
      const presences = ids.length
        ? await query("select aula_id, person_id, status from presenca where aula_id = any($1::text[])", [ids])
        : { rows: [] };
      return json({
        aulas: aulas.rows.map((r) => ({ id: r.id, clientId: r.client_id, unitId: r.unit_id, sectorId: r.sector_id, locationId: r.location_id, shift: r.shift, status: r.status, closedAt: r.closed_at, photoStatus: r.photo_status })),
        presencas: presences.rows.map((r) => ({ aulaId: r.aula_id, personId: r.person_id, status: r.status })),
      });
    } catch (error) {
      return configurationError(error);
    }
  },
});
