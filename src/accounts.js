import "dotenv/config";

export const conta = {
  email: process.env.ACCOUNT_EMAIL || "",
  senha: process.env.ACCOUNT_PASSWORD || ""
};

export const emails = (process.env.ALERT_EMAILS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
