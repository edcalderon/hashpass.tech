import { createContext, useContext } from 'react';
import type { MessagingContextValue } from '../types/contact-messaging';
export const ContactMessagingContext = createContext<MessagingContextValue | null>(null);
export const useContactMessaging = () => useContext(ContactMessagingContext);
