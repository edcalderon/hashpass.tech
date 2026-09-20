import React, { useEffect, useRef } from "react";
import "@hashpass/support-widget";
import type { HashpassSupportElement, HashpassSupportEvent } from "@hashpass/support-widget";

export interface HashpassSupportProps { appId: string; locale?: string; position?: string; greeting?: string; apiBaseUrl?: string; onOpen?: () => void; onClose?: () => void; onTicketCreated?: (ticket: unknown) => void; onUnreadCountChanged?: (count: unknown) => void; }

export function HashpassSupport(props: HashpassSupportProps): React.ReactElement {
  const ref = useRef<HashpassSupportElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const bindings: Array<[HashpassSupportEvent, EventListener]> = [
      ["opened", () => props.onOpen?.()],
      ["closed", () => props.onClose?.()],
      ["ticket.created", ((event: CustomEvent) => props.onTicketCreated?.(event.detail)) as EventListener],
      ["unread.changed", ((event: CustomEvent) => props.onUnreadCountChanged?.(event.detail)) as EventListener],
    ];
    bindings.forEach(([event, listener]) => el.addEventListener(event, listener));
    return () => bindings.forEach(([event, listener]) => el.removeEventListener(event, listener));
  }, [props.onOpen, props.onClose, props.onTicketCreated, props.onUnreadCountChanged]);
  return React.createElement("hashpass-support", { ref, "app-id": props.appId, locale: props.locale, position: props.position, greeting: props.greeting, "api-base-url": props.apiBaseUrl });
}
