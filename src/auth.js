import { FIRST_ACCOUNT, LOGIN_URL, SECTOR_URL } from "./config.js";

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
        await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
      }
      return;
    }
  }

  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
}

async function ensureLoginFormVisible(page) {
  const loginInput = page.locator('input[name="login"]').first();
  if (await loginInput.isVisible().catch(() => false)) {
    return;
  }
  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
}

export async function openLoginPage(page) {
  await page.goto(SECTOR_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await clickVisibleLogin(page);
}

export async function fillLoginInputs(page, email, senha) {
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
  await entrarButton.click({ timeout: 15000 });
  await page.waitForLoadState("domcontentloaded", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

export async function relogin(page) {
  if (!FIRST_ACCOUNT?.email || !FIRST_ACCOUNT?.senha) {
    throw new Error("Nenhuma conta encontrada em accounts.js/.env.");
  }
  await openLoginPage(page);
  await fillLoginInputs(page, FIRST_ACCOUNT.email, FIRST_ACCOUNT.senha);
  await page.goto(SECTOR_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
}
