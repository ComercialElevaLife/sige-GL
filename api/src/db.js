import pg from "pg";

let pool;

export function database() {
  if (!process.env.POSTGRES_CONNECTION_STRING) {
    throw new Error("Banco de dados ainda não configurado.");
  }
  pool ??= new pg.Pool({
    connectionString: process.env.POSTGRES_CONNECTION_STRING,
    ssl: process.env.POSTGRES_SSL === "false" ? false : { rejectUnauthorized: false },
  });
  return pool;
}

export async function query(text, values = []) {
  return database().query(text, values);
}
