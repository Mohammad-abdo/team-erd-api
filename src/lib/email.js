import nodemailer from "nodemailer";
import { config } from "../config/index.js";

let transporter = null;

function getTransporter() {
  if (!config.smtp.host) {
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
    });
  }
  return transporter;
}

/**
 * @param {{ to: string, subject: string, text: string, html?: string }} opts
 */
export async function sendEmail({ to, subject, text, html }) {
  const transport = getTransporter();
  if (!transport) {
    console.log("[email:dev]", { to, subject, text });
    return { dev: true };
  }
  await transport.sendMail({
    from: config.smtp.from,
    to,
    subject,
    text,
    html: html ?? text.replace(/\n/g, "<br>"),
  });
  return { sent: true };
}

export function isEmailConfigured() {
  return Boolean(config.smtp.host);
}
