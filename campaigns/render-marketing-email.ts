import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderMarketingEmail, validCampaignCopy, safeCampaignUrl } from '../apps/mobile-app/lib/marketing';

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const configPath = argument('--config');
  const messageKey = argument('--message');
  const allMessages = process.argv.includes('--all');
  const outputPath = argument('--out-dir');
  const unsubscribeUrl = argument('--unsubscribe-url');

  if (!configPath || (!messageKey && !allMessages) || (messageKey && allMessages)) {
    throw new Error('Usage: pnpm exec tsx campaigns/render-marketing-email.ts --config <campaign.json> (--message <message-key> | --all) [--out-dir <directory>] [--unsubscribe-url <https-url>]');
  }
  if (unsubscribeUrl && !safeCampaignUrl(unsubscribeUrl)) {
    throw new Error('The unsubscribe URL must use an approved HTTPS host.');
  }

  const absoluteConfigPath = path.resolve(configPath);
  const pack = JSON.parse(await readFile(absoluteConfigPath, 'utf8')) as {
    messages?: Array<{ key?: string; content?: Record<string, unknown> }>;
  };
  const messages = allMessages ? pack.messages || [] : pack.messages?.filter(candidate => candidate.key === messageKey) || [];
  if (!messages.length) throw new Error(`Campaign message not found: ${messageKey}`);

  const destination = path.resolve(outputPath || path.join(path.dirname(absoluteConfigPath), 'emails'));
  await mkdir(destination, { recursive: true });

  for (const message of messages) {
    if (!message.key || !message.content) throw new Error('A campaign message is missing its key or content.');
    for (const locale of ['es', 'en'] as const) {
      const copy = message.content[locale];
      if (!validCampaignCopy(copy)) throw new Error(`Invalid ${locale} campaign copy for ${message.key}`);
      const rendered = renderMarketingEmail(copy, unsubscribeUrl || null, locale);
      await writeFile(path.join(destination, `${message.key}.${locale}.html`), rendered.html);
      const previewLabel = locale === 'es'
        ? 'VISTA PREVIA — el envío final incluye los controles de suscripción personalizados.'
        : 'REVIEW PREVIEW — the final send includes recipient-specific subscription controls.';
      await writeFile(path.join(destination, `${message.key}.${locale}.txt`), `${previewLabel}\n\n${rendered.text}\n`);
    }
  }

  console.log(`Rendered ${messages.length * 2} bilingual email previews to ${destination}`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
