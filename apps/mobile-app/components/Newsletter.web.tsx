'use client'
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';

// Load cap-widget from CDN so Metro never tries to bundle the browser-only package.
// Uses customElements.whenDefined so callers don't have to guess when it's ready.
function loadCapWidget(): Promise<void> {
    if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
    if (customElements.get('cap-widget')) return Promise.resolve();
    const existing = document.querySelector('script[data-cap-widget]');
    if (existing) return customElements.whenDefined('cap-widget').then(() => undefined);
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.type = 'module';
        script.src = 'https://unpkg.com/@cap.js/widget@0.1.56';
        script.dataset.capWidget = '';
        script.addEventListener('load', () =>
            customElements.whenDefined('cap-widget').then(() => resolve()).catch(reject)
        );
        script.addEventListener('error', () => reject(new Error('Failed to load security check script')));
        document.head.appendChild(script);
    });
}
import { Image } from 'react-native';
import { useTranslation, getCurrentLocale } from '../i18n/i18n';
import { useTheme } from '../hooks/useTheme';
import { apiClient } from '../lib/api-client';

type Mode = "light" | "dark";

interface Props {
    mode: Mode;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MotionDiv = motion.div as React.ComponentType<any>;

// Diverse pool: women, men, different ethnicities, plus a couple brand-style gradient avatars
const AVATAR_POOL = [
    // Women
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?q=80&w=200&auto=format&fit=crop',
    // Men
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1463453091185-61582044d556?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1633332755192-727a05c4013d?q=80&w=200&auto=format&fit=crop',
    // Brand / abstract (colorful tech-style faces)
    'https://images.unsplash.com/photo-1561037404-61cd46aa615b?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1586297135537-94bc9ba060aa?q=80&w=200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1654110455429-cf322b40a906?q=80&w=200&auto=format&fit=crop',
];

function shuffleAndPick<T>(arr: T[], n: number): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
}

const Newsletter = ({ mode }: Props) => {
    const { t } = useTranslation('newsletter');
    const { isDark } = useTheme();

    const [email, setEmail] = useState('');
    const [subscribed, setSubscribed] = useState(false);
    const [error, setError] = useState('');
    const [infoMessage, setInfoMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [subscribers, setSubscribers] = useState(1000);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const [capError, setCapError] = useState<string | null>(null);
    const [capRetryKey, setCapRetryKey] = useState(0);
    const [countdown, setCountdown] = useState<number | null>(null);

    // Randomly pick 5 avatars once on mount — stays stable across re-renders
    const [avatarUrls] = useState(() => shuffleAndPick(AVATAR_POOL, 5));

    // 15-second countdown that auto-resets the form after subscribing
    useEffect(() => {
        if (!subscribed) {
            setCountdown(null);
            return;
        }
        setCountdown(9);
        const id = setInterval(() => {
            setCountdown(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(id);
                    setSubscribed(false);
                    setEmail('');
                    return null;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [subscribed]);

    // Wave animation: trigger once when avatar group scrolls into view
    const avatarGroupRef = useRef<HTMLDivElement>(null);
    const isInView = useInView(avatarGroupRef as React.RefObject<Element>, { once: true, amount: 0.6 });

    // Container div where we'll imperatively mount cap-widget
    const capContainerRef = useRef<HTMLDivElement>(null);
    const capWidgetRef = useRef<HTMLElement | null>(null);

    const isEmailValid = EMAIL_RE.test(email.trim());

    // Mount / unmount cap-widget imperatively when email becomes valid / invalid.
    // Setting the api-endpoint attribute BEFORE appendChild guarantees connectedCallback
    // reads it correctly — avoids the "Missing API endpoint" race condition.
    useEffect(() => {
        if (!isEmailValid) {
            if (capWidgetRef.current) {
                capWidgetRef.current.remove();
                capWidgetRef.current = null;
            }
            setCaptchaToken(null);
            setCapError(null);
            return;
        }

        if (capWidgetRef.current) return;

        let cancelled = false;
        setCapError(null);

        // Store listeners so the outer cleanup can remove them
        let onSolve: ((e: Event) => void) | null = null;
        let onReset: (() => void) | null = null;
        let onCapError: ((e: Event) => void) | null = null;

        loadCapWidget().then(() => {
            if (cancelled || capWidgetRef.current || !capContainerRef.current) return;

            try {
                const locale = getCurrentLocale();
                // Map app locales to cap's built-in language pack keys.
                // Korean is not in cap's pack — fall back to explicit i18n attributes.
                const CAP_LANG_MAP: Record<string, string> = {
                    es: 'es', fr: 'fr', de: 'de', pt: 'pt',
                    ru: 'ru', ja: 'ja', ar: 'ar', hi: 'hi',
                };
                const KO_I18N: Record<string, string> = {
                    'initial-state': '사람임을 확인하세요',
                    'verifying-label': '확인 중...',
                    'solved-label': '사람입니다',
                    'error-label': '오류. 다시 시도하세요.',
                };

                const widget = document.createElement('cap-widget');
                // Cap challenge/redeem are Expo Router file routes served from the same
                // origin as the web app — never from the remote Lambda (api.hashpass.tech).
                // Always use window.location.origin so the widget hits the correct server.
                const capApiEndpoint = `${window.location.origin}/api/captcha/`;
                widget.setAttribute('data-cap-api-endpoint', capApiEndpoint);
                widget.setAttribute('data-cap-disable-haptics', '');
                if (CAP_LANG_MAP[locale]) {
                    widget.setAttribute('data-cap-lang', CAP_LANG_MAP[locale]);
                } else if (locale === 'ko') {
                    for (const [key, val] of Object.entries(KO_I18N)) {
                        widget.setAttribute(`data-cap-i18n-${key}`, val);
                    }
                }

                onSolve = (e: Event) => {
                    const token = (e as CustomEvent<{ token: string }>).detail?.token;
                    if (token) setCaptchaToken(token);
                };
                onReset = () => setCaptchaToken(null);
                onCapError = (e: Event) => {
                    const msg = (e as CustomEvent<{ message?: string }>).detail?.message;
                    console.error('[cap-widget] error event:', msg || e);
                    setCapError(t('capError'));
                };

                widget.addEventListener('solve', onSolve);
                widget.addEventListener('reset', onReset);
                widget.addEventListener('error', onCapError);

                capWidgetRef.current = widget;
                capContainerRef.current.appendChild(widget);
            } catch (err) {
                if (!cancelled) {
                    console.error('[cap-widget] mount failed:', err);
                    setCapError(t('capError'));
                }
            }
        }).catch((err) => {
            if (!cancelled) {
                console.error('[cap-widget] import failed:', err);
                setCapError(t('capError'));
            }
        });

        return () => {
            cancelled = true;
            const w = capWidgetRef.current;
            if (w) {
                if (onSolve) w.removeEventListener('solve', onSolve);
                if (onReset) w.removeEventListener('reset', onReset);
                if (onCapError) w.removeEventListener('error', onCapError);
                w.remove();
                capWidgetRef.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isEmailValid, capRetryKey]);

    const handleSubscribe = async () => {
        setError('');
        setInfoMessage('');

        if (!email.trim()) {
            setError(t('errorRequired'));
            return;
        }

        if (!isEmailValid) {
            setError(t('errorInvalidEmail'));
            return;
        }

        if (!captchaToken) {
            setError(t('errorCaptchaRequired'));
            return;
        }

        setIsLoading(true);

        // Capture and immediately clear the token — it's single-use.
        // Clearing before the request prevents a second submit reusing the
        // same (now-consumed) token if the endpoint fails and the user retries.
        const tokenToSubmit = captchaToken;
        setCaptchaToken(null);

        try {
            const locale = getCurrentLocale();

            const response = await apiClient.post('/subscribe', {
                email,
                locale,
                captchaToken: tokenToSubmit,
            }, {
                skipEventSegment: true
            });

            if (!response.success) {
                if ((response as any).alreadySubscribed) {
                    setInfoMessage(t('alreadySubscribed'));
                } else {
                    setError(response.error || t('errorFailed'));
                    if ((response as any).captchaExpired) {
                        setCaptchaToken(null);
                        setCapRetryKey(k => k + 1);
                    }
                }
                return;
            }

            setSubscribed(true);
            setSubscribers(s => s + 1);
        } catch (err) {
            console.error('Subscription error:', err);
            setError(err instanceof Error ? err.message : t('errorFailed'));
        } finally {
            setIsLoading(false);
            // Always reset the captcha widget after a submit so the user gets a
            // fresh challenge on retry (the old token was consumed by the attempt).
            setCapRetryKey(k => k + 1);
        }
    };

    return (
        <div className='flex justify-center items-center py-8 md:py-20 px-4 w-full'>
            <div
                className="w-full max-w-md rounded-xl p-6 overflow-hidden z-50 transition-all duration-300"
                style={{ backgroundColor: mode === "dark" ? 'transparent' : '#FFFFFF' }}
            >
                <AnimatePresence>
                    {!subscribed ? (
                        <MotionDiv
                            key="form"
                            initial={{ opacity: 1, scale: 1 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.3 }}
                            className='flex flex-col justify-center items-center h-full'
                        >
                            <div className='text-center mb-6'>
                                <h2 className={`text-2xl font-bold mb-2 ${mode === "dark" ? 'text-white' : 'text-black'}`}>
                                    {t('title')}
                                </h2>
                                <p className='text-sm text-gray-500 dark:text-gray-400 text-black dark:text-white'>
                                    {t('subtitle')}
                                </p>
                            </div>

                            {/* Avatar group — wave animation triggers once on scroll into view */}
                            <div
                                ref={avatarGroupRef}
                                className='flex justify-center items-center mb-6 relative h-12 w-full'
                            >
                                <div className='flex relative'>
                                    {avatarUrls.map((url, index) => (
                                        <MotionDiv
                                            key={index}
                                            className='relative rounded-full overflow-hidden border-2 border-white dark:border-gray-800'
                                            style={{
                                                width: 40,
                                                height: 40,
                                                marginLeft: index > 0 ? -10 : 0,
                                                zIndex: avatarUrls.length - index,
                                            }}
                                            // Wave: bounce up then back down, staggered per avatar
                                            animate={isInView ? { y: [0, -10, 2, 0] } : { y: 0 }}
                                            transition={{
                                                delay: index * 0.1,
                                                duration: 0.5,
                                                ease: 'easeInOut',
                                            }}
                                            whileHover={{ scale: 1.15, y: -4, zIndex: 10 }}
                                        >
                                            <Image
                                                source={{ uri: url }}
                                                alt={`Subscriber ${index + 1}`}
                                                style={{ width: '100%', height: '100%' }}
                                                resizeMode='cover'
                                            />
                                        </MotionDiv>
                                    ))}
                                </div>
                                <span className='ml-3 text-sm text-gray-500 dark:text-gray-400'>
                                    <span className='font-bold'>{subscribers}+</span> {t('subscribers')}
                                </span>
                            </div>

                            <div className='w-full space-y-4 mt-6'>
                                <div className='relative'>
                                    <div className={`relative flex items-center rounded-full border ${error ? 'border-red-500' : 'border-gray-200 dark:border-gray-700'} focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent transition-all duration-200 ${mode === "dark" ? 'bg-transparent' : 'bg-white'}`}>
                                        <svg className='h-5 w-5 text-gray-400 absolute left-3' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' />
                                        </svg>
                                        <input
                                            type='email'
                                            value={email}
                                            onChange={(e) => {
                                                setEmail(e.target.value);
                                                if (error) setError('');
                                                if (infoMessage) setInfoMessage('');
                                            }}
                                            placeholder={t('emailPlaceholder')}
                                            className='w-full px-4 py-3 pl-10 text-sm sm:text-base rounded-full bg-transparent outline-none transition-all duration-200 placeholder-gray-400 dark:placeholder-white dark:text-white text-gray-600 dark:text-gray-300'
                                            disabled={isLoading}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleSubscribe();
                                                }
                                            }}
                                        />
                                    </div>
                                    {error && (
                                        <p className='mt-1.5 text-xs text-red-500 dark:text-red-400 flex items-center'>
                                            <svg xmlns='http://www.w3.org/2000/svg' className='h-3.5 w-3.5 mr-1 shrink-0' viewBox='0 0 20 20' fill='currentColor'>
                                                <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2z' clipRule='evenodd' />
                                            </svg>
                                            {error}
                                        </p>
                                    )}
                                    {infoMessage && (
                                        <p className='mt-1.5 text-xs text-emerald-600 dark:text-emerald-400 flex items-center'>
                                            <svg xmlns='http://www.w3.org/2000/svg' className='h-3.5 w-3.5 mr-1 shrink-0' viewBox='0 0 20 20' fill='currentColor'>
                                                <path fillRule='evenodd' d='M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z' clipRule='evenodd' />
                                            </svg>
                                            {infoMessage}
                                        </p>
                                    )}
                                </div>

                                {/* Cap proof-of-work widget — mounts imperatively when email is valid */}
                                {isEmailValid && (
                                    <div className="flex flex-col items-center gap-2">
                                        <div ref={capContainerRef} className="flex justify-center" />
                                        {capError && (
                                            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                                </svg>
                                                <span>{capError}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setCapError(null);
                                                        setCaptchaToken(null);
                                                        setCapRetryKey(k => k + 1);
                                                    }}
                                                    className="underline font-medium hover:no-underline"
                                                >
                                                    {t('capRetry')}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleSubscribe();
                                    }}
                                    disabled={isLoading || (isEmailValid && !captchaToken)}
                                    className={`w-full rounded-full font-medium py-3 px-6 transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center space-x-2 shadow-lg hover:shadow-xl disabled:hover:shadow-none ${isDark
                                            ? 'bg-cyan-700 hover:bg-cyan-700 text-white hover:shadow-cyan-900/50'
                                            : 'bg-red-700 hover:bg-red-600 text-white hover:shadow-red-500/20'
                                        }`}
                                >
                                    {isLoading ? (
                                        <>
                                            <svg className='animate-spin h-4 w-4 text-white' xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24'>
                                                <circle className='opacity-25' cx='12' cy='12' r='10' stroke='currentColor' strokeWidth='4'></circle>
                                                <path className='opacity-75' fill='currentColor' d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'></path>
                                            </svg>
                                            <span>{t('processing')}</span>
                                        </>
                                    ) : (
                                        <span>{t('subscribe')}</span>
                                    )}
                                </button>
                            </div>

                            <p className='text-xs text-center text-gray-400 dark:text-gray-500 mt-4 px-4'>
                                {t('privacy')}
                            </p>
                        </MotionDiv>
                    ) : (
                        <MotionDiv
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 1.05 }}
                            transition={{ duration: 0.3, type: 'spring', stiffness: 500, damping: 30 }}
                            className='flex flex-col items-center justify-center h-full text-center p-4'
                            style={{ backgroundColor: 'transparent' }}
                        >
                            <div className='w-20 h-20 bg-green-100 dark:bg-green-900/50 rounded-full flex items-center justify-center mb-6 shadow-inner'>
                                <svg xmlns='http://www.w3.org/2000/svg' className='h-10 w-10 text-green-600 dark:text-green-400' fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth='2'>
                                    <path strokeLinecap='round' strokeLinejoin='round' d='M5 13l4 4L19 7' />
                                </svg>
                            </div>
                            <h3 className={`text-2xl font-bold mb-3 ${isDark ? 'text-white' : 'text-black'}`}>{t('successTitle')}</h3>
                            <p className='text-gray-600 dark:text-gray-300 mb-6 max-w-xs'>
                                {getCurrentLocale() === 'ko' ? (
                                    <>
                                        <span className='font-bold'>{email}</span> {t('successMessage')} {t('successMessageEmail')}
                                    </>
                                ) : (
                                    <>
                                        {t('successMessage')} <span className='font-bold'>{email}</span>. {t('successMessageEmail')}
                                    </>
                                )}
                            </p>
                            {countdown !== null && (
                                <div className='flex flex-col items-center gap-3 mt-2'>
                                    <div className='relative w-12 h-12'>
                                        <svg className='w-12 h-12 -rotate-90' viewBox='0 0 36 36'>
                                            <circle cx='18' cy='18' r='15.5' fill='none' stroke='currentColor' strokeWidth='2' className='text-gray-200 dark:text-gray-700' />
                                            <circle
                                                cx='18' cy='18' r='15.5' fill='none' stroke='currentColor' strokeWidth='2'
                                                strokeDasharray={`${2 * Math.PI * 15.5}`}
                                                strokeDashoffset={`${2 * Math.PI * 15.5 * (1 - countdown / 9)}`}
                                                strokeLinecap='round'
                                                className='text-blue-500 dark:text-blue-400 transition-all duration-1000 ease-linear'
                                            />
                                        </svg>
                                        <span className='absolute inset-0 flex items-center justify-center text-sm font-semibold text-gray-600 dark:text-gray-300'>
                                            {countdown}
                                        </span>
                                    </div>
                                    <p className='text-xs text-gray-400 dark:text-gray-500 tracking-wide'>{t('autoReturning')}</p>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            setSubscribed(false);
                                            setEmail('');
                                        }}
                                        className='text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors flex items-center group'
                                    >
                                        <svg xmlns='http://www.w3.org/2000/svg' className='h-4 w-4 mr-1 transform group-hover:-translate-x-0.5 transition-transform' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                                            <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M10 19l-7-7m0 0l7-7m-7 7h18' />
                                        </svg>
                                        <span className='group-hover:translate-x-0.5 transition-transform'>{t('backToForm')}</span>
                                    </button>
                                </div>
                            )}
                        </MotionDiv>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Newsletter;
