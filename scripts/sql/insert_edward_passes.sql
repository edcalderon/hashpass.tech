-- Insert Edward Calderon's passes (bypassing RLS)
INSERT INTO public.passes (id, user_id, event_id, pass_type, status, purchase_date, price_usd, access_features) VALUES
(
    'edward-calderon-unal-general-20250115',
    'edward-calderon-unal',
    'bsl2025',
    'general',
    'active',
    NOW(),
    99.00,
    ARRAY[
        'All conferences (Nov 12-14)',
        'Booth area access',
        'Networking sessions'
    ]
),
(
    'edward-calderon-unal-business-20250115',
    'edward-calderon-unal',
    'bsl2025',
    'business',
    'active',
    NOW(),
    249.00,
    ARRAY[
        'All conferences (Nov 12-14)',
        'Booth area access',
        'Exclusive networking zone (B2B speed dating)',
        'Official closing party (Nov 14)'
    ]
),
(
    'edward-calderon-unal-vip-20250115',
    'edward-calderon-unal',
    'bsl2025',
    'vip',
    'active',
    NOW(),
    499.00,
    ARRAY[
        'All conferences (Nov 12-14)',
        'Booth area access',
        'Exclusive networking zone (B2B speed dating)',
        'Welcome cocktail (Nov 12)',
        'VIP area access (exclusive networking with speakers, sponsors, authorities)',
        'Official closing party (Nov 14)'
    ]
);
