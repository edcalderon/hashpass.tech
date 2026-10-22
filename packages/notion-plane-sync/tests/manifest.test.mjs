import assert from "node:assert/strict";
import test from "node:test";
import * as sync from "../src/manifest.mjs";

const { buildArchiveRecord, selectPlaneWorkItems } = sync;

test("buildArchiveRecord preserves Notion identity, hierarchy, block payload, and a stable hash", () => {
  const page = {
    id: "page-ceo-hq",
    parentId: null,
    title: "CEO HQ",
    lastEditedAt: "2026-09-27T00:00:00.000Z",
    blocks: [{ id: "block-1", type: "paragraph", text: "A decision" }],
  };

  const first = buildArchiveRecord(page, { rootPageId: "page-ceo-hq" });
  const second = buildArchiveRecord({ ...page, blocks: [...page.blocks] }, { rootPageId: "page-ceo-hq" });

  assert.equal(first.sourceId, "page-ceo-hq");
  assert.equal(first.parentId, null);
  assert.deepEqual(first.blocks, page.blocks);
  assert.equal(first.contentHash, second.contentHash);
});

test("selectPlaneWorkItems imports CEO database rows and only explicitly tagged notes", () => {
  const records = [
    { id: "task-1", type: "database-row", databaseId: "ceo-execution", title: "Close event lead", status: "In progress" },
    { id: "note-1", type: "page", title: "Partner decision", tags: ["plane:work-item"] },
    { id: "note-2", type: "page", title: "Private research", tags: [] },
  ];

  const workItems = selectPlaneWorkItems(records, { ceoExecutionDatabaseId: "ceo-execution" });

  assert.deepEqual(workItems.map((item) => item.sourceId), ["task-1", "note-1"]);
  assert.deepEqual(workItems.map((item) => item.externalId), ["notion:task-1", "notion:note-1"]);
});

test("selectPlaneWorkItems refuses records outside the configured Hashpass root", () => {
  assert.throws(
    () => selectPlaneWorkItems([{ id: "other", rootPageId: "personal-root", type: "page", tags: ["plane:work-item"] }], {
      ceoExecutionDatabaseId: "ceo-execution",
      rootPageId: "hashpass-root",
    }),
    /outside the configured Hashpass root/,
  );
});

test("archiveRecords writes changed Hashpass pages before their registry entry and skips unchanged pages", async () => {
  assert.equal(typeof sync.archiveRecords, "function");

  const writes = [];
  const record = {
    id: "hashpass-page-1",
    rootPageId: "hashpass-root",
    parentId: "hashpass-root",
    title: "Release readiness",
    lastEditedAt: "2026-09-27T00:00:00.000Z",
    blocks: [{ id: "block-1", type: "paragraph", text: "Ship safely" }],
  };
  const unchanged = buildArchiveRecord(record, { rootPageId: "hashpass-root" });

  const result = await sync.archiveRecords([record, { ...record, id: "hashpass-page-2" }], {
    rootPageId: "hashpass-root",
    loadRegistryHash: async (sourceId) => sourceId === "hashpass-page-1" ? unchanged.contentHash : null,
    saveArchive: async (archive) => writes.push(`archive:${archive.sourceId}`),
    saveRegistry: async (entry) => writes.push(`registry:${entry.sourceId}:${entry.contentHash}`),
    archivedAt: "2026-09-27T01:00:00.000Z",
  });

  assert.deepEqual(writes.map((write) => write.split(":").slice(0, 2).join(":")), [
    "archive:hashpass-page-2",
    "registry:hashpass-page-2",
  ]);
  assert.deepEqual(result, { archived: 1, unchanged: 1 });
});

test("Notion archive client recursively reads only the configured root and nested child pages", async () => {
  assert.equal(typeof sync.createNotionArchiveClient, "function");

  const requests = [];
  const responses = new Map([
    ["/v1/pages/hashpass-root", {
      id: "hashpass-root",
      last_edited_time: "2026-09-27T00:00:00.000Z",
      properties: { Name: { type: "title", title: [{ plain_text: "CEO HQ" }] } },
    }],
    ["/v1/blocks/hashpass-root/children?page_size=100", {
      results: [
        { id: "nested-block", type: "toggle", has_children: true, toggle: { rich_text: [{ plain_text: "Operations" }] } },
        { id: "child-page", type: "child_page", has_children: true, child_page: { title: "Product" } },
      ],
      has_more: false,
      next_cursor: null,
    }],
    ["/v1/blocks/nested-block/children?page_size=100", {
      results: [{ id: "nested-leaf", type: "to_do", has_children: false, to_do: { rich_text: [{ plain_text: "Review" }] } }],
      has_more: false,
      next_cursor: null,
    }],
    ["/v1/pages/child-page", {
      id: "child-page",
      last_edited_time: "2026-09-27T01:00:00.000Z",
      properties: { Name: { type: "title", title: [{ plain_text: "Product" }] } },
    }],
    ["/v1/blocks/child-page/children?page_size=100", { results: [], has_more: false, next_cursor: null }],
  ]);
  const fetchImpl = async (url, options) => {
    const path = new URL(url).pathname + new URL(url).search;
    requests.push({ path, options });
    return new Response(JSON.stringify(responses.get(path)), { status: 200 });
  };

  const client = sync.createNotionArchiveClient({ token: "test-token", fetchImpl });
  const pages = await client.listRootTree("hashpass-root");

  assert.deepEqual(pages.map((page) => [page.id, page.rootPageId, page.parentId, page.title]), [
    ["hashpass-root", "hashpass-root", null, "CEO HQ"],
    ["child-page", "hashpass-root", "hashpass-root", "Product"],
  ]);
  assert.equal(pages[0].blocks[0].children[0].id, "nested-leaf");
  assert.equal(requests.every(({ options }) => options.headers.Authorization === "Bearer test-token"), true);
  assert.equal(requests.every(({ options }) => options.headers["Notion-Version"] === "2026-03-11"), true);
});

test("serverless archive runner uses the configured root and never receives Plane credentials", async () => {
  assert.equal(typeof sync.runServerlessArchive, "function");

  const calls = [];
  const result = await sync.runServerlessArchive({
    rootPageId: "hashpass-root",
    notionClient: {
      listRootTree: async (rootPageId) => {
        calls.push(`notion:${rootPageId}`);
        return [{
          id: "hashpass-page",
          rootPageId,
          title: "Architecture decision",
          lastEditedAt: "2026-09-27T00:00:00.000Z",
          blocks: [],
        }];
      },
    },
    archiveStore: {
      loadRegistryHash: async () => null,
      saveArchive: async ({ sourceId }) => calls.push(`archive:${sourceId}`),
      saveRegistry: async ({ sourceId }) => calls.push(`registry:${sourceId}`),
    },
  });

  assert.deepEqual(calls, ["notion:hashpass-root", "archive:hashpass-page", "registry:hashpass-page"]);
  assert.deepEqual(result, { archived: 1, unchanged: 0 });
});

test("scheduled archive handler reads its root from configuration and emits only a count summary", async () => {
  assert.equal(typeof sync.createScheduledArchiveHandler, "function");

  const events = [];
  const handler = sync.createScheduledArchiveHandler({
    getConfig: async () => ({ rootPageId: "hashpass-root" }),
    createNotionClient: () => ({
      listRootTree: async () => [{
        id: "hashpass-page",
        rootPageId: "hashpass-root",
        title: "Sensitive title that must not be logged",
        blocks: [],
      }],
    }),
    createArchiveStore: () => ({
      loadRegistryHash: async () => null,
      saveArchive: async () => {},
      saveRegistry: async () => {},
    }),
    log: (event) => events.push(event),
  });

  const result = await handler();

  assert.deepEqual(result, { archived: 1, unchanged: 0 });
  assert.deepEqual(events, [{ event: "notion_archive_completed", archived: 1, unchanged: 0 }]);
});
