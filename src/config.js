import "dotenv/config";
import { conta, emails } from "./accounts.js";

export const LOGIN_URL = "https://ingressos.flamengo.com.br/login";
export const SECTOR_URL = (process.env.BUY_URL || "").trim();
export const TARGET_SECTORS = (process.env.TARGET_SECTORS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
export const POLL_INTERVAL_MS = 3000;
export const DESIRED_QUANTITY = 3;
export const headless = !process.argv.includes("--headed");
export const FIRST_ACCOUNT = conta;
export const ALERT_RECIPIENTS = [...new Set([...(emails || []), conta.email].filter(Boolean))];

export function readArgValue(name) {
  const prefix = `${name}=`;
  const item = process.argv.find((arg) => arg.startsWith(prefix));
  return item ? item.slice(prefix.length) : "";
}
