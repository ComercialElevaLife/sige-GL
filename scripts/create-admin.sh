#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="rg-sige-ergo-prod"
POSTGRES_SERVER="psql-sige-gl-prod"
POSTGRES_HOST="${POSTGRES_SERVER}.postgres.database.azure.com"
POSTGRES_USER="sigeadmin"
CONNECTION="host=$POSTGRES_HOST port=5432 dbname=postgres user=$POSTGRES_USER sslmode=require"

echo "SIGE GL · criar ou atualizar administrador"
echo "As senhas não serão mostradas na tela."
read -r -p "Seu e-mail para entrar no SIGE GL: " ADMIN_EMAIL
read -r -s -p "Senha do banco PostgreSQL: " PGPASSWORD
echo
read -r -s -p "Crie a senha do seu acesso de administrador: " ADMIN_PASSWORD
echo

if [[ -z "$ADMIN_EMAIL" || -z "$PGPASSWORD" || ${#ADMIN_PASSWORD} -lt 8 ]]; then
  echo "Preencha o e-mail, a senha do banco e uma senha de acesso com pelo menos 8 caracteres."
  exit 1
fi
export PGPASSWORD

psql "$CONNECTION" -v ON_ERROR_STOP=1 -v admin_email="$ADMIN_EMAIL" -v admin_password="$ADMIN_PASSWORD" <<'SQL'
alter table app_user alter column client_ids type text[] using client_ids::text[];
insert into app_user (name, email, password_hash, role, client_ids, active)
values ('Administrador ElevaLife', :'admin_email', crypt(:'admin_password', gen_salt('bf')), 'admin', '{}', true)
on conflict (email) do update set
  name = excluded.name,
  password_hash = excluded.password_hash,
  role = 'admin',
  client_ids = '{}',
  active = true,
  invitation_token_hash = null,
  invitation_expires_at = null;
SQL

unset PGPASSWORD ADMIN_PASSWORD
echo "Pronto. Administrador criado/atualizado. Entre no SIGE GL com o e-mail e a senha que você informou."
