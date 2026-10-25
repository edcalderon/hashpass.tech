/**
 * Flow of the PIN-protected wallet vault. The context holds no secret: the PIN digits and the
 * phrase live in the component for the length of one call. A LOCK (background, account change)
 * restarts the machine at `home` or `intro`, where nothing secret is on screen.
 *
 *   intro -> enter_pin -> working -> phrase -> challenge -> home          (create)
 *   home  -> reveal_pin -> working -> phrase -> home
 *   home  -> change_pin -> working -> home
 *   home  -> recover_send -> recover_code -> recover_phrase -> recover_pin -> working -> home
 */
export type VaultFlowOrigin = 'create' | 'reveal' | 'change' | 'recover';

export type VaultFlowStep =
  | 'intro' | 'enter_pin' | 'working' | 'phrase' | 'challenge' | 'home' | 'reveal_pin' | 'change_pin'
  | 'recover_send' | 'recover_code' | 'recover_phrase' | 'recover_pin' | 'failed';

export type VaultFlowEvent =
  | { type: 'CREATE' } | { type: 'REVEAL' } | { type: 'CHANGE' } | { type: 'RECOVER' }
  | { type: 'PIN_OK'; origin: VaultFlowOrigin }
  | { type: 'SUCCEEDED'; next: 'phrase' | 'home' }
  | { type: 'FAILED'; reason: string } | { type: 'ACKNOWLEDGE' } | { type: 'HIDE' }
  | { type: 'CHALLENGE_PASSED' } | { type: 'CODE_SENT' } | { type: 'CODE_OK' } | { type: 'PHRASE_OK' }
  | { type: 'CANCEL' } | { type: 'LOCK' } | { type: 'BACK' };

export type Context = { origin: VaultFlowOrigin | null; acknowledged: boolean; reason: string | null; registered: boolean };
