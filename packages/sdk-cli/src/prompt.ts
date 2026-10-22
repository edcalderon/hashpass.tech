import { createInterface } from "node:readline";
import { Writable } from "node:stream";

import type { SecretReader } from "./types.js";

export type { SecretReader };

/**
 * Secrets never come from flags (they would land in shell history and `ps`) or
 * from the environment. On a terminal the answer is typed with echo off; when
 * stdin is piped, each call consumes the next line, so `printf '1234\n' | hashpass pin verify`
 * works in scripts.
 */
export function createSecretReader(
  input: NodeJS.ReadableStream & { isTTY?: boolean } = process.stdin,
  prompts: NodeJS.WritableStream = process.stderr,
): SecretReader {
  if (input.isTTY) return (question) => ask(input, prompts, question);

  let lines: Promise<string[]> | undefined;
  return async (question) => {
    prompts.write(question);
    lines ??= readAll(input).then((text) => text.split(/\r?\n/));
    const queue = await lines;
    const line = queue.shift();
    prompts.write("\n");
    if (line === undefined || line === "") throw new Error("No input was provided for the prompt.");
    return line;
  };
}

function ask(input: NodeJS.ReadableStream, prompts: NodeJS.WritableStream, question: string): Promise<string> {
  prompts.write(question);
  let echo = true;
  const output = new Writable({ write(chunk, _encoding, done) { if (echo) prompts.write(chunk); done(); } });
  const reader = createInterface({ input, output, terminal: true });
  return new Promise((resolve, reject) => {
    reader.once("close", () => reject(new Error("Input closed before an answer was given.")));
    echo = false;
    reader.question("", (answer) => {
      reader.removeAllListeners("close");
      reader.close();
      prompts.write("\n");
      resolve(answer);
    });
  });
}

async function readAll(input: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
