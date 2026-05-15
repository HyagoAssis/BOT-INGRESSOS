import { chromium } from "playwright";
import "dotenv/config";
import nodemailer from "nodemailer";
import { conta, emails } from "./accounts.js";

const LOGIN_URL = "https://ingressos.flamengo.com.br/login";
const SECTOR_URL = (process.env.BUY_URL || "").trim();
const TARGET_SECTORS = (process.env.TARGET_SECTORS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
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

  console.log(`Disponibilidade encontrada em ${sectorName}.`);
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

async function openLoginPage(page) {
  await page.goto(SECTOR_URL, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await clickVisibleLogin(page);
}

async function ensureLoginFormVisible(page) {
  const loginInput = page.locator('input[name="login"]').first();
  if (await loginInput.isVisible().catch(() => false)) {
    return;
  }

  await page.goto(LOGIN_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
}

async function fillLoginInputs(page, email, senha) {
  await ensureLoginFormVisible(page);

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
    await page.waitForResponse((response) => response.request() === loginRequest, { timeout: 30000 }).catch(() => {});
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
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
  return text.includes("ESGOTADO") || text.includes("INDISPONIVEL") || text.includes("INDISPONIVEL NO MOMENTO");
}

async function setDesiredQuantity(container) {
  const quantityInput = container
    .locator('input[type="number"]:not([disabled]), input[name*="quant"]:not([disabled]), input[id*="quant"]:not([disabled])')
    .first();
  if (await quantityInput.count().catch(() => 0)) {
    await quantityInput.fill(String(DESIRED_QUANTITY));
    return true;
  }

  const quantitySelect = container
    .locator('select:not([disabled])[name*="quant"], select:not([disabled])[id*="quant"], select:not([disabled])')
    .first();
  if (await quantitySelect.count().catch(() => 0)) {
    const optionExists = await quantitySelect.locator(`option[value="${DESIRED_QUANTITY}"]`).count().catch(() => 0);
    if (optionExists) {
      await quantitySelect.selectOption(String(DESIRED_QUANTITY));
      return true;
    }

    const textOptionExists = await quantitySelect
      .locator("option")
      .filter({ hasText: new RegExp(`^\\s*${DESIRED_QUANTITY}\\s*$`) })
      .count()
      .catch(() => 0);
    if (textOptionExists) {
      await quantitySelect.selectOption({ label: String(DESIRED_QUANTITY) });
      return true;
    }

    return false;
  }

  const plusButton = container
    .locator('button:has-text("+"), [aria-label*="mais" i], [title*="mais" i]')
    .first();
  if (await plusButton.count().catch(() => 0)) {
    for (let i = 0; i < DESIRED_QUANTITY; i += 1) {
      await plusButton.click().catch(() => {});
    }
    return true;
  }

  return false;
}

async function setDesiredQuantityOnPage(page) {
  const quantityInput = page
    .locator('input[type="number"]:not([disabled]), input[name*="quant"]:not([disabled]), input[id*="quant"]:not([disabled])')
    .first();
  if (await quantityInput.count().catch(() => 0)) {
    await quantityInput.fill(String(DESIRED_QUANTITY));
    return true;
  }

  const quantitySelect = page
    .locator('select:not([disabled])[name*="quant"], select:not([disabled])[id*="quant"], select:not([disabled])')
    .first();
  if (await quantitySelect.count().catch(() => 0)) {
    const optionExists = await quantitySelect.locator(`option[value="${DESIRED_QUANTITY}"]`).count().catch(() => 0);
    if (optionExists) {
      await quantitySelect.selectOption(String(DESIRED_QUANTITY));
      return true;
    }
  }

  return false;
}

function sectorMatchInText(haystack, sectorName) {
  const normalizedText = normalizeText(haystack);
  const normalizedSector = normalizeText(sectorName);
  if (normalizedText.includes(normalizedSector)) {
    return true;
  }

  const sectorTokens = normalizedSector.split(" ").filter(Boolean);
  return sectorTokens.every((token) => normalizedText.includes(token));
}

async function findActionButton(container) {
  const actionButton = container
    .locator(
      'button:has-text("Comprar"), [role="button"]:has-text("Comprar"), input[type="submit"][value*="Comprar"], button:has-text("Adicionar"), [role="button"]:has-text("Adicionar"), button:has-text("Selecionar"), [role="button"]:has-text("Selecionar"), button:has-text("Continuar"), [role="button"]:has-text("Continuar")'
    )
    .first();

  if (await actionButton.count().catch(() => 0)) {
    return actionButton;
  }

  return null;
}

async function tryBuyInSector(page, sectorName) {
  const sectorLabel = page.getByText(sectorName, { exact: false }).first();
  if (await sectorLabel.count().catch(() => 0)) {
    await sectorLabel.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);

    const globalQuantitySet = await setDesiredQuantityOnPage(page);
    const globalActionButton = await findActionButton(page.locator("body"));
    if (globalQuantitySet && globalActionButton) {
      await sendAvailabilityEmail(sectorName).catch((error) => {
        console.warn(`Falha ao enviar email de alerta: ${error.message}`);
      });
      await globalActionButton.click({ timeout: 10000 });
      return true;
    }

    const containers = sectorLabel.locator(
      'xpath=ancestor::*[self::section or self::article or self::div or self::li or self::tr]'
    );
    const totalContainers = await containers.count().catch(() => 0);

    for (let index = 0; index < totalContainers; index += 1) {
      const container = containers.nth(index);
      const text = await container.innerText().catch(() => "");
      if (!sectorMatchInText(text, sectorName)) {
        continue;
      }
      if (await hasUnavailableText(container)) {
        continue;
      }

      const quantitySet = await setDesiredQuantity(container);
      const actionButton = await findActionButton(container);
      if (!quantitySet || !actionButton) {
        continue;
      }

      await sendAvailabilityEmail(sectorName).catch((error) => {
        console.warn(`Falha ao enviar email de alerta: ${error.message}`);
      });
      await actionButton.click({ timeout: 10000 });
      return true;
    }
  }

  const actionBlocks = page.locator(
    'xpath=//*[self::button or self::input][contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ", "abcdefghijklmnopqrstuvwxyzáàâãéèêíìîóòôõúùûç"), "comprar") or contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ", "abcdefghijklmnopqrstuvwxyzáàâãéèêíìîóòôõúùûç"), "adicionar") or contains(translate(normalize-space(.), "ABCDEFGHIJKLMNOPQRSTUVWXYZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ", "abcdefghijklmnopqrstuvwxyzáàâãéèêíìîóòôõúùûç"), "selecionar")]'
  );
  const totalActionBlocks = await actionBlocks.count().catch(() => 0);
  for (let index = 0; index < totalActionBlocks; index += 1) {
    const action = actionBlocks.nth(index);
    const container = action.locator('xpath=ancestor::*[self::section or self::article or self::div or self::li or self::tr][1]');
    const containerText = await container.innerText().catch(() => "");
    if (!sectorMatchInText(containerText, sectorName)) {
      continue;
    }
    if (await hasUnavailableText(container)) {
      return false;
    }
  }
  return false;
}

async function reloginWithFirstAccount(page) {
  if (!FIRST_ACCOUNT) {
    throw new Error("Nenhuma conta disponivel em accounts.js/.env.");
  }

  await openLoginPage(page);
  await fillLoginInputs(page, FIRST_ACCOUNT.email, FIRST_ACCOUNT.senha);
  await page.goto(SECTOR_URL, {
    waitUntil: "domcontentloaded",
    timeout: 30000
  });
}

async function monitorSectors(page) {
  while (true) {
    if (page.url() !== "about:blank" && !page.url().includes("/buy/sector")) {
      await reloginWithFirstAccount(page);
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

    console.log("Sem disponibilidade.");
    await page.waitForTimeout(POLL_INTERVAL_MS);
  }
}

async function waitForUserActionAfterPurchase() {
  console.log("Disponibilidade encontrada. Aguardando acao do usuario.");
  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
}

async function main() {
  const browser = await chromium.launch({ headless });
  let page;

  try {
    if (!SECTOR_URL) {
      console.error("Configuracao ausente: defina BUY_URL no .env.");
      return;
    }
    if (!TARGET_SECTORS.length) {
      console.error("Configuracao ausente: defina TARGET_SECTORS no .env (separados por virgula).");
      return;
    }
    if (!FIRST_ACCOUNT) {
      throw new Error("Nenhuma conta encontrada em accounts.js/.env.");
    }

    page = await browser.newPage({
      viewport: { width: 1440, height: 900 }
    });

    await openLoginPage(page);
    await fillLoginInputs(page, FIRST_ACCOUNT.email, FIRST_ACCOUNT.senha);
    const purchased = await monitorSectors(page);

    if (purchased) {
      await waitForUserActionAfterPurchase();
    }
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
