import { HashpassSupport } from "@hashpass/support-react";
export function Example() { return <HashpassSupport appId="PUBLIC_APP_ID" locale="es" onTicketCreated={console.log} />; }
