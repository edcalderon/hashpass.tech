/** Quick stand-up (`speed`) or coffee break; mirrors the `meeting_type` values the server stores. */
export type MeetingKind = 'speed' | 'coffee';

/** Minutes a coffee break can run. */
export type CoffeeDuration = 15 | 30 | 45;
