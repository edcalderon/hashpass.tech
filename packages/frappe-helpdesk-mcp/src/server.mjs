#!/usr/bin/env node
import {resolve} from "node:path";
import {realpathSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {McpServer} from "@modelcontextprotocol/sdk/server/mcp.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {z} from "zod";
import {FrappeHelpdeskClient} from "./client.mjs";

export const READ_TOOL_NAMES = Object.freeze([
  "hashpass_helpdesk_search_support_articles",
  "hashpass_helpdesk_get_support_article",
  "hashpass_helpdesk_list_tickets",
  "hashpass_helpdesk_search_tickets",
  "hashpass_helpdesk_get_ticket",
  "hashpass_helpdesk_get_customer",
  "hashpass_helpdesk_search_customers",
]);

export const WRITE_TOOL_NAMES = Object.freeze([
  "hashpass_helpdesk_create_ticket",
  "hashpass_helpdesk_update_ticket",
  "hashpass_helpdesk_reply_to_ticket",
  "hashpass_helpdesk_assign_ticket",
  "hashpass_helpdesk_set_ticket_priority",
  "hashpass_helpdesk_close_ticket",
  "hashpass_helpdesk_reopen_ticket",
]);

export function enabledToolNames({mode = "read", allowWrites = false} = {}) {
  return mode === "write" && allowWrites ? [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES] : [...READ_TOOL_NAMES];
}

const result = async fn => {
  try {
    return {content: [{type: "text", text: JSON.stringify(await fn(), null, 2)}]};
  } catch (error) {
    return {isError: true, content: [{type: "text", text: error.message}]};
  }
};

export function createFrappeHelpdeskServer(client) {
  const server = new McpServer({name: "hashpass-helpdesk-mcp-server", version: "0.1.0"});

  server.tool("hashpass_helpdesk_search_support_articles", "Search published Hashpass support articles.", {query: z.string(), limit: z.number().int().min(1).max(100).optional()}, args => result(() => client.searchSupportArticles(args.query, args.limit)));
  server.tool("hashpass_helpdesk_get_support_article", "Get one Hashpass support article by ID.", {name: z.string()}, args => result(() => client.getSupportArticle(args.name)));
  server.tool("hashpass_helpdesk_list_tickets", "List support tickets, optionally filtered by status.", {status: z.string().optional(), limit: z.number().int().min(1).max(100).optional()}, args => result(() => client.listTickets(args)));
  server.tool("hashpass_helpdesk_search_tickets", "Search Hashpass support tickets by subject.", {query: z.string(), limit: z.number().int().min(1).max(100).optional()}, args => result(() => client.searchTickets(args.query, args.limit)));
  server.tool("hashpass_helpdesk_get_ticket", "Get one Hashpass support ticket by ID.", {name: z.string()}, args => result(() => client.getTicket(args.name)));
  server.tool("hashpass_helpdesk_get_customer", "Get one Hashpass support contact by ID.", {name: z.string()}, args => result(() => client.getCustomer(args.name)));
  server.tool("hashpass_helpdesk_search_customers", "Search Hashpass support contacts by email.", {query: z.string(), limit: z.number().int().min(1).max(100).optional()}, args => result(() => client.searchCustomers(args.query, args.limit)));

  if (client.mode !== "write" || !client.allowWrites) return server;

  server.tool("hashpass_helpdesk_create_ticket", "Create a new Hashpass support ticket.", {subject: z.string(), description: z.string(), priority: z.string().optional(), contact: z.string().optional()}, args => result(() => client.createTicket(args)));
  server.tool("hashpass_helpdesk_update_ticket", "Update fields on a Hashpass support ticket.", {name: z.string(), fields: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))}, args => result(() => client.updateTicket(args.name, args.fields)));
  server.tool("hashpass_helpdesk_reply_to_ticket", "Post a reply to a Hashpass support ticket.", {name: z.string(), content: z.string()}, args => result(() => client.replyToTicket(args.name, args.content)));
  server.tool("hashpass_helpdesk_assign_ticket", "Assign a Hashpass support ticket to an agent.", {name: z.string(), agent: z.string()}, args => result(() => client.assignTicket(args.name, args.agent)));
  server.tool("hashpass_helpdesk_set_ticket_priority", "Set a Hashpass support ticket priority.", {name: z.string(), priority: z.string()}, args => result(() => client.setTicketPriority(args.name, args.priority)));
  server.tool("hashpass_helpdesk_close_ticket", "Close a Hashpass support ticket.", {name: z.string()}, args => result(() => client.closeTicket(args.name)));
  server.tool("hashpass_helpdesk_reopen_ticket", "Reopen a Hashpass support ticket.", {name: z.string()}, args => result(() => client.reopenTicket(args.name)));
  return server;
}

async function main() {
  const server = createFrappeHelpdeskServer(new FrappeHelpdeskClient());
  await server.connect(new StdioServerTransport());
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))) await main();
