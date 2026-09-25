import type { SupportEventPage } from "@hashpass-tech/sdk";

/**
 * Advances through the event feed already represented by the widget's
 * bootstrap state. Returning the final cursor lets the live poll begin after
 * that history without re-emitting old messages as new notifications.
 */
export async function consumeExistingSupportEvents(
  getPage: (cursor?: string) => Promise<SupportEventPage>,
  signal?: AbortSignal,
): Promise<string | undefined> {
  let cursor: string | undefined;

  while (!signal?.aborted) {
    const page = await getPage(cursor);
    if (page.items.length === 0) return cursor;

    const nextCursor = page.nextCursor ?? page.items[page.items.length - 1]?.cursor;
    if (!nextCursor || nextCursor === cursor) return cursor;
    cursor = nextCursor;
  }

  return cursor;
}
