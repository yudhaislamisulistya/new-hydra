#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=pgrst_password="$PGRST_DB_PASSWORD" \
  --set=auth_password="$AUTH_DB_PASSWORD" <<'SQL'
ALTER ROLE authenticator LOGIN PASSWORD :'pgrst_password';
ALTER ROLE supabase_auth_admin LOGIN PASSWORD :'auth_password';
ALTER ROLE supabase_auth_admin SET search_path TO auth;
SQL
