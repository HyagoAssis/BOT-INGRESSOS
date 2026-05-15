import { DESIRED_QUANTITY, POLL_INTERVAL_MS, SECTOR_URL, TARGET_SECTORS } from "./config.js";
import { sendAvailabilityEmail } from "./email.js";
import { relogin } from "./auth.js";
const QUANTITY_FALLBACKS = [3, 2, 1];

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

async function setDesiredQuantityOnPage(page) {
  const quantitiesToTry = [DESIRED_QUANTITY, ...QUANTITY_FALLBACKS.filter((q) => q !== DESIRED_QUANTITY)];

  const quantityInput = page
    .locator('input[type="number"]:not([disabled]), input[name*="quant"]:not([disabled]), input[id*="quant"]:not([disabled])')
    .first();
  if (await quantityInput.count().catch(() => 0)) {
    for (const quantity of quantitiesToTry) {
      await quantityInput.fill(String(quantity));
      const currentValue = await quantityInput.inputValue().catch(() => "");
      if (String(currentValue).trim() === String(quantity)) {
        return quantity;
      }
    }
    return 0;
  }

  const quantitySelect = page
    .locator('select:not([disabled])[name*="quant"], select:not([disabled])[id*="quant"], select:not([disabled])')
    .first();
  if (await quantitySelect.count().catch(() => 0)) {
    for (const quantity of quantitiesToTry) {
      const optionByValue = await quantitySelect.locator(`option[value="${quantity}"]`).count().catch(() => 0);
      if (optionByValue) {
        await quantitySelect.selectOption(String(quantity));
        return quantity;
      }

      const optionByLabel = await quantitySelect
        .locator("option")
        .filter({ hasText: new RegExp(`^\\s*${quantity}\\s*$`) })
        .count()
        .catch(() => 0);
      if (optionByLabel) {
        await quantitySelect.selectOption({ label: String(quantity) });
        return quantity;
      }
    }
    return 0;
  }
  return 0;
}

async function findActionButton(scope) {
  const actionButton = scope
    .locator('button:has-text("Comprar"), [role="button"]:has-text("Comprar"), input[type="submit"][value*="Comprar"], button:has-text("Adicionar"), [role="button"]:has-text("Adicionar"), button:has-text("Selecionar"), [role="button"]:has-text("Selecionar"), button:has-text("Continuar"), [role="button"]:has-text("Continuar")')
    .first();
  return (await actionButton.count().catch(() => 0)) ? actionButton : null;
}

async function tryBuyInSector(page, sectorName) {
  const sectorLabel = page.getByText(sectorName, { exact: false }).first();
  if (!(await sectorLabel.count().catch(() => 0))) {
    return false;
  }

  await sectorLabel.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);

  const selectedQuantity = await setDesiredQuantityOnPage(page);
  const actionButton = await findActionButton(page.locator("body"));
  if (!selectedQuantity || !actionButton || (await hasUnavailableText(page.locator("body")))) {
    return false;
  }

  await sendAvailabilityEmail(`${sectorName} (qtd ${selectedQuantity})`).catch(() => {});
  await actionButton.click({ timeout: 10000 });
  return true;
}

export async function monitorSectors(page) {
  while (true) {
    if (page.url() !== "about:blank" && !page.url().includes("/buy/sector")) {
      await relogin(page);
    }

    await page.goto(SECTOR_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

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
