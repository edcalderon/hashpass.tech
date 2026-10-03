/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports, import/first */

import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockRestoreKeyFromBackup = jest.fn();
const mockSkipKeyRestore = jest.fn();
const mockCreateKeyBackup = jest.fn();
const mockRefreshNotifications = jest.fn();
const mockScrollToBottom = jest.fn();
const mockRpc = jest.fn();

async function restoreKeyFromBackup(...args: unknown[]) {
  const result = await mockRestoreKeyFromBackup(...args);
  if (result?.success) {
    mockChatState = { ...mockChatState, needsKeyRestore: false };
  }
  return result;
}

function skipKeyRestore() {
  mockSkipKeyRestore();
  mockChatState = { ...mockChatState, needsKeyRestore: false };
}

let mockChatState = {
  messages: [],
  sendMessage: jest.fn(),
  isConnected: true,
  presence: {},
  loading: false,
  error: null,
  otherKeyMissing: false,
  needsKeyRestore: false,
  restoreKeyFromBackup,
  skipKeyRestore,
  createKeyBackup: (...args: unknown[]) => mockCreateKeyBackup(...args),
};

jest.mock("react-native", () => ({
  ActivityIndicator: "ActivityIndicator",
  Appearance: {
    getColorScheme: () => "light",
    addChangeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeChangeListener: jest.fn(),
    removeEventListener: jest.fn(),
  },
  KeyboardAvoidingView: "KeyboardAvoidingView",
  Modal: "Modal",
  Platform: { OS: "android" },
  ScrollView: "ScrollView",
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text",
  TextInput: "TextInput",
  TouchableOpacity: "TouchableOpacity",
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

jest.mock("react-native-css-interop/jsx-runtime", () =>
  require("react/jsx-runtime"),
);

jest.mock("@expo/vector-icons", () => ({ MaterialIcons: "MaterialIcons" }));
jest.mock("../../components/SpeakerAvatar", () => "SpeakerAvatar");

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      primary: "#007AFF",
      divider: "#e5e7eb",
      background: { default: "#ffffff", paper: "#ffffff" },
      text: { primary: "#111827", secondary: "#4b5563" },
    },
  }),
}));

jest.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({
    dbUserId: "viewer-1",
    user: { email: "viewer@example.com", user_metadata: { full_name: "Viewer" } },
  }),
}));

jest.mock("../../contexts/NotificationContext", () => ({
  useNotifications: () => ({ refreshNotifications: mockRefreshNotifications }),
}));

jest.mock("../../hooks/useRealtimeChat", () => ({
  useRealtimeChat: () => mockChatState,
}));

jest.mock("../../hooks/useChatScroll", () => ({
  useChatScroll: () => ({ containerRef: { current: null }, scrollToBottom: mockScrollToBottom }),
}));

jest.mock("../../lib/chat-input", () => ({
  shouldSendMessageOnWebEnter: () => false,
}));

jest.mock("../../lib/chat-emojis", () => ({
  CHAT_EMOJI_CATEGORIES: [],
  getChatEmojiCategory: () => ({ emojis: [] }),
}));

jest.mock("../../lib/supabase", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import RealtimeChat from "../../components/RealtimeChat";

function renderChat(needsKeyRestore = false): ReactTestRenderer {
  mockChatState = { ...mockChatState, needsKeyRestore };
  let view!: ReactTestRenderer;
  act(() => {
    view = create(
      <RealtimeChat
        roomName="room-1"
        username="Viewer"
        meetingId="meeting-1"
      />,
    );
  });
  return view;
}

function findText(view: ReactTestRenderer, text: string) {
  return view.root
    .findAllByType("Text" as any)
    .find((node) => node.props.children === text)!;
}

function pressText(view: ReactTestRenderer, text: string) {
  const node = findText(view, text);
  if (typeof node.parent?.props.onPress !== "function") {
    throw new Error(`Text is not inside a pressable: ${text}`);
  }
  return node.parent.props.onPress();
}

function findInput(view: ReactTestRenderer, placeholder: string) {
  return view.root
    .findAllByType("TextInput" as any)
    .find((node) => node.props.placeholder === placeholder)!;
}

function findModal(view: ReactTestRenderer, index: number) {
  return view.root.findAllByType("Modal" as any)[index];
}

async function openSetupBackupModal(view: ReactTestRenderer) {
  act(() => findInput(view, "Backup password").props.onChangeText("restore-password"));
  await act(async () => {
    await pressText(view, "Restore");
  });
  await act(async () => {
    jest.advanceTimersByTime(500);
    await Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockRestoreKeyFromBackup.mockResolvedValue({ success: true });
  mockCreateKeyBackup.mockResolvedValue({ success: true });
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockChatState = {
    ...mockChatState,
    needsKeyRestore: false,
  };
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

it("validates an empty restore password before calling the restore hook", async () => {
  const view = renderChat(true);

  expect(findModal(view, 0).props.visible).toBe(true);
  await act(async () => {
    await pressText(view, "Restore");
  });

  expect(findText(view, "Please enter your backup password")).toBeTruthy();
  expect(mockRestoreKeyFromBackup).not.toHaveBeenCalled();
});

it("shows the wrong-password error and then opens setup after a successful restore", async () => {
  mockRestoreKeyFromBackup
    .mockResolvedValueOnce({ success: false, error: "wrong_password" })
    .mockResolvedValueOnce({ success: true });
  const view = renderChat(true);

  act(() => findInput(view, "Backup password").props.onChangeText("wrong-password"));
  await act(async () => {
    await pressText(view, "Restore");
  });
  expect(findText(view, "Incorrect password. Please try again.")).toBeTruthy();

  act(() => findInput(view, "Backup password").props.onChangeText("correct-password"));
  await act(async () => {
    await pressText(view, "Restore");
  });
  expect(mockRestoreKeyFromBackup).toHaveBeenLastCalledWith("correct-password");
  expect(findModal(view, 0).props.visible).toBe(false);

  await act(async () => {
    jest.advanceTimersByTime(500);
    await Promise.resolve();
  });
  expect(findModal(view, 1).props.visible).toBe(true);
});

it("skips restoring the existing chat backup", async () => {
  const view = renderChat(true);

  await act(async () => {
    await pressText(view, "Skip");
  });

  expect(mockSkipKeyRestore).toHaveBeenCalledTimes(1);
  expect(findModal(view, 0).props.visible).toBe(false);
});

it("creates a new chat backup and closes the setup prompt on success", async () => {
  const view = renderChat(true);
  await openSetupBackupModal(view);

  act(() => findInput(view, "Choose a backup password").props.onChangeText("new-password"));
  await act(async () => {
    await pressText(view, "Create Backup");
  });

  expect(mockCreateKeyBackup).toHaveBeenCalledWith("new-password");
  expect(findModal(view, 1).props.visible).toBe(false);
});

it("closes the setup prompt when backup creation fails", async () => {
  const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
  mockCreateKeyBackup.mockResolvedValue({ success: false, error: "backup_failed" });
  const view = renderChat(true);
  await openSetupBackupModal(view);

  act(() => findInput(view, "Choose a backup password").props.onChangeText("new-password"));
  await act(async () => {
    await pressText(view, "Create Backup");
  });

  expect(mockCreateKeyBackup).toHaveBeenCalledWith("new-password");
  expect(consoleError).toHaveBeenCalledWith(
    "Failed to create key backup:",
    "backup_failed",
  );
  expect(findModal(view, 1).props.visible).toBe(false);
  consoleError.mockRestore();
});

it("allows the user to skip setting up a new chat backup", async () => {
  const view = renderChat(true);
  await openSetupBackupModal(view);

  await act(async () => {
    await pressText(view, "Not Now");
  });

  expect(mockCreateKeyBackup).not.toHaveBeenCalled();
  expect(findModal(view, 1).props.visible).toBe(false);
});
