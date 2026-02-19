'use client'
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image } from 'react-native';
import { useTranslation, getCurrentLocale } from '../i18n/i18n';
import { useTheme } from '../hooks/useTheme';
import { apiClient } from '../lib/api-client';
type Mode = "light" | "dark";

interface Props {
    mode: Mode;
}

const Newsletter = ({ mode }: Props) => {
    const { t } = useTranslation('newsletter');
    const [email, setEmail] = useState('');
    const [subscribed, setSubscribed] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [subscribers, setSubscribers] = useState(1000);
    const { isDark } = useTheme();

    const validateEmail = (email: string) => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    };

    const imageUrls = [
        'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?q=80&w=1780&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
        'https://images.unsplash.com/photo-1654110455429-cf322b40a906?q=80&w=1780&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
        'https://images.unsplash.com/photo-1527980965255-d3b416303d12?q=80&w=1780&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
        'https://images.unsplash.com/photo-1633332755192-727a05c4013d?q=80&w=1780&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
        'https://images.unsplash.com/photo-1586297135537-94bc9ba060aa?q=80&w=1780&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
    ];

    const zIndices = [5, 4, 3, 2, 1];

    const handleSubscribe = async () => {
        setError('');

        if (!email) {
            setError('Email is required');
            return;
        }

        if (!validateEmail(email)) {
            setError('Please enter a valid email address');
            return;
        }

        setIsLoading(true);

        try {
            const locale = getCurrentLocale();
            
            // Use the API client which already points to the .co domain
            // Subscribe is a global endpoint, not event-specific, so skip the event segment
            const response = await apiClient.post('/subscribe', {
                email,
                locale
            }, {
                skipEventSegment: true
            });

            if (!response.success) {
                // Check if the error is "already subscribed" - treat this as a success
                const errorMessage = response.error || '';
                if (errorMessage.toLowerCase().includes('already subscribed')) {
                    // Show success message for already subscribed users
                    setSubscribed(true);
                    // Don't increment subscriber count since they're already subscribed
                } else {
                    // Show error for other cases
                    setError(errorMessage || 'Failed to subscribe. Please try again.');
                }
                return;
            }

            // Success case - new subscription
            setSubscribed(true);
            setSubscribers(subscribers + 1);
        } catch (error) {
            console.error('Subscription error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to subscribe. Please try again.';
            
            // Check if error is about already being subscribed
            if (errorMessage.toLowerCase().includes('already subscribed')) {
                setSubscribed(true);
            } else {
                setError(errorMessage);
            }
        } finally {
            setIsLoading(false);
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
                        <motion.div
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

                            <div className='flex justify-center items-center mb-6 relative h-12 w-full'>
                                <div className='flex relative'>
                                    {imageUrls.map((url, index) => (
                                        <div
                                            key={index}
                                            className='relative rounded-full overflow-hidden border-2 border-white dark:border-gray-800 transition-transform hover:scale-110'
                                            style={{
                                                width: 40,
                                                height: 40,
                                                marginLeft: index > 0 ? -10 : 0,
                                                zIndex: zIndices[index]
                                            }}
                                        >
                                            <Image
                                                source={{ uri: url }}
                                                alt={`Subscriber ${index + 1}`}
                                                style={{ width: '100%', height: '100%' }}
                                                resizeMode='cover'
                                            />
                                        </div>
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
                                            }}
                                            placeholder={t('emailPlaceholder')}
                                            className='w-full px-4 py-3 pl-10 text-sm sm:text-base rounded-full  bg-transparent outline-none transition-all duration-200 placeholder-gray-400 dark:placeholder-white dark:text-white text-gray-600 dark:text-gray-300'
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
                                            <svg xmlns='http://www.w3.org/2000/svg' className='h-3.5 w-3.5 mr-1' viewBox='0 0 20 20' fill='currentColor'>
                                                <path fillRule='evenodd' d='M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2z' clipRule='evenodd' />
                                            </svg>
                                            {error}
                                        </p>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleSubscribe();
                                    }}
                                    disabled={isLoading}
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
                                        <>
                                            <span>{t('subscribe')}</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            <p className='text-xs text-center text-gray-400 dark:text-gray-500 mt-4 px-4'>
                                {t('privacy')}
                            </p>
                        </motion.div>
                    ) : (
                        <motion.div
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
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setSubscribed(false);
                                    setEmail('');
                                }}
                                className='text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors flex items-center group'
                            >
                                <span className='group-hover:-translate-x-0.5 transition-transform'>{t('backToForm')}</span>
                                <svg xmlns='http://www.w3.org/2000/svg' className='h-4 w-4 ml-1 transform group-hover:translate-x-0.5 transition-transform' fill='none' viewBox='0 0 24 24' stroke='currentColor'>
                                    <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M14 5l7 7m0 0l-7 7m7-7H3' />
                                </svg>
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default Newsletter;