import { app } from "@azure/functions";
import { EmailClient } from "@azure/communication-email";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { query } from "./db.js";

let userSchemaReady;
let sessionStoreReady;

const json = (body, status = 200) => ({
  status,
  jsonBody: body,
  headers: { "content-type": "application/json; charset=utf-8" },
});

const configurationError = (error) => json({ error: error.message }, 503);

async function userFrom(request, suppliedToken = "") {
  const token = suppliedToken || request.headers.get("x-sige-session") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sessão não informada.");
  await sessionStore();
  const result = await query(
    `select u.id, u.name, u.email, u.role, u.client_ids, u.active
     from app_session s join app_user u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > now() and u.active`,
    [tokenHash(token)],
  );
  const account = result.rows[0];
  if (!account) throw new Error("Sessão expirada. Entre novamente.");
  return { id: account.id, name: account.name, email: account.email, role: account.role, clientIds: account.client_ids || [] };
}

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    clientIds: row.client_ids || [],
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

async function requireAdmin(request) {
  const user = await userFrom(request);
  if (user.role !== "admin") throw new Error("Acesso restrito ao administrador.");
  return user;
}

function normalizeClientIds(role, input) {
  const ids = [...new Set((Array.isArray(input) ? input : []).filter(Boolean))];
  if (role === "admin") return [];
  if (role === "professor" && ids.length) return ids;
  if (role === "client" && ids.length === 1) return ids;
  throw new Error(role === "professor"
    ? "Professor deve possuir ao menos uma empresa vinculada."
    : "Usuário cliente deve possuir uma única empresa vinculada.");
}

function publicUrl(request, token, kind) {
  const origin = process.env.APP_PUBLIC_URL || request.headers.get("origin") || "";
  if (!origin) return null;
  const url = new URL(origin);
  url.searchParams.set(kind, token);
  return url.toString();
}

async function sendAccessEmail({ to, name, url, subject, intro }) {
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
        html: `<p>Olá, ${name}.</p><p>${intro}</p><p><a href="${url}">Acessar SIGE GL</a></p><p>Se você não solicitou este acesso, ignore esta mensagem.</p>`,
      },
    });
    await poller.pollUntilDone();
    return { sent: true, configured: true };
  } catch {
    // O acesso continua válido: o administrador recebe o link de contingência.
    return { sent: false, configured: true };
  }
}

async function stateStore() {
  await query(`
    create table if not exists app_state (
      id smallint primary key check (id = 1),
      payload jsonb not null,
      updated_by uuid references app_user(id),
      updated_at timestamptz not null default now()
    )
  `);
}

async function userStore() {
  userSchemaReady ??= query("alter table app_user alter column client_ids type text[] using client_ids::text[];");
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
  const people = (data.people || []).filter((item) => allowedClients.has(item.clientId));
  const personIds = new Set(people.map((item) => item.id));
  const units = (data.units || []).filter((item) => allowedClients.has(item.clientId));
  const unitIds = new Set(units.map((item) => item.id));
  const attendance = Object.fromEntries(
    Object.entries(state?.attendance || {}).filter(([personId]) => personIds.has(personId)),
  );
  return {
    ...state,
    data: {
      clients: (data.clients || []).filter((item) => allowedClients.has(item.id)),
      units,
      sectors: (data.sectors || []).filter((item) => unitIds.has(item.unitId)),
      locations: (data.locations || []).filter((item) => unitIds.has(item.unitId)),
      people,
    },
    schedules: (state?.schedules || []).filter((item) => allowedClients.has(item.clientId)),
    classes: (state?.classes || []).filter((item) => allowedClients.has(item.clientId)),
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
      await userStore();
      const result = await query(
        "select id, name, email, password_hash, role, client_ids, active from app_user where lower(email) = lower($1)",
        [email],
      );
      const account = result.rows[0];
      if (!account?.active || !(await bcrypt.compare(password || "", account.password_hash))) {
        return json({ error: "E-mail ou senha inválidos." }, 401);
      }
      const user = {
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
        clientIds: account.client_ids || [],
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
      const url = publicUrl(request, token, "reset");
      await sendAccessEmail({
        to: account.email,
        name: account.name,
        url,
        subject: "Redefinição de senha · SIGE GL",
        intro: "Recebemos uma solicitação para redefinir sua senha.",
      });
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
      return json({ message: "Senha redefinida. Você já pode entrar." });
    } catch (error) {
      return configurationError(error);
    }
  },
});

app.http("users", {
  methods: ["GET", "POST"],
  authLevel: "anonymous",
  route: "users",
  handler: async (request) => {
    try {
      await requireAdmin(request);
      await userStore();
      if (request.method === "GET") {
        const result = await query("select id, name, email, role, client_ids, active, created_at from app_user order by name");
        return json({ users: result.rows.map(publicUser) });
      }
      const { name, email, role, clientIds } = await request.json();
      if (!name?.trim() || !email?.trim() || !["admin", "professor", "client"].includes(role)) {
        return json({ error: "Nome, e-mail e perfil válido são obrigatórios." }, 400);
      }
      const invitation = accessToken();
      const ids = normalizeClientIds(role, clientIds);
      const result = await query(
        `insert into app_user (name, email, password_hash, role, client_ids, active, invitation_token_hash, invitation_expires_at)
         values ($1, lower($2), $3, $4, $5::text[], false, $6, now() + interval '7 days')
         returning id, name, email, role, client_ids, active, created_at`,
        [name.trim(), email.trim(), await bcrypt.hash(accessToken(), 12), role, ids, tokenHash(invitation)],
      );
      const account = result.rows[0];
      const invitationUrl = publicUrl(request, invitation, "invite");
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

app.http("userById", {
  methods: ["PATCH", "DELETE", "POST"],
  authLevel: "anonymous",
  route: "users/{id}",
  handler: async (request) => {
    try {
      const actor = await requireAdmin(request);
      await userStore();
      const id = request.params.get("id");
      if (request.method === "DELETE") {
        if (id === actor.id) return json({ error: "Não é permitido excluir o próprio acesso." }, 400);
        await query("delete from app_user where id = $1", [id]);
        return json({ deleted: true });
      }
      if (request.method === "POST") {
        const found = await query("select * from app_user where id = $1", [id]);
        const account = found.rows[0];
        if (!account) return json({ error: "Usuário não encontrado." }, 404);
        const invitation = accessToken();
        await query(
          `update app_user set active = false, invitation_token_hash = $1,
           invitation_expires_at = now() + interval '7 days' where id = $2`,
          [tokenHash(invitation), id],
        );
        const invitationUrl = publicUrl(request, invitation, "invite");
        const delivery = await sendAccessEmail({
          to: account.email,
          name: account.name,
          url: invitationUrl,
          subject: "Novo convite · SIGE GL",
          intro: "Um novo convite de acesso ao SIGE GL foi gerado. Defina sua senha para continuar.",
        });
        return json({ invitationUrl: delivery.sent ? undefined : invitationUrl, delivery });
      }
      const { name, email, role, clientIds, active } = await request.json();
      if (!name?.trim() || !email?.trim() || !["admin", "professor", "client"].includes(role)) {
        return json({ error: "Nome, e-mail e perfil válido são obrigatórios." }, 400);
      }
      const result = await query(
        `update app_user set name = $1, email = lower($2), role = $3,
         client_ids = $4::text[], active = $5 where id = $6
         returning id, name, email, role, client_ids, active, created_at`,
        [name.trim(), email.trim(), role, normalizeClientIds(role, clientIds), active !== false, id],
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
      const snapshot = await query("select payload from app_state where id = 1");
      if (snapshot.rows[0]) {
        return json({ user, initialized: true, data: scopedSnapshot(snapshot.rows[0].payload, user) });
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
      const { state, session } = await request.json();
      const user = await userFrom(request, session);
      if (user.role === "client") return json({ error: "Usuário cliente possui acesso somente de visualização." }, 403);
      if (!state || typeof state !== "object") return json({ error: "Estado de sincronização inválido." }, 400);
      await stateStore();
      let nextState = state;
      if (user.role === "professor") {
        const stored = await query("select payload from app_state where id = 1");
        if (!stored.rows[0]) return json({ error: "A base mestre ainda não foi inicializada por um administrador." }, 409);
        nextState = mergeProfessorSnapshot(stored.rows[0].payload, scopedSnapshot(state, user), user);
      }
      await query(
        `insert into app_state (id, payload, updated_by, updated_at)
         values (1, $1::jsonb, $2, now())
         on conflict (id) do update set payload = excluded.payload, updated_by = excluded.updated_by, updated_at = now()`,
        [JSON.stringify(nextState), user.id],
      );
      return json({ synchronizedAt: new Date().toISOString() }, 202);
    } catch (error) {
      return configurationError(error);
    }
  },
});
