import { createHmac } from 'crypto';

function getSecret(): string {
    // Prefer a dedicated secret; fall back to service role key (always present server-side)
    return (
        process.env.UNSUBSCRIBE_SECRET ||
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_ROLE_KEY_PROD ||
        'hashpass-unsubscribe-fallback'
    );
}

export function generateUnsubscribeToken(email: string): string {
    const hmac = createHmac('sha256', getSecret())
        .update(email.toLowerCase().trim())
        .digest('hex')
        .slice(0, 32);
    return Buffer.from(email.toLowerCase().trim()).toString('base64url') + '.' + hmac;
}

export function verifyUnsubscribeToken(token: string): string | null {
    const dot = token.lastIndexOf('.');
    if (dot < 0) return null;
    try {
        const emailRaw = Buffer.from(token.slice(0, dot), 'base64url').toString('utf8');
        const expected = generateUnsubscribeToken(emailRaw);
        // Constant-time comparison to avoid timing attacks
        if (token.length !== expected.length) return null;
        let diff = 0;
        for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ expected.charCodeAt(i);
        return diff === 0 ? emailRaw : null;
    } catch {
        return null;
    }
}
