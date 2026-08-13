/// <reference types="jest" />

import {
  getEventChatPermissions,
  type EventChatPassType,
} from "../../lib/event-chat-permissions";

describe("event chat permissions", () => {
  it.each<[EventChatPassType, boolean, boolean, boolean]>([
    ["general", true, false, false],
    ["business", true, true, false],
    ["vip", true, true, true],
  ])(
    "%s maps the pass tier to read, room-send, and direct-message access",
    (passType, canRead, canSendRoom, canSendDirect) => {
      expect(getEventChatPermissions(passType)).toEqual({
        canReadRoom: canRead,
        canSendRoom,
        canSendDirect,
      });
    },
  );

  it("does not grant room access without an active pass", () => {
    expect(getEventChatPermissions(null)).toEqual({
      canReadRoom: false,
      canSendRoom: false,
      canSendDirect: false,
    });
  });
});
