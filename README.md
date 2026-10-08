# SIGE GL — sistema independente de coleta de adesão

Aplicação móvel independente para o profissional de Ginástica Laboral registrar presenças por QR Code e validação facial. Ela funciona no navegador do celular, mantém os cadastros e o registro da aula no dispositivo e foi estruturada para depois ser incorporada ao SIGE Ergo.

## O que já funciona

- Aula com participantes previstos e contador de adesão.
- Cadastro de participantes com nome, setor e identificador próprio.
- Área de participantes para exibir o QR Code de cada pessoa.
- QR Code individual no formato `SIGEGL:<id-do-participante>`.
- Leitura do QR pela câmera do celular.
- Abertura da câmera frontal e captura de selfie para verificação.
- Presença manual como contingência.
- Registros guardados no navegador e aplicativo cacheado após o primeiro acesso, permitindo coleta mesmo sem internet durante a aula.
- Estado claro de `presença confirmada` ou `aguardando revisão facial`.

## Rodar localmente

```bash
npm install --cache /tmp/sige-gl-npm-cache
npm run dev
```

Abra a URL mostrada pelo Vite em um navegador. Para a câmera funcionar fora de `localhost`, publique em HTTPS.

## Publicar como aplicação independente

O comando de produção gera a pasta `dist/`:

```bash
npm run build
```

Publique o conteúdo dessa pasta em uma hospedagem HTTPS. O projeto não requer servidor para o fluxo de QR e confirmação manual; os dados ficam no navegador até a integração com a API definitiva.

## Ligar a biometria facial real

O frontend não deve receber chave de fornecedor nem guardar template biométrico. Crie no backend do SIGE Ergo um endpoint HTTPS configurado como `VITE_BIOMETRIC_VERIFY_URL`:

```text
POST /biometrics/verify
multipart/form-data:
  participantId: GL-0001
  sessionId: aula-2026-10-08-0900
  image: captura.jpg
```

Resposta esperada:

```json
{ "status": "approved" }
```

Qualquer outro estado mantém a ocorrência para revisão manual. O backend deve encaminhar a imagem ao fornecedor escolhido, solicitar comparação facial 1:1 e prova de vida, registrar somente o resultado necessário e descartar a imagem conforme a política de retenção.

Sem essa variável, a aplicação continua operacional para QR e solicita confirmação manual. A selfie não é guardada nem tratada como autenticação biométrica.

## Próximos pontos de integração no SIGE Ergo

1. Substituir os participantes de demonstração pelos cadastros de empresa, unidade, setor e colaborador.
2. Persistir aulas e presenças no banco do SIGE Ergo quando houver conexão.
3. Implementar a rota biométrica no backend com o fornecedor selecionado e credenciais exclusivas do servidor.
4. Gerar os QR Codes nos crachás ou na área do participante.
5. Aplicar as regras de acesso, auditoria e retenção de dados biométricos.
