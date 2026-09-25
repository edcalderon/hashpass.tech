const READ_METHODS = new Set([
  "search_support_articles", "get_support_article", "list_tickets", "search_tickets",
  "get_ticket", "get_customer", "search_customers",
]);

export class FrappeHelpdeskClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl ?? process.env.FRAPPE_BASE_URL ?? "").replace(/\/$/, "");
    this.mode = options.mode ?? process.env.FRAPPE_MCP_MODE ?? "read";
    this.allowWrites = options.allowWrites ?? process.env.FRAPPE_MCP_ALLOW_WRITES === "true";
    this.fetch = options.fetch ?? globalThis.fetch;
    const readKey = options.readKey ?? process.env.FRAPPE_MCP_READ_API_KEY;
    const readSecret = options.readSecret ?? process.env.FRAPPE_MCP_READ_API_SECRET;
    const writeKey = options.writeKey ?? process.env.FRAPPE_MCP_WRITE_API_KEY;
    const writeSecret = options.writeSecret ?? process.env.FRAPPE_MCP_WRITE_API_SECRET;
    this.readToken = readKey && readSecret ? `token ${readKey}:${readSecret}` : "";
    this.writeToken = writeKey && writeSecret ? `token ${writeKey}:${writeSecret}` : "";
    if (!this.baseUrl || !this.fetch || !this.readToken) throw new Error("FRAPPE_BASE_URL and read-only service-user credentials are required");
  }

  async request(method, path, { query, body, httpMethod = "GET" } = {}) {
    const write = !READ_METHODS.has(method);
    if (write && (this.mode !== "write" || !this.allowWrites)) throw new Error(`Write tool ${method} is disabled`);
    if (write && !this.writeToken) throw new Error("Dedicated write service-user credentials are required");
    const url = new URL(`/api/${path.replace(/^\//, "")}`, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== "") url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
    }
    const response = await this.fetch(url, {
      method: httpMethod,
      headers: {Authorization: write ? this.writeToken : this.readToken, Accept: "application/json", "Content-Type": "application/json"},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Frappe ${response.status}: ${payload.message ?? payload.exception ?? "request failed"}`);
    return payload.data ?? payload.message ?? payload;
  }

  searchSupportArticles(query, limit = 20) { return this.request("search_support_articles", "resource/HD Article", {query: {fields: ["name","title","category","modified"], filters: [["HD Article","status","=","Published"],["HD Article","title","like",`%${query}%`]], limit_page_length: limit}}); }
  getSupportArticle(name) { return this.request("get_support_article", `resource/HD Article/${encodeURIComponent(name)}`); }
  listTickets({status, limit = 20} = {}) { return this.request("list_tickets", "resource/HD Ticket", {query: {fields: ["name","subject","status","priority","contact","agent_group","modified"], filters: status ? [["HD Ticket","status","=",status]] : [], order_by: "modified desc", limit_page_length: limit}}); }
  searchTickets(query, limit = 20) { return this.request("search_tickets", "resource/HD Ticket", {query: {fields: ["name","subject","status","priority","modified"], filters: [["HD Ticket","subject","like",`%${query}%`]], limit_page_length: limit}}); }
  getTicket(name) { return this.request("get_ticket", `resource/HD Ticket/${encodeURIComponent(name)}`); }
  createTicket(data) { return this.request("create_ticket", "resource/HD Ticket", {httpMethod: "POST", body: data}); }
  updateTicket(name, data) { return this.request("update_ticket", `resource/HD Ticket/${encodeURIComponent(name)}`, {httpMethod: "PUT", body: data}); }
  replyToTicket(name, content) { return this.request("reply_to_ticket", "resource/HD Ticket Comment", {httpMethod: "POST", body: {reference_ticket: name, content}}); }
  assignTicket(name, agent) { return this.updateTicket(name, {_assign: JSON.stringify([agent])}); }
  setTicketPriority(name, priority) { return this.updateTicket(name, {priority}); }
  closeTicket(name) { return this.updateTicket(name, {status: "Closed"}); }
  reopenTicket(name) { return this.updateTicket(name, {status: "Open"}); }
  getCustomer(name) { return this.request("get_customer", `resource/Contact/${encodeURIComponent(name)}`); }
  searchCustomers(query, limit = 20) { return this.request("search_customers", "resource/Contact", {query: {fields: ["name","first_name","last_name","email_id","modified"], filters: [["Contact","email_id","like",`%${query}%`]], limit_page_length: limit}}); }
}
