#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="rg-sige-ergo-prod"
STATIC_APP="sige-ergo-elevalife-prod"
DEFAULT_URL="https://white-glacier-081c39d0f.4.azurestaticapps.net"

echo "SIGE GL · ativação de e-mails transacionais"
echo "Você pode usar Azure Communication Services ou um fluxo HTTP já existente no Azure."
echo "Os valores confidenciais não serão exibidos."

read -r -p "URL pública do SIGE [$DEFAULT_URL]: " APP_PUBLIC_URL
APP_PUBLIC_URL="${APP_PUBLIC_URL:-$DEFAULT_URL}"
echo ""
echo "Escolha o provedor de e-mail:"
echo "1) Fluxo HTTP do Azure (Logic Apps ou Power Automate)"
echo "2) Azure Communication Services Email"
read -r -p "Opção [1]: " EMAIL_PROVIDER
EMAIL_PROVIDER="${EMAIL_PROVIDER:-1}"

if [[ "$EMAIL_PROVIDER" == "1" ]]; then
  read -r -s -p "URL de chamada do fluxo de e-mail: " EMAIL_WEBHOOK_URL
  echo
  if [[ -z "$EMAIL_WEBHOOK_URL" ]]; then
    echo "A URL do fluxo está vazia. Nenhuma configuração foi alterada."
    exit 1
  fi

  az staticwebapp appsettings set --name "$STATIC_APP" --resource-group "$RESOURCE_GROUP" --setting-names "APP_PUBLIC_URL=$APP_PUBLIC_URL" "EMAIL_WEBHOOK_URL=$EMAIL_WEBHOOK_URL" --output none
  unset EMAIL_WEBHOOK_URL
  echo "Concluído: os convites e as redefinições de senha serão entregues pelo fluxo Azure."
  exit 0
fi

if [[ "$EMAIL_PROVIDER" != "2" ]]; then
  echo "Opção inválida. Nenhuma configuração foi alterada."
  exit 1
fi

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
