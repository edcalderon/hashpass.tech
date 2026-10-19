import type { Transporter } from 'nodemailer';

export type SecondarySender = { transporter: Transporter | null; from: string };
