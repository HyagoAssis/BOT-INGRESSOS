# BOT-INGRESSOS

Bot em Node.js + Playwright para monitorar setores de ingressos do Flamengo, relogar automaticamente quando necessário, enviar alerta por e-mail e tentar compra com quantidade configurada.

## Pré-requisitos

1. Git  
- Windows: https://git-scm.com/download/win  
- Linux: https://git-scm.com/download/linux

2. Node.js LTS (com npm)  
- https://nodejs.org/

3. Playwright Chromium (instalado no projeto via comando)

## 1) Clonar o projeto

```bash
git clone git@github.com:HyagoAssis/BOT-INGRESSOS.git
cd BOT-INGRESSOS
```

Se não usar SSH:

```bash
git clone https://github.com/HyagoAssis/BOT-INGRESSOS.git
cd BOT-INGRESSOS
```

## 2) Instalar dependências

```bash
npm install
npx playwright install chromium
```

No Linux, se faltar biblioteca de sistema para o navegador:

```bash
npx playwright install-deps chromium
```

## 3) Configurar `.env`

Crie/edite o arquivo `.env` na raiz do projeto:

```env
ACCOUNT_EMAIL=seu_login_no_site@exemplo.com
ACCOUNT_PASSWORD=sua_senha_no_site

ALERT_EMAILS=voce@gmail.com,outra@gmail.com

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu_gmail@gmail.com
SMTP_PASS=sua_senha_de_app_google
MAIL_FROM=seu_gmail@gmail.com
```

Para Gmail:
- `SMTP_PASS` precisa ser senha de app (2FA ativo), não a senha normal da conta.

## 4) Rodar o bot

Modo headless:

```bash
npm start
```

Com navegador visível:

```bash
npm run start:headed
```

## 5) Comportamento do bot

- Monitora: `https://ingressos.flamengo.com.br/buy/sector?event=35755`
- Atualiza a cada 3 segundos
- Busca disponibilidade em `SUL NÍVEL 1` e `SUL NÍVEL 2`
- Ao encontrar:
  - envia e-mail de alerta
  - preenche quantidade `3`
  - clica em `Comprar`
- Se houver redirecionamento para outra página:
  - faz login novamente com a conta configurada
  - volta para a página de monitoramento
- Após clicar em comprar, aguarda ação do usuário no terminal.

## 6) Comando útil de validação

```bash
node --check src/open-site.js
```

## 7) Erros comuns

- `535 Username and Password not accepted` no SMTP:
  - use senha de app válida no `SMTP_PASS`.
- `npm: command not found`:
  - Node.js não instalado corretamente.
- Playwright não abre Chromium:
  - rode novamente `npx playwright install chromium` (e no Linux, `install-deps`).
