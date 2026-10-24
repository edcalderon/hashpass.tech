/**
 * The PIN-protected wallet itself. The seed is stored only encrypted (server-side vault); it is
 * decrypted with the person's PIN plus a server share released after a PIN proof. The phrase is
 * on screen only in `phrase`, and any LOCK (background, account change) clears it first. The PIN
 * digits passed to `onDone` live in a closure for the length of one call and are never stored.
 */
export type VaultCommand = { type: 'CREATE' | 'REVEAL' | 'CHANGE' | 'RECOVER'; nonce: number };
