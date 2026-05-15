import { chromium } from "playwright";
import "dotenv/config";
import nodemailer from "nodemailer";
import { conta, emails } from "./accounts.js";

const LOGIN_URL = "https://ingressos.flamengo.com.br/login";
const SECTOR_URL = "https://ingressos.flamengo.com.br/buy/sector?event=35755";
const TARGET_SECTORS = ["SUL NÍVEL 1", "SUL NÍVEL 2"];
const POLL_INTERVAL_MS = 3000;
const DESIRED_QUANTITY = 3;
const headless = !process.argv.includes("--headed");
const FIRST_ACCOUNT = conta;
const ALERT_RECIPIENTS = [...new Set([...(emails || []), conta.email].filter(Boolean))];

function readArgValue(name) {
  const prefix = `${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  if (!item) {
    return "";
  }
  return item.slice(prefix.length);
}

async function sendAvailabilityEmail(sectorName) {
  const smtpHost = process.env.SMTP_HOST || readArgValue("--smtp-host");
  const smtpPort = Number(process.env.SMTP_PORT || readArgValue("--smtp-port") || "587");
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL || readArgValue("--smtp-user");
  const smtpPass = process.env.SMTP_PASS || process.env.SENHA || readArgValue("--smtp-pass");
  const mailFrom = process.env.MAIL_FROM || readArgValue("--mail-from") || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass || !mailFrom) {
    console.warn("Email nao enviado: faltam argumentos SMTP (--smtp-host, --smtp-port, --smtp-user, --smtp-pass, --mail-from).");
    return;
  }

  if (!ALERT_RECIPIENTS.length) {
    console.warn("Email nao enviado: nenhum destinatario encontrado em accounts.js.");
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass
    }
  });

  const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  await transporter.sendMail({
    from: mailFrom,
    to: ALERT_RECIPIENTS.join(", "),
    subject: `Ingresso disponivel - ${sectorName}`,
    text: [
      `Disponibilidade detectada em ${sectorName}.`,
      `Quantidade configurada: ${DESIRED_QUANTITY}.`,
      `Pagina: ${SECTOR_URL}`,
      `Data/hora: ${now}`
    ].join("\n")
  });

  console.log(`Email de alerta enviado para: ${ALERT_RECIPIENTS.join(", ")}`);
}

async function clickVisibleLogin(page) {
  const selectors = [
    'a[href*="/login"]:visible',
    'a:has-text("Login"):visible',
    'button:has-text("Login"):visible',
    '[role="button"]:has-text("Login"):visible'
  ];

  for (const selector of selectors) {
    const target = page.locator(selector).first();

    if (await target.count().catch(() => 0)) {
      try {
        await target.click({ timeout: 2500 });
      } catch {
        const href = await target.getAttribute("href").catch(() => null);

        if (href) {
          await page.goto(href, {
            waitUntil: "domcontentloaded",
            timeout: 30000
          });
        } else {
          await page.goto(LOGIN_URL, {
            waitUntil: "domcontentloaded",
            timeout: 30000
          });
        }
      }

      return selector;
    }
  }

  await page.goto(LOGIN_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });

  return "page.goto(LOGIN_URL)";
}

async function openLoginPage(page, attempt) {
  await page.goto(SECTOR_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  const loginSelector = await clickVisibleLogin(page);

  console.log(`Tentativa ${attempt}: tela de login aberta em ${page.url()}`);
  console.log(`Tentativa ${attempt}: seletor usado ${loginSelector}`);
}

async function fillLoginInputs(page, attempt, email, senha) {
  const loginInput = page.locator('input[name="login"]').first();
  const passInput = page.locator('input[name="pass"]').first();

  await loginInput.waitFor({ state: "visible", timeout: 15000 });
  await passInput.waitFor({ state: "visible", timeout: 15000 });

  await loginInput.fill(email);
  await passInput.fill(senha);

  const entrarButton = page
    .locator('button:has-text("Entrar"), [role="button"]:has-text("Entrar"), input[type="submit"][value*="Entrar"]')
    .first();

  await entrarButton.waitFor({ state: "visible", timeout: 15000 });
  const loginRequestPromise = page.waitForRequest((request) => {
    const type = request.resourceType();
    const method = request.method();
    const hasBody = Boolean(request.postData());
    return (type === "xhr" || type === "fetch" || type === "document") && (method !== "GET" || hasBody);
  }, { timeout: 15000 }).catch(() => null);

  await entrarButton.click({ timeout: 15000 });

  const loginRequest = await loginRequestPromise;
  if (loginRequest) {
    await page.waitForResponse((response) => response.request() === loginRequest, { timeout: 30000 }).catch(() => {
      console.warn(`Tentativa ${attempt}: resposta da requisicao de entrar nao chegou a tempo.`);
    });
  } else {
    console.warn(`Tentativa ${attempt}: nao foi possivel detectar requisicao de entrar a tempo.`);
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {
    console.warn(`Tentativa ${attempt}: a proxima pagina nao concluiu domcontentloaded a tempo.`);
  });
  await page.waitForTimeout(2000);

  console.log(`Tentativa ${attempt}: campos login/pass preenchidos e botao Entrar acionado.`);
}

function normalizeText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

async function hasUnavailableText(container) {
  const text = normalizeText(await container.innerText().catch(() => ""));
  return text.includes("ESGOTADO") || text.includes("INDISPONIVEL");
}

async function setDesiredQuantity(container) {
  const quantityInput = container
    .locator('input[type="number"], input[name*="quant"], input[id*="quant"]')
    .first();
  if (await quantityInput.count().catch(() => 0)) {
    await quantityInput.fill(String(DESIRED_QUANTITY));
    return true;
  }

  const quantitySelect = container
    .locator('select[name*="quant"], select[id*="quant"], select')
    .first();
  if (await quantitySelect.count().catch(() => 0)) {
    await quantitySelect.selectOption(String(DESIRED_QUANTITY));
    return true;
  }

  return false;
}

async function tryBuyInSector(page, sectorName) {
  const sectorLabel = page.getByText(sectorName, { exact: false }).first();
  if (!(await sectorLabel.count().catch(() => 0))) {
    return false;
  }

  const container = sectorLabel.locator(
    'xpath=ancestor::*[self::section or self::article or self::div or self::li or self::tr][1]'
  );

  if (await hasUnavailableText(container)) {
    return false;
  }

  const quantitySet = await setDesiredQuantity(container);
  if (!quantitySet) {
    return false;
  }

  const buyButton = container
    .locator('button:has-text("Comprar"), [role="button"]:has-text("Comprar"), input[type="submit"][value*="Comprar"]')
    .first();
  if (!(await buyButton.count().catch(() => 0))) {
    return false;
  }

  await sendAvailabilityEmail(sectorName).catch((error) => {
    console.warn(`Falha ao enviar email de alerta: ${error.message}`);
  });
  await buyButton.click({ timeout: 10000 });
  console.log(`Compra acionada no setor ${sectorName} com quantidade ${DESIRED_QUANTITY}.`);
  return true;
}

async function reloginWithFirstAccount(page, attempt) {
  if (!FIRST_ACCOUNT) {
    throw new Error("Nenhuma conta disponivel em accounts.js/.env.");
  }

  await openLoginPage(page, attempt);
  await fillLoginInputs(page, attempt, FIRST_ACCOUNT.email, FIRST_ACCOUNT.senha);
  await page.goto(SECTOR_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
  console.log(`Tentativa ${attempt}: relogin com a primeira conta concluido e retorno para pagina base.`);
}

async function monitorSectors(page, attempt) {
  console.log(`Tentativa ${attempt}: iniciando monitoramento em ${SECTOR_URL}.`);

  while (true) {
    if (page.url() !== "about:blank" && !page.url().includes("/buy/sector")) {
      console.warn(`Tentativa ${attempt}: redirecionado para ${page.url()}. Reautenticando.`);
      await reloginWithFirstAccount(page, attempt);
    }

    await page.goto(SECTOR_URL, {
      waitUntil: "domcontentloaded",
      timeout: 30000
    });

    for (const sectorName of TARGET_SECTORS) {
      const purchased = await tryBuyInSector(page, sectorName);
      if (purchased) {
        return true;
      }
    }

    console.log(
      `Tentativa ${attempt}: sem disponibilidade em ${TARGET_SECTORS.join(" / ")}. Nova verificacao em ${POLL_INTERVAL_MS / 1000}s.`
    );
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }
}

async function waitForUserActionAfterPurchase() {
  console.log("Compra acionada. Aguardando acao do usuario (pressione Enter para encerrar).");
  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
}

async function main() {
  const browser = await chromium.launch({ headless });
  let page;

  try {
    if (!FIRST_ACCOUNT) {
      throw new Error("Nenhuma conta encontrada em accounts.js/.env.");
    }

    page = await browser.newPage({
      viewport: { width: 1440, height: 900 }
    });

    const attempt = 1;
    console.log(`Tentativa ${attempt}: primeira conta ${FIRST_ACCOUNT.email}`);
    await openLoginPage(page, attempt);
    await fillLoginInputs(page, attempt, FIRST_ACCOUNT.email, FIRST_ACCOUNT.senha);
    const purchased = await monitorSectors(page, attempt);

    if (purchased) {
      await waitForUserActionAfterPurchase();
    }

    console.log("Fluxo concluido.");
  } finally {
    if (page && !page.isClosed()) {
      await page.close();
    }
    await browser.close();
  }
}

main().catch((error) => {
  console.error("Falha ao executar o fluxo:", error);
  process.exitCode = 1;
});
