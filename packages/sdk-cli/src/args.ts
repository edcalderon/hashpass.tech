export interface ParsedArgs {
  command?: string | undefined;
  positionals: string[];
  flags: Record<string, string | boolean>;
}

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument) continue;
    if (!argument.startsWith("--")) { positionals.push(argument); continue; }
    const [rawName, inline] = argument.slice(2).split("=", 2);
    if (!rawName) continue;
    if (inline !== undefined) { flags[rawName] = inline; continue; }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) { flags[rawName] = next; index += 1; }
    else flags[rawName] = true;
  }
  return { command: positionals.shift(), positionals, flags };
}

export function stringFlag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags[name];
  return typeof value === "string" ? value : undefined;
}
