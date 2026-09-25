import assert from "node:assert/strict";
import test from "node:test";

import { consumeExistingSupportEvents } from "../dist/event-cursor.js";

test("consumes the loaded event history before starting live polling", async () => {
  const requestedCursors = [];
  const pages = [
    {
      items: [{ cursor: "event-1" }, { cursor: "event-2" }],
      nextCursor: "event-2",
    },
    {
      items: [{ cursor: "event-3" }],
      nextCursor: "event-3",
    },
    { items: [] },
  ];

  const cursor = await consumeExistingSupportEvents(async (requestedCursor) => {
    requestedCursors.push(requestedCursor);
    return pages.shift();
  });

  assert.deepEqual(requestedCursors, [undefined, "event-2", "event-3"]);
  assert.equal(cursor, "event-3");
});

test("stops when a page cannot advance its cursor", async () => {
  let calls = 0;

  const cursor = await consumeExistingSupportEvents(async () => {
    calls += 1;
    return { items: [{ cursor: "event-1" }], nextCursor: "event-1" };
  });

  assert.equal(cursor, "event-1");
  assert.equal(calls, 2);
});
