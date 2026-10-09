#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="rg-sige-ergo-prod"
POSTGRES_SERVER="psql-sige-gl-prod"
STATIC_APP="sige-ergo-elevalife-prod"
POSTGRES_HOST="${POSTGRES_SERVER}.postgres.database.azure.com"
POSTGRES_USER="sigeadmin"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Comando obrigatório não encontrado: $1" >&2
    exit 1
  }
}

need az
need psql
need python3
need curl
need openssl

echo "SIGE GL · configuração central Azure"
echo "Os valores de senha não serão exibidos."

read -r -s -p "Defina uma NOVA senha forte para o banco PostgreSQL: " DB_PASSWORD
echo
if [[ -z "$DB_PASSWORD" ]]; then
  echo "Senha vazia. Encerrando."
  exit 1
fi

echo "Atualizando a senha do banco..."
az postgres flexible-server update +  --resource-group "$RESOURCE_GROUP" +  --name "$POSTGRES_SERVER" +  --admin-password "$DB_PASSWORD" +  --output none

echo "Liberando extensão necessária e validando conexão..."
az postgres flexible-server parameter set +  --resource-group "$RESOURCE_GROUP" +  --server-name "$POSTGRES_SERVER" +  --name azure.extensions +  --value PGCRYPTO +  --output none

export PGPASSWORD="$DB_PASSWORD"
CONNECTION="host=$POSTGRES_HOST port=5432 dbname=postgres user=$POSTGRES_USER sslmode=require"
psql "$CONNECTION" -v ON_ERROR_STOP=1 -c "select 'Conexão PostgreSQL validada' as status;"

echo "Aplicando o esquema de dados..."
curl -fsSL "https://raw.githubusercontent.com/ComercialElevaLife/sige-GL/main/api/schema.sql" +  | psql "$CONNECTION" -v ON_ERROR_STOP=1

DB_PASSWORD_ENCODED="$(python3 -c 'import os, urllib.parse; print(urllib.parse.quote(os.environ["DB_PASSWORD"], safe=""))')"
JWT_SECRET="$(openssl rand -hex 48)"

echo "Configurando a API Azure..."
az staticwebapp appsettings set +  --name "$STATIC_APP" +  --resource-group "$RESOURCE_GROUP" +  --setting-names +    "POSTGRES_CONNECTION_STRING=postgresql://$POSTGRES_USER:$DB_PASSWORD_ENCODED@$POSTGRES_HOST:5432/postgres?sslmode=require" +    "AUTH_JWT_SECRET=$JWT_SECRET" +    "POSTGRES_SSL=true" +  --output none

read -r -p "E-mail do administrador SIGE: " ADMIN_EMAIL
read -r -s -p "Defina a senha desse administrador: " ADMIN_PASSWORD
echo
if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
  echo "E-mail ou senha do administrador vazios. Encerrando."
  exit 1
fi

psql "$CONNECTION" +  -v ON_ERROR_STOP=1 +  -v admin_email="$ADMIN_EMAIL" +  -v admin_password="$ADMIN_PASSWORD" <<'SQL'
insert into app_user (name, email, password_hash, role, client_ids)
values (
  'Administrador ElevaLife',
  :'admin_email',
  crypt(:'admin_password', gen_salt('bf')),
  'admin',
  '{}'
)
on conflict (email) do update set
  name = excluded.name,
  password_hash = excluded.password_hash,
  role = 'admin',
  client_ids = '{}',
  active = true;
SQL

unset PGPASSWORD DB_PASSWORD DB_PASSWORD_ENCODED JWT_SECRET ADMIN_PASSWORD
echo "Concluído: banco, API e administrador central configurados."
