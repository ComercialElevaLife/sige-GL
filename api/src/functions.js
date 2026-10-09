import { app } from "@azure/functions";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { query } from "./db.js";

const json = (body, status = 200) => ({
  status,
  jsonBody: body,
  headers: { "content-type": "application/json; charset=utf-8" },
});

const configurationError = (error) => json({ error: error.message }, 503);

function secret() {
  if (!process.env.AUTH_JWT_SECRET) throw new Error("Autenticação ainda não configurada.");
  return process.env.AUTH_JWT_SECRET;
}

function userFrom(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Sessão não informada.");
  return jwt.verify(token, secret());
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
      return json({ token: jwt.sign(user, secret(), { expiresIn: "8h" }), user });
    } catch (error) {
      return configurationError(error);
    }
  },
});

app.http("bootstrap", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "bootstrap",
  handler: async (request) => {
    try {
      const user = userFrom(request);
      await stateStore();
      const snapshot = await query("select payload from app_state where id = 1");
      if (snapshot.rows[0]) {
        return json({ user, initialized: true, data: scopedSnapshot(snapshot.rows[0].payload, user) });
      }
      const values = user.role === "admin" ? [] : [user.clientIds];
      const clause = user.role === "admin" ? "" : " where client_id = any($1::uuid[])";
      const [clients, units, sectors, locations, people, schedules, classes, attendance] = await Promise.all([
        query(user.role === "admin" ? "select * from client order by name" : "select * from client where id = any($1::uuid[]) order by name", values),
        query(`select * from unit${clause} order by name`, values),
        query(`select * from sector${clause} order by name`, values),
        query(`select * from class_location${clause} order by name`, values),
        query(`select * from person${clause} order by name`, values),
        query(`select * from class_schedule${clause} order by weekday, time`, values),
        query(`select * from class_session${clause} order by occurred_at desc`, values),
        query(`select a.* from attendance a join person p on p.id = a.person_id${user.role === "admin" ? "" : " where p.client_id = any($1::uuid[])"}`, values),
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
      const user = userFrom(request);
      if (user.role === "client") return json({ error: "Usuário cliente possui acesso somente de visualização." }, 403);
      const { state } = await request.json();
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
