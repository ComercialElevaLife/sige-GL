#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="rg-sige-ergo-prod"
STATIC_APP="sige-ergo-elevalife-prod"
DEFAULT_URL="https://white-glacier-081c39d0f.4.azurestaticapps.net"

echo "SIGE GL · ativação de e-mails transacionais"
echo "Use uma Azure Communication Services Email já criada, com remetente verificado."
echo "Os valores confidenciais não serão exibidos."

read -r -p "URL pública do SIGE [$DEFAULT_URL]: " APP_PUBLIC_URL
APP_PUBLIC_URL="${APP_PUBLIC_URL:-$DEFAULT_URL}"
read -r -p "E-mail remetente verificado: " EMAIL_SENDER_ADDRESS
read -r -s -p "Connection string do Azure Communication Services: " ACS_CONNECTION
echo

if [[ -z "$EMAIL_SENDER_ADDRESS" || -z "$ACS_CONNECTION" ]]; then
  echo "Remetente ou connection string vazios. Nenhuma configuração foi alterada."
  exit 1
fi

az staticwebapp appsettings set --name "$STATIC_APP" --resource-group "$RESOURCE_GROUP" --setting-names "APP_PUBLIC_URL=$APP_PUBLIC_URL" "EMAIL_SENDER_ADDRESS=$EMAIL_SENDER_ADDRESS" "AZURE_COMMUNICATION_CONNECTION_STRING=$ACS_CONNECTION" --output none

unset ACS_CONNECTION
echo "Concluído: convites e redefinições de senha serão enviados pelo Azure Communication Services."
