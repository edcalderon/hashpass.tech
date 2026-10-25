export type FaqEntry = { category: FaqCategory; question: string; answer: string };

export type FaqCategory = 'security' | 'recovery' | 'networks' | 'support';
