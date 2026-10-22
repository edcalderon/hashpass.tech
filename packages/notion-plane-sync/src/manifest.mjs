import { createHash } from "node:crypto";

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function contentHash(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function titleFromPage(page) {
  const titleProperty = Object.values(page.properties ?? {}).find((property) => property?.type === "title");
  return titleProperty?.title?.map((fragment) => fragment.plain_text ?? "").join("") || "Untitled";
}

export function createNotionArchiveClient({
  token,
  fetchImpl = fetch,
  notionVersion = "2026-03-11",
  baseUrl = "https://api.notion.com",
} = {}) {
  if (!token) throw new Error("Notion integration token is required");

  async function request(path) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": notionVersion,
      },
    });
    if (!response.ok) throw new Error(`Notion read failed with status ${response.status}`);
    return response.json();
  }

  async function listChildren(blockId) {
    const blocks = [];
    let cursor = null;
    do {
      const params = new URLSearchParams({ page_size: "100" });
      if (cursor) params.set("start_cursor", cursor);
      const page = await request(`/v1/blocks/${encodeURIComponent(blockId)}/children?${params}`);
      blocks.push(...(page.results ?? []));
      cursor = page.has_more ? page.next_cursor : null;
    } while (cursor);

    for (const block of blocks) {
      if (block.has_children && block.type !== "child_page") {
        block.children = await listChildren(block.id);
      }
    }
    return blocks;
  }

  function childPageIds(blocks) {
    return blocks.flatMap((block) => [
      ...(block.type === "child_page" ? [block.id] : []),
      ...childPageIds(block.children ?? []),
    ]);
  }

  return {
    async listRootTree(rootPageId) {
      if (!rootPageId) throw new Error("Hashpass root page id is required");

      const pages = [];
      const seen = new Set();
      async function visit(pageId, parentId) {
        if (seen.has(pageId)) return;
        seen.add(pageId);

        const page = await request(`/v1/pages/${encodeURIComponent(pageId)}`);
        const blocks = await listChildren(pageId);
        pages.push({
          id: page.id,
          rootPageId,
          parentId,
          title: titleFromPage(page),
          lastEditedAt: page.last_edited_time ?? null,
          blocks,
        });

        for (const childPageId of childPageIds(blocks)) {
          await visit(childPageId, page.id);
        }
      }

      await visit(rootPageId, null);
      return pages;
    },
  };
}

export function buildArchiveRecord(page, { rootPageId } = {}) {
  if (!page?.id) throw new Error("Notion page id is required");
  if (rootPageId && page.rootPageId && page.rootPageId !== rootPageId) {
    throw new Error("Notion page is outside the configured Hashpass root");
  }

  const record = {
    sourceId: page.id,
    parentId: page.parentId ?? null,
    title: page.title ?? "Untitled",
    lastEditedAt: page.lastEditedAt ?? null,
    blocks: page.blocks ?? [],
  };

  return { ...record, contentHash: contentHash(record) };
}

export async function archiveRecords(records, {
  rootPageId,
  loadRegistryHash,
  saveArchive,
  saveRegistry,
  archivedAt = new Date().toISOString(),
} = {}) {
  if (!rootPageId) throw new Error("Hashpass root page id is required");
  if (typeof loadRegistryHash !== "function") throw new Error("loadRegistryHash is required");
  if (typeof saveArchive !== "function") throw new Error("saveArchive is required");
  if (typeof saveRegistry !== "function") throw new Error("saveRegistry is required");

  let archived = 0;
  let unchanged = 0;

  for (const page of records) {
    const archive = buildArchiveRecord(page, { rootPageId });
    const previousHash = await loadRegistryHash(archive.sourceId);
    if (previousHash === archive.contentHash) {
      unchanged += 1;
      continue;
    }

    await saveArchive(archive);
    await saveRegistry({
      sourceId: archive.sourceId,
      contentHash: archive.contentHash,
      archivedAt,
    });
    archived += 1;
  }

  return { archived, unchanged };
}

export async function runServerlessArchive({ rootPageId, notionClient, archiveStore }) {
  if (!rootPageId) throw new Error("Hashpass root page id is required");
  if (typeof notionClient?.listRootTree !== "function") throw new Error("Notion archive client is required");
  if (!archiveStore) throw new Error("Archive store is required");

  const pages = await notionClient.listRootTree(rootPageId);
  return archiveRecords(pages, {
    rootPageId,
    loadRegistryHash: archiveStore.loadRegistryHash,
    saveArchive: archiveStore.saveArchive,
    saveRegistry: archiveStore.saveRegistry,
  });
}

export function createScheduledArchiveHandler({ getConfig, createNotionClient, createArchiveStore, log = console.info }) {
  if (typeof getConfig !== "function") throw new Error("getConfig is required");
  if (typeof createNotionClient !== "function") throw new Error("createNotionClient is required");
  if (typeof createArchiveStore !== "function") throw new Error("createArchiveStore is required");

  return async function handler() {
    const config = await getConfig();
    const result = await runServerlessArchive({
      rootPageId: config.rootPageId,
      notionClient: createNotionClient(config),
      archiveStore: createArchiveStore(config),
    });
    log({ event: "notion_archive_completed", ...result });
    return result;
  };
}

export function selectPlaneWorkItems(records, { ceoExecutionDatabaseId, rootPageId } = {}) {
  if (!ceoExecutionDatabaseId) throw new Error("CEO Execution database id is required");

  return records.flatMap((record) => {
    if (rootPageId && record.rootPageId && record.rootPageId !== rootPageId) {
      throw new Error("Notion record is outside the configured Hashpass root");
    }

    const isCeoTask = record.type === "database-row" && record.databaseId === ceoExecutionDatabaseId;
    const isExplicitNote = record.type === "page" && record.tags?.includes("plane:work-item");
    if (!isCeoTask && !isExplicitNote) return [];

    return [{
      sourceId: record.id,
      externalId: `notion:${record.id}`,
      title: record.title ?? "Untitled",
      status: record.status ?? "Not started",
    }];
  });
}
