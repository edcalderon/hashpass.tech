/// <reference types="jest" />

import React from "react";
import TestRenderer, { act } from "react-test-renderer";

const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockGet = jest.fn();
const mockPost = jest.fn();
let mockParams: Record<string, unknown> = {};

jest.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  Text: "Text",
  View: "View",
}));
jest.mock(
  "react-native-css-interop/src/runtime/native/appearance-observables",
  () => ({
    addChangeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeChangeListener: jest.fn(),
    removeEventListener: jest.fn(),
    resetAppearanceListeners: jest.fn(),
  }),
  { virtual: true },
);
jest.mock("react-native-css-interop/jsx-runtime", () => require("react/jsx-runtime"));
jest.mock("expo-router", () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
  useLocalSearchParams: () => mockParams,
}));
jest.mock("../../lib/vector-icons", () => ({ MaterialIcons: "MaterialIcons" }));
jest.mock("../../hooks/useTheme", () => ({ useTheme: () => ({ isDark: false }) }));
jest.mock("../../lib/api-client", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));
jest.mock("@hashpass/ui/primitives", () => ({ Surface: "Surface", ActionButton: "ActionButton" }));
jest.mock("@hashpass/ui/tokens", () => ({
  uiPalette: () => ({ canvas: "#fff", text: "#000", muted: "#666", accent: "#00f", danger: "#f00", onAccent: "#fff" }),
  uiTokens: { space: { xs: 4, sm: 8, md: 12, lg: 16 }, type: { title: 20 } },
}));

import PublicPassScreen from "../../app/(shared)/public-pass/[token]";
import TransferConfirmationScreen from "../../app/(shared)/transfer/confirm";

const render = async (element: React.ReactElement) => {
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(element);
  });
  return renderer;
};
const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll((n) => (n.type as unknown) === "Text").map((n) => n.props.children).flat().join(" ");

describe("PublicPassScreen", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockBack.mockReset();
    mockParams = { token: "tok" };
  });

  it("reports an incomplete link without calling the API", async () => {
    mockParams = {};
    const r = await render(<PublicPassScreen />);
    expect(texts(r)).toContain("This public pass link is incomplete.");
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("loads details unauthenticated and hides private fields", async () => {
    mockGet.mockResolvedValue({ success: true, data: { data: { eventId: "colombia2026", passType: "vip", status: "active" } } });
    const r = await render(<PublicPassScreen />);
    expect(mockGet).toHaveBeenCalledWith("/pass-shares", { skipAuth: true, skipEventSegment: true, params: { token: "tok" } });
    const out = texts(r);
    expect(out).toContain("colombia2026");
    expect(out).toContain("VIP");
    expect(out).toContain("ACTIVE");
  });

  it("uses the first value of an array token and an un-enveloped response", async () => {
    mockParams = { token: ["first", "second"] };
    mockGet.mockResolvedValue({ success: true, data: { eventId: "e1" } });
    const r = await render(<PublicPassScreen />);
    expect(mockGet.mock.calls[0][1].params).toEqual({ token: "first" });
    expect(texts(r)).toContain("EVENT");
    expect(texts(r)).toContain("ACTIVE");
  });

  it("shows the API error or a fallback", async () => {
    mockGet.mockResolvedValueOnce({ success: false, error: "gone" });
    expect(texts(await render(<PublicPassScreen />))).toContain("gone");
    mockGet.mockResolvedValueOnce({ success: false });
    expect(texts(await render(<PublicPassScreen />))).toContain("no longer available");
  });

  it("shows a fallback when the request rejects", async () => {
    mockGet.mockRejectedValue(new Error("net"));
    expect(texts(await render(<PublicPassScreen />))).toContain("no longer available");
  });

  it("renders nothing for an empty successful response and navigates back", async () => {
    mockGet.mockResolvedValue({ success: true, data: null });
    const r = await render(<PublicPassScreen />);
    expect(texts(r)).not.toContain("Public pass details");
    r.root.findByType("Pressable" as any).props.onPress();
    expect(mockBack).toHaveBeenCalled();
  });

  it("ignores a response that arrives after unmount", async () => {
    let resolve!: (value: unknown) => void;
    mockGet.mockReturnValue(new Promise((r) => { resolve = r; }));
    const r = await render(<PublicPassScreen />);
    act(() => r.unmount());
    await act(async () => resolve({ success: true, data: { eventId: "e" } }));
  });
});

describe("TransferConfirmationScreen", () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockReplace.mockReset();
    mockParams = { token: "tok" };
  });

  const confirmButton = (r: TestRenderer.ReactTestRenderer) => r.root.findByType("ActionButton" as any);

  it("flags an incomplete link", async () => {
    mockParams = {};
    expect(texts(await render(<TransferConfirmationScreen />))).toContain("incomplete");
    mockParams = { token: ["a", "b"] };
    expect(texts(await render(<TransferConfirmationScreen />))).toContain("incomplete");
  });

  it("confirms without an account session and reports a recorded confirmation", async () => {
    mockPost.mockResolvedValue({ success: true, data: { data: { status: "pending" } } });
    const r = await render(<TransferConfirmationScreen />);
    await act(async () => confirmButton(r).props.onPress());
    expect(mockPost).toHaveBeenCalledWith(
      "/pass-transfers",
      { action: "confirm", token: "tok" },
      { skipAuth: true, skipEventSegment: true },
    );
    expect(texts(r)).toContain("other person must confirm");
    expect(confirmButton(r).props.label).toBe("Back to HASHPASS");
  });

  it("reports a completed transfer and routes back to the wallet", async () => {
    mockPost.mockResolvedValue({ success: true, data: { status: "completed" } });
    const r = await render(<TransferConfirmationScreen />);
    await act(async () => confirmButton(r).props.onPress());
    expect(texts(r)).toContain("Transfer complete");
    confirmButton(r).props.onPress();
    expect(mockReplace).toHaveBeenCalledWith("/(shared)/dashboard/wallet");
  });

  it("shows the API error or a fallback on failure", async () => {
    mockPost.mockResolvedValueOnce({ success: false, error: "expired" });
    let r = await render(<TransferConfirmationScreen />);
    await act(async () => confirmButton(r).props.onPress());
    expect(texts(r)).toContain("expired");
    mockPost.mockResolvedValueOnce({ success: false });
    r = await render(<TransferConfirmationScreen />);
    await act(async () => confirmButton(r).props.onPress());
    expect(texts(r)).toContain("no longer available");
  });

  it("does not submit twice while confirming", async () => {
    let resolve!: (value: unknown) => void;
    mockPost.mockReturnValue(new Promise((r) => { resolve = r; }));
    const r = await render(<TransferConfirmationScreen />);
    await act(async () => { confirmButton(r).props.onPress(); });
    expect(confirmButton(r).props.label).toBe("Confirming…");
    await act(async () => { confirmButton(r).props.onPress(); });
    expect(mockPost).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ success: true, data: { status: "completed" } }));
  });
});
