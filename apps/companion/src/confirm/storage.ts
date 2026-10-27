import { parseConfirmedEmails } from './model.ts';

const STORAGE_KEY = 'hashpass.companion.confirmedEmails.v1';

export function loadConfirmedEmails(): string[] {
  try {
    return parseConfirmedEmails(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveConfirmedEmails(emails: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(emails));
  } catch {
    // Storage can be blocked; the address then simply shows as unconfirmed on the next visit.
  }
}
