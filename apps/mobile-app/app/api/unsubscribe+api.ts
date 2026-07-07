import { getSupabaseServerForRequest } from '@/lib/supabase-server';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token';

const html = (title: string, heading: string, body: string, color = '#007AFF') => `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} – HASHPASS</title>
<style>body{margin:0;padding:0;background:#f0f0f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif}
.card{max-width:480px;margin:80px auto;background:#fff;border-radius:12px;padding:48px 40px;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,.08)}
h1{margin:0 0 12px;font-size:24px;color:#1d1d1f}p{margin:0 0 28px;color:#6e6e73;font-size:15px;line-height:1.6}
a{display:inline-block;background:${color};color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px}</style>
</head>
<body><div class="card">
<p style="font-size:40px;margin:0 0 16px">${color === '#34C759' ? '✅' : '😔'}</p>
<h1>${heading}</h1><p>${body}</p>
<a href="https://hashpass.tech">Back to HASHPASS</a>
</div></body></html>`;

export async function GET(request: Request) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
        return new Response(
            html('Invalid link', 'Invalid unsubscribe link', 'This unsubscribe link is missing required information. Please contact support@hashpass.tech.'),
            { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }

    const email = verifyUnsubscribeToken(token);
    if (!email) {
        return new Response(
            html('Invalid link', 'Invalid or expired link', 'This unsubscribe link is invalid or has expired. Please contact support@hashpass.tech if you need help.'),
            { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }

    const supabase = getSupabaseServerForRequest(request);

    const { error } = await supabase
        .from('newsletter_subscribers')
        .delete()
        .eq('email', email);

    if (error) {
        console.error('[unsubscribe] DB error:', error.message);
        return new Response(
            html('Error', 'Something went wrong', `We couldn't process your request. Please try again or email support@hashpass.tech.`),
            { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }

    console.log('[unsubscribe] removed:', email);
    return new Response(
        html('Unsubscribed', "You've been unsubscribed", `<strong>${email}</strong> has been removed from the HASHPASS newsletter. You won't receive any more emails from us.`, '#34C759'),
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}
