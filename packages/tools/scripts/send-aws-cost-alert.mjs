#!/usr/bin/env node
import { readFileSync } from "node:fs";
import nodemailer from "nodemailer";

const recipient = "support@hashpass.tech";

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
}

function requireEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing private ${name} configuration.`);
  return value;
}

function reportPath() {
  const index = process.argv.indexOf("--report-file");
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (!value) throw new Error("A private --report-file is required.");
  return value;
}

export function buildAlertEmail(report) {
  const date = report.generatedAt.slice(0, 10);
  const forecast =
    report.budget.forecast === null
      ? "Unavailable"
      : money(report.budget.forecast);
  const services = report.services
    .map(
      (service) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #e5e7eb">${escapeHtml(service.name)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #e5e7eb;font-weight:700">${money(service.cost)}</td></tr>`,
    )
    .join("");
  const pipelines = report.pipelines
    .map(
      (pipeline) =>
        `<li>${escapeHtml(pipeline.name)}: <strong>${pipeline.manualOnly ? "manual recovery only" : "automatic trigger detected — investigate immediately"}</strong></li>`,
    )
    .join("");
  const triggerStatus = report.triggerDrift
    ? "An automatic build trigger was detected."
    : "All monitored build pipelines remain manual-recovery only.";
  const subject = report.triggerDrift
    ? "Action required: HashPass build-trigger guard detected drift"
    : "Action required: HashPass AWS cost-control alert";

  return {
    subject,
    text: `${subject}\n\nConfidential internal operations notice — ${date}\n\nMonthly guardrail\nApproved limit: ${money(report.budget.limit)}\nMonth-to-date spend: ${money(report.budget.actual)}\nForecast: ${forecast}\n\n${triggerStatus}\n\nReview current build activity and planned spend. This message is intentionally not included in GitHub Actions output.`,
    html: `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#162033"><div style="max-width:640px;margin:24px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px #17203318"><div style="padding:28px 32px;background:#071a2d;color:#fff"><div style="font-size:13px;letter-spacing:1.2px;font-weight:700;color:#35d6ed">HASHPASS · INTERNAL OPERATIONS</div><h1 style="font-size:25px;margin:12px 0 0">${escapeHtml(subject)}</h1></div><div style="padding:28px 32px"><p style="margin-top:0;color:#536174">Confidential cost-control notice · ${date}</p><div style="padding:18px;border-radius:12px;background:#fff6e5;border:1px solid #f5c76d"><strong>Monthly guardrail requires review</strong><table width="100%" style="margin-top:10px;border-collapse:collapse"><tr><td>Approved limit</td><td align="right"><strong>${money(report.budget.limit)}</strong></td></tr><tr><td>Month-to-date spend</td><td align="right"><strong>${money(report.budget.actual)}</strong></td></tr><tr><td>Forecast</td><td align="right"><strong>${forecast}</strong></td></tr></table></div><h2 style="font-size:17px;margin:28px 0 10px">Spend by service</h2><table width="100%" style="border-collapse:collapse;font-size:14px">${services}</table><h2 style="font-size:17px;margin:28px 0 10px">Build-trigger guard</h2><p>${escapeHtml(triggerStatus)}</p><ul style="padding-left:20px;line-height:1.7">${pipelines}</ul><h2 style="font-size:17px;margin:28px 0 10px">Recommended next actions</h2><ol style="padding-left:20px;line-height:1.7"><li>Review the largest current-month cost driver and stop only non-essential work.</li><li>Confirm the monitored pipelines remain manual recovery only.</li><li>Update the monthly budget or forecast plan if the spend is approved.</li></ol></div><div style="padding:18px 32px;background:#f4f7fb;color:#667085;font-size:12px">This is a private operational notice. Cost details are deliberately excluded from GitHub Actions logs and job summaries.</div></div></body></html>`,
  };
}

async function main() {
  const report = JSON.parse(readFileSync(reportPath(), "utf8"));
  const host = requireEnvironment("NODEMAILER_HOST");
  const port = Number(requireEnvironment("NODEMAILER_PORT"));
  const user = requireEnvironment("NODEMAILER_USER");
  const pass = requireEnvironment("NODEMAILER_PASS");
  const from = requireEnvironment("NODEMAILER_FROM");
  const email = buildAlertEmail(report);
  const isBrevo = host.includes("brevo.com") || host.includes("sendinblue.com");
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: { user, pass },
    requireTLS: true,
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
      servername: isBrevo ? "smtp-relay.sendinblue.com" : undefined,
      checkServerIdentity: isBrevo ? () => undefined : undefined,
    },
  });
  await transporter.sendMail({
    from: `HashPass Operations <${from}>`,
    to: recipient,
    ...email,
  });
  console.log("Internal AWS cost-control email delivered to support.");
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(() => {
    console.error(
      "Internal AWS cost-control email could not be delivered. Check the private mail configuration.",
    );
    process.exitCode = 1;
  });
}
