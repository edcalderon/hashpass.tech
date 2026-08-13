export const EXPLORER_BOOKMARKS_STORAGE_KEY = "hashpass.explorer.bookmarks.v1";

const getAsyncStorage = () => {
  // Keep native storage lazy so web/server-isolated tests do not initialize
  // the native module before the platform adapter is available.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const storage = require("@react-native-async-storage/async-storage");
  return storage.default ?? storage;
};

const normalizeIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((item): item is string => typeof item === "string")),
  );
};

export const loadExplorerBookmarks = async (): Promise<string[]> => {
  try {
    const raw = await getAsyncStorage().getItem(EXPLORER_BOOKMARKS_STORAGE_KEY);
    return normalizeIds(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
};

export const saveExplorerBookmarks = async (eventIds: string[]) => {
  await getAsyncStorage().setItem(
    EXPLORER_BOOKMARKS_STORAGE_KEY,
    JSON.stringify(normalizeIds(eventIds)),
  );
};
