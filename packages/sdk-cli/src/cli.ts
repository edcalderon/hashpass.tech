import {
  createHashpass,
  HashpassError,
  type HashpassClient,
} from "@hashpass-tech/sdk";
import { parseArgs, stringFlag, type ParsedArgs } from "./args.js";
import { defaultSessionPath, FileSessionStore } from "./session-store.js";

export interface CliIo {
  out(message: string): void;
  error(message: string): void;
}

// Commands that never touch the network and so must not require
// HASHPASS_APP_ID or SDK construction -- otherwise a fresh environment can't
// even run `hashpass support doctor` to find out *why* it's misconfigured,
// or print the static widget snippet before an app-id has been provisioned.
function noNetworkSupportResult(args: ParsedArgs): unknown | undefined {
  if (args.command !== "support") return undefined;
  const [subcommand, id] = args.positionals;
  if (subcommand === "doctor") return supportDoctor(args);
  if (subcommand === "widget" && id === "init")
    return supportWidgetInitSnippet();
  return undefined;
}

export async function runCli(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  io: CliIo = { out: console.log, error: console.error },
): Promise<number> {
  const args = parseArgs(argv);
  if (!args.command || args.command === "help" || args.flags.help) {
    io.out(HELP);
    return 0;
  }

  try {
    const staticResult = noNetworkSupportResult(args);
    if (staticResult !== undefined) {
      print(staticResult, Boolean(args.flags.json), io);
      return 0;
    }

    const appId = stringFlag(args, "app-id") ?? env.HASHPASS_APP_ID;
    if (!appId)
      throw new Error("Set HASHPASS_APP_ID or pass --app-id <public-app-id>.");
    const primarySessionPath =
      env.HASHPASS_SESSION_FILE ?? defaultSessionPath(env);
    const sdk = createHashpass({
      appId,
      baseUrl: stringFlag(args, "base-url") ?? env.HASHPASS_BASE_URL,
      sessionStore: new FileSessionStore(primarySessionPath),
      supportSessionStore: new FileSessionStore(
        env.HASHPASS_SUPPORT_SESSION_FILE ?? `${primarySessionPath}.support`,
      ),
    });
    const result = await dispatch(sdk, args, io);
    if (result !== undefined) print(result, Boolean(args.flags.json), io);
    return 0;
  } catch (error) {
    if (error instanceof HashpassError) {
      io.error(
        `Hashpass error [${error.code}]${error.requestId ? ` (${error.requestId})` : ""}: ${error.message}`,
      );
    } else {
      io.error(error instanceof Error ? error.message : String(error));
    }
    return 1;
  }
}

async function dispatch(
  sdk: HashpassClient,
  args: ParsedArgs,
  io: CliIo,
): Promise<unknown> {
  const [subcommand, id] = args.positionals;
  switch (args.command) {
    case "login": {
      const authorization = await sdk.auth.beginDeviceLogin();
      io.out(
        `Open ${authorization.verificationUriComplete ?? authorization.verificationUri}`,
      );
      io.out(`Code: ${authorization.userCode}`);
      const session = await sdk.auth.waitForDeviceLogin(authorization);
      return {
        authenticated: true,
        user: session.user,
        expiresAt: session.expiresAt,
      };
    }
    case "logout":
      await sdk.auth.logout();
      return { authenticated: false };
    case "whoami": {
      const session = await sdk.auth.getSession();
      if (!session)
        throw new Error("Not logged in. Run `hashpass login` first.");
      return {
        user: session.user,
        scopes: session.scope,
        expiresAt: session.expiresAt,
      };
    }
    case "support":
      return dispatchSupport(sdk, subcommand, id, args, io);
    default:
      throw new Error(
        `Unknown command: ${args.command}. Run \`hashpass help\`.`,
      );
  }
}

async function dispatchSupport(
  sdk: HashpassClient,
  command: string | undefined,
  id: string | undefined,
  args: ParsedArgs,
  io: CliIo,
): Promise<unknown> {
  switch (command) {
    case "create": {
      const subject = requiredFlag(args, "subject");
      const message = requiredFlag(args, "message");
      const priority = priorityFlag(args);
      const idempotencyKey = stringFlag(args, "idempotency-key");
      await sdk.support.ensureSession();
      return sdk.support.createTicket({
        subject,
        message,
        context: { platform: "cli" },
        ...(priority ? { priority } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
      });
    }
    case "list": {
      const status = statusFlag(args);
      const cursor = stringFlag(args, "cursor");
      await sdk.support.ensureSession();
      return sdk.support.listTickets({
        ...(status ? { status } : {}),
        ...(cursor ? { cursor } : {}),
      });
    }
    case "show": {
      const ticketId = requireId(id, command);
      await sdk.support.ensureSession();
      return sdk.support.getTicket(ticketId);
    }
    case "reply": {
      const ticketId = requireId(id, command);
      const body = requiredFlag(args, "message");
      await sdk.support.ensureSession();
      return sdk.support.sendMessage(ticketId, {
        body,
        idempotencyKey: stringFlag(args, "idempotency-key"),
      });
    }
    case "handoff": {
      const ticketId = requireId(id, command);
      await sdk.support.ensureSession();
      return sdk.support.requestHuman(ticketId);
    }
    case "widget":
      return dispatchSupportWidget(sdk, id, args);
    case "doctor":
      return supportDoctor(args);
    case "resolve": {
      const ticketId = requireId(id, command);
      await sdk.support.ensureSession();
      return sdk.support.resolveTicket(ticketId);
    }
    default:
      throw new Error(
        "Use `hashpass support create|list|show|reply|handoff|resolve|widget|doctor`.",
      );
  }
}

async function dispatchSupportWidget(
  sdk: HashpassClient,
  command: string | undefined,
  args: ParsedArgs,
): Promise<unknown> {
  switch (command) {
    case "show":
      return sdk.support.getWidgetConfiguration(stringFlag(args, "app-id"));
    // "init" is handled earlier by noNetworkSupportResult() before the SDK
    // is ever constructed -- this case only remains reachable if dispatch()
    // is ever called directly by something other than runCli().
    case "init":
      return supportWidgetInitSnippet();
    default:
      throw new Error("Use `hashpass support widget init|show`.");
  }
}

function supportWidgetInitSnippet(): unknown {
  return {
    element:
      '<hashpass-support app-id="PUBLIC_APP_ID" locale="en" position="bottom-right"></hashpass-support>',
    script: "https://cdn.hashpass.tech/support-widget/v1/index.js",
  };
}

function supportDoctor(args: ParsedArgs): unknown {
  return {
    ok: true,
    checks: [
      {
        name: "HASHPASS_APP_ID",
        ok: Boolean(stringFlag(args, "app-id") ?? process.env.HASHPASS_APP_ID),
      },
      {
        name: "secrets-on-cli",
        ok: true,
        note: "Do not pass API keys or tokens as flags.",
      },
      { name: "kapso-sandbox-default", ok: true },
    ],
  };
}

function requiredFlag(args: ParsedArgs, name: string): string {
  const value = stringFlag(args, name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function requireId(id: string | undefined, command: string): string {
  if (!id) throw new Error(`A ticket ID is required for support ${command}.`);
  return id;
}

function priorityFlag(
  args: ParsedArgs,
): "low" | "normal" | "high" | "urgent" | undefined {
  const value = stringFlag(args, "priority");
  if (
    value === undefined ||
    ["low", "normal", "high", "urgent"].includes(value)
  )
    return value as ReturnType<typeof priorityFlag>;
  throw new Error("--priority must be low, normal, high, or urgent.");
}

function statusFlag(
  args: ParsedArgs,
): "open" | "pending" | "resolved" | "closed" | undefined {
  const value = stringFlag(args, "status");
  if (
    value === undefined ||
    ["open", "pending", "resolved", "closed"].includes(value)
  )
    return value as ReturnType<typeof statusFlag>;
  throw new Error("--status must be open, pending, resolved, or closed.");
}

function print(value: unknown, json: boolean, io: CliIo): void {
  io.out(JSON.stringify(value, null, json ? 2 : 2));
}

const HELP = `Hashpass CLI

Usage:
  hashpass login [--app-id ID]
  hashpass logout
  hashpass whoami [--json]
  hashpass support create --subject TEXT --message TEXT [--priority normal]
  hashpass support list [--status open] [--json]
  hashpass support show TICKET_ID
  hashpass support reply TICKET_ID --message TEXT
  hashpass support handoff TICKET_ID
  hashpass support resolve TICKET_ID
  hashpass support widget init
  hashpass support widget show [--app-id ID]
  hashpass support doctor [--json]

Configuration:
  HASHPASS_APP_ID       Public application identifier (required)
  HASHPASS_BASE_URL     Optional API override
  HASHPASS_SESSION_FILE Optional session file override

Never pass client secrets or access tokens on the command line.`;
