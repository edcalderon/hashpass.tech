import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {
  buildClaudeMessagesFetchInit,
  buildEventVideoBriefRequest,
  parseClaudeBrief,
} from './lib/event-video-brief.mjs';

function parseArgs(args) {
  const result = {event: '', output: ''};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--event') result.event = args[++index] ?? '';
    else if (args[index] === '--output') result.output = args[++index] ?? '';
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!result.event || !result.output) {
    throw new Error('Usage: node scripts/generate-event-video-brief.mjs --event <event.json> --output <brief.json>');
  }
  return result;
}

const {event: eventPath, output: outputPath} = parseArgs(process.argv.slice(2));
const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL;
if (!apiKey || !model) {
  throw new Error('Set ANTHROPIC_API_KEY and ANTHROPIC_MODEL in your local secret environment before generating a brief.');
}

const event = JSON.parse(await readFile(path.resolve(eventPath), 'utf8'));
const request = buildEventVideoBriefRequest(event);
const response = await fetch(
  'https://api.anthropic.com/v1/messages',
  buildClaudeMessagesFetchInit({apiKey, model, request}),
);
if (!response.ok) throw new Error(`Claude brief request failed with HTTP ${response.status}.`);

const brief = parseClaudeBrief(await response.json());
await writeFile(
  path.resolve(outputPath),
  `${JSON.stringify({version: 1, source: 'claude', eventId: event.id, ...brief}, null, 2)}\n`,
);
console.log(`Creative brief written to ${outputPath}. Review it before generating media in Diffusion Studio.`);
