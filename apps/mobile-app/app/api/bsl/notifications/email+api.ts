import { sendSubscriptionConfirmation } from '@/lib/email';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const to = body?.to;
  const subject = body?.subject || 'BSL 2025 Notification';
  const html = body?.html || '<p>Notification</p>';
  if (!to) return new Response(JSON.stringify({ error: 'Missing to' }), { status: 400 });

  // Reuse nodemailer transporter in lib/email via a generic send
  try {
    // Placeholder: use sendSubscriptionConfirmation as a stub in sandbox mode
    const res = await sendSubscriptionConfirmation(to, 'en');
    if (!res.success) {
      return new Response(JSON.stringify({ error: res.error || 'Email not sent (sandbox)' }), { status: 202 });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Email failed' }), { status: 500 });
  }
}


