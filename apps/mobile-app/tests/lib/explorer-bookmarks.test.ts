import {
  EXPLORER_BOOKMARKS_STORAGE_KEY,
  loadExplorerBookmarks,
  saveExplorerBookmarks,
} from "../../lib/explorer-bookmarks";

const mockGetItem = jest.fn();
const mockSetItem = jest.fn();

jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: (...args: unknown[]) => mockGetItem(...args),
  setItem: (...args: unknown[]) => mockSetItem(...args),
}));

describe("explorer bookmarks", () => {
  beforeEach(() => {
    mockGetItem.mockReset();
    mockSetItem.mockReset();
  });

  it("loads and normalizes persisted event ids", async () => {
    mockGetItem.mockResolvedValueOnce(
      JSON.stringify(["colombia2026", "colombia2026", 42]),
    );

    await expect(loadExplorerBookmarks()).resolves.toEqual(["colombia2026"]);
    expect(mockGetItem).toHaveBeenCalledWith(EXPLORER_BOOKMARKS_STORAGE_KEY);
  });

  it("persists a deduplicated bookmark list", async () => {
    mockSetItem.mockResolvedValueOnce(undefined);

    await saveExplorerBookmarks(["chile2026", "chile2026", "peru2026"]);

    expect(mockSetItem).toHaveBeenCalledWith(
      EXPLORER_BOOKMARKS_STORAGE_KEY,
      JSON.stringify(["chile2026", "peru2026"]),
    );
  });
});
