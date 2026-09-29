const READ_ACTIONS = new Set([
  "count",
  "download_url",
  "get_changelog",
  "get_features",
  "get_value",
  "get_values",
  "list",
  "list_archived",
  "list_definitions",
  "list_members",
  "list_options",
  "list_pages",
  "list_points",
  "list_project",
  "list_projects",
  "list_roles",
  "list_workitem_pages",
  "list_workitems",
  "list_workspace",
  "me",
  "read",
  "retrieve",
  "retrieve_by_identifier",
  "retrieve_option",
  "retrieve_role",
  "search",
  "search_pages",
  "worklog_summary",
]);

const WRITE_ACTIONS = new Set([
  "add_member",
  "add_pages",
  "add_projects",
  "archive",
  "attach",
  "attach_to_workitem",
  "complete",
  "create",
  "create_definition",
  "create_option",
  "create_points",
  "delete",
  "delete_definition",
  "delete_option",
  "delete_point",
  "delete_value",
  "detach",
  "detach_from_workitem",
  "import_to_project",
  "link",
  "manage_assignee",
  "manage_label",
  "manage_type_properties",
  "manage_workitems",
  "remove_member",
  "remove_page",
  "remove_projects",
  "resolve",
  "set_collection",
  "set_value",
  "set_values",
  "transfer_workitems",
  "unarchive",
  "update",
  "update_changelog",
  "update_definition",
  "update_features",
  "update_member",
  "update_option",
  "update_point",
  "upload_from_url",
]);

const PLANE_TOOLS = new Set([
  "collection",
  "customer",
  "customer_property",
  "customer_request",
  "cycle",
  "get_pql_reference",
  "initiative",
  "intake",
  "label",
  "member",
  "milestone",
  "module",
  "page",
  "project",
  "project_estimate",
  "release",
  "release_label",
  "release_tag",
  "state",
  "template",
  "work_log",
  "workitem",
  "workitem_activity",
  "workitem_attachment",
  "workitem_comment",
  "workitem_link",
  "workitem_property",
  "workitem_relation",
  "workitem_type",
  "workspace",
]);

const READ_PROTOCOL_METHODS = new Set([
  "initialize",
  "notifications/cancelled",
  "notifications/initialized",
  "ping",
  "tools/list",
]);

const normalizedSet = (values) =>
  new Set(
    Array.isArray(values)
      ? values.filter((value) => typeof value === "string").map((value) => value.trim().toLowerCase()).filter(Boolean)
      : [],
  );

export function classifyPlaneAction(action) {
  if (typeof action !== "string" || !action.trim()) {
    throw new TypeError("Invalid Plane action");
  }

  const normalized = action.trim().toLowerCase();
  if (READ_ACTIONS.has(normalized)) return "read";
  if (WRITE_ACTIONS.has(normalized)) return "write";
  throw new Error(`Unsupported or unknown Plane action: ${normalized}`);
}

export function isPlaneIdentityAllowed({
  subject,
  email,
  emailVerified,
  allowedSubjects,
  allowedEmails,
  allowedEmailDomains,
} = {}) {
  const subjects = normalizedSet(allowedSubjects);
  const emails = normalizedSet(allowedEmails);
  const emailDomains = normalizedSet(allowedEmailDomains);
  const normalizedSubject = typeof subject === "string" ? subject.trim().toLowerCase() : "";
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (normalizedSubject && subjects.has(normalizedSubject)) return true;
  if (!normalizedEmail || emailVerified !== true) return false;
  if (emails.has(normalizedEmail)) return true;

  const separator = normalizedEmail.lastIndexOf("@");
  if (separator <= 0 || separator === normalizedEmail.length - 1) return false;
  return emailDomains.has(normalizedEmail.slice(separator + 1));
}

export function authorizePlaneRequest({
  body,
  scopes,
  subject,
  email,
  emailVerified,
  allowedSubjects,
  allowedEmails,
  allowedEmailDomains,
} = {}) {
  if (!isPlaneIdentityAllowed({
    subject,
    email,
    emailVerified,
    allowedSubjects,
    allowedEmails,
    allowedEmailDomains,
  })) {
    return {allowed: false, reason: "identity_not_allowed"};
  }
  if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.method !== "string") {
    return {allowed: false, reason: "invalid_request"};
  }

  const grantedScopes = new Set(Array.isArray(scopes) ? scopes : []);
  if (READ_PROTOCOL_METHODS.has(body.method)) {
    return grantedScopes.has("plane:read")
      ? {allowed: true, access: "read"}
      : {allowed: false, reason: "insufficient_scope", requiredScope: "plane:read"};
  }

  if (body.method !== "tools/call") return {allowed: false, reason: "unsupported_method"};

  const toolName = body.params?.name;
  const args = body.params?.arguments;
  if (typeof toolName !== "string" || !toolName || !PLANE_TOOLS.has(toolName) || !args || typeof args !== "object") {
    return {allowed: false, reason: "invalid_tool_call"};
  }

  let access;
  try {
    access = toolName === "get_pql_reference" ? "read" : classifyPlaneAction(args.action);
  } catch {
    return {allowed: false, reason: "unsupported_action"};
  }

  const requiredScope = access === "write" ? "plane:write" : "plane:read";
  return grantedScopes.has(requiredScope)
    ? {allowed: true, access}
    : {allowed: false, reason: "insufficient_scope", requiredScope};
}

export const planePolicy = Object.freeze({
  readActions: READ_ACTIONS,
  writeActions: WRITE_ACTIONS,
  tools: PLANE_TOOLS,
});
