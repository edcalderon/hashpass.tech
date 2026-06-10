
const { createClient } = require('@supabase/supabase-js');

// Mock environment variables
const supabaseUrl = 'https://example.supabase.co';
const supabaseServiceKey = 'mock-service-key';

// Simulate customFetch from lib/supabase-server.ts
const customFetch = async (url, options = {}) => {
    console.log('customFetch called with:', url);

    // Handle different input types for url
    let urlString;
    if (typeof url === 'string') {
        urlString = url;
    } else if (url instanceof URL) {
        urlString = url.toString();
    } else {
        // Request object
        urlString = url.url;
    }

    // This is the suspicious part: creating new Headers from options.headers
    const headers = new Headers(options.headers);

    if (!headers.has('apikey') && supabaseServiceKey) {
        headers.set('apikey', supabaseServiceKey);
    }

    // Convert Headers to plain object for maximum compatibility with undici/node-fetch
    const headersPlain = {};
    headers.forEach((value, key) => {
        headersPlain[key] = value;
    });

    try {
        const response = await fetch(urlString, {
            ...options,
            headers: headersPlain,
        });
        return response;
    } catch (error) {
        console.error('❌ Supabase Custom Fetch Error:', {
            message: error.message,
            cause: error.cause,
            code: error.code,
            name: error.name,
            url: urlString.replace(supabaseUrl || '', '[REDACTED_URL]'), // Redact base URL if possible
            headers: Object.keys(headersPlain), // Log which headers were sent (keys only)
        });
        throw error;
    }
};

async function run() {
    try {
        console.log('Testing customFetch with native fetch...');

        // Test 1: Simple fetch
        try {
            await customFetch('https://httpbin.org/get');
            console.log('Test 1 passed');
        } catch (e) {
            console.error('Test 1 failed:', e);
        }

        // Test 2: Fetch with existing headers (plain object)
        try {
            await customFetch('https://httpbin.org/get', {
                headers: { 'X-Custom': 'value' }
            });
            console.log('Test 2 passed');
        } catch (e) {
            console.error('Test 2 failed:', e);
        }

        // Test 3: Fetch with existing headers (Headers object)
        try {
            const h = new Headers();
            h.append('X-Custom', 'value');
            await customFetch('https://httpbin.org/get', {
                headers: h
            });
            console.log('Test 3 passed');
        } catch (e) {
            console.error('Test 3 failed:', e);
        }

    } catch (e) {
        console.error('Global error:', e);
    }
}

run();
