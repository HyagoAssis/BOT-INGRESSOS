import { chromium } from "playwright";
import readline from "node:readline/promises";
import { FIRST_ACCOUNT, SECTOR_URL, TARGET_SECTORS, headless } from "./config.js";
import { openLoginPage, fillLoginInputs } from "./auth.js";
import { monitorSectors } from "./monitor.js";

async function waitForUserActionAfterPurchase() {
  console.log("Disponibilidade encontrada.");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const timeoutMs = 2 * 60 * 1000;

  const askWithTimeout = async () => {
    return Promise.race([
      rl.question("Aperta y para continuar\n").then((value) => value.trim().toLowerCase()),
      new Promise((resolve) => {
        setTimeout(() => resolve("__timeout__"), timeoutMs);
      })
    ]);
  };

  while (true) {
    const input = await askWithTimeout();
    if (input === "__timeout__") {
      console.log("Sem acao do usuario por 2 minutos. Continuando automaticamente.");
      break;
    }
    if (input === "y") {
      break;
    }
  }
  rl.close();
}

async function main() {
  if (!SECTOR_URL) {
    console.error("Configuracao ausente: defina BUY_URL no .env.");
    return;
  }
  if (!TARGET_SECTORS.length) {
    console.error("Configuracao ausente: defina TARGET_SECTORS no .env (separados por virgula).");
    return;
  }
  if (!FIRST_ACCOUNT?.email || !FIRST_ACCOUNT?.senha) {
    throw new Error("Nenhuma conta encontrada em accounts.js/.env.");
  }

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await openLoginPage(page);
    await fillLoginInputs(page, FIRST_ACCOUNT.email, FIRST_ACCOUNT.senha);

    while (true) {
      const purchased = await monitorSectors(page);
      if (purchased) {
        await waitForUserActionAfterPurchase();
      }
    }
  } finally {
    if (!page.isClosed()) {
      await page.close().catch(() => {});
    }
    await browser.close().catch(() => {});
  }
}

main().catch((error) => {
  if (String(error?.message || "").includes("Target page, context or browser has been closed")) {
    process.exitCode = 0;
    return;
  }
  console.error("Falha ao executar o fluxo:", error);
  process.exitCode = 1;
});
