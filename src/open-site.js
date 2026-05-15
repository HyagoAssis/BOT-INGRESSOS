import { chromium } from "playwright";
import { FIRST_ACCOUNT, SECTOR_URL, TARGET_SECTORS, headless } from "./config.js";
import { openLoginPage, fillLoginInputs } from "./auth.js";
import { monitorSectors } from "./monitor.js";

async function waitForUserActionAfterPurchase() {
  console.log("Disponibilidade encontrada. Aguardando acao do usuario.");
  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
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
    const purchased = await monitorSectors(page);
    if (purchased) {
      await waitForUserActionAfterPurchase();
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
