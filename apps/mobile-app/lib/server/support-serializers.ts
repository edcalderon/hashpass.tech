// Shapes DB rows into the exact JSON the SDK expects (SupportTicket/SupportMessage
// in packages/sdk/src/support/types.ts) -- shared across every /v1/support/*
// and /v1/admin/support/* route that returns a ticket or message.

export function serializeSupportTicket(row: Record<string, unknown>) {
  return {
    id: row.id,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function serializeSupportMessage(row: Record<string, unknown>) {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    author: row.author,
    body: row.body,
    createdAt: row.created_at,
    deliveryStatus: row.delivery_status,
  };
}
