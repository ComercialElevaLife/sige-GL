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
      const { operations = [] } = await request.json();
      // The frontend sends immutable audit operations. Full validation and writes
      // are enabled after the production schema is provisioned.
      await query(
        "insert into sync_queue (user_id, payload, received_at) values ($1, $2::jsonb, now())",
        [user.id, JSON.stringify(operations)],
      );
      return json({ accepted: operations.length, receivedAt: new Date().toISOString() }, 202);
    } catch (error) {
      return configurationError(error);
    }
  },
});
