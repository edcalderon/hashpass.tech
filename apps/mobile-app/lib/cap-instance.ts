// Thin re-export of the shared Cap (proof-of-work captcha) instance factory
// -- see packages/backend/src/captcha/cap-instance.ts for the actual
// filesystem storage adapter, which every service using Cap now shares
// instead of each copy-pasting its own. The namespace keeps this app's
// challenge/token storage isolated from other services (e.g.
// packages/hashpass-links-api) that also call getCapInstance.
import { getCapInstance } from '@hashpass/backend';

const cap = getCapInstance('mobile-app');
export default cap;
