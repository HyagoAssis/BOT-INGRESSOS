import nodemailer from "nodemailer";
import { ALERT_RECIPIENTS, DESIRED_QUANTITY, SECTOR_URL, readArgValue } from "./config.js";

export async function sendAvailabilityEmail(sectorName) {
  const smtpHost = process.env.SMTP_HOST || readArgValue("--smtp-host");
  const smtpPort = Number(process.env.SMTP_PORT || readArgValue("--smtp-port") || "587");
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL || readArgValue("--smtp-user");
  const smtpPass = process.env.SMTP_PASS || process.env.SENHA || readArgValue("--smtp-pass");
  const mailFrom = process.env.MAIL_FROM || readArgValue("--mail-from") || smtpUser;

  if (!smtpHost || !smtpUser || !smtpPass || !mailFrom || !ALERT_RECIPIENTS.length) {
    return;
  }

  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: smtpUser, pass: smtpPass }
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
