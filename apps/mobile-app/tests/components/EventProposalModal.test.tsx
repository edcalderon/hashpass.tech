/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Linking, Platform } from "react-native";

const mockCanOpenURL = jest.fn();
const mockOpenURL = jest.fn();
const mockApiPost = jest.fn();
const mockCaptchaEndpoint = jest.fn(() => "https://api.hashpass.tech/api/captcha/");

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      border: "#d0d5dd",
      text: { primary: "#101828", secondary: "#667085" },
    },
  }),
}));
jest.mock("../../i18n/i18n", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback || key }),
}));
jest.mock("../../lib/vector-icons", () => ({ Ionicons: "Ionicons" }));
jest.mock("../../lib/api-client", () => ({
  apiClient: { post: (...args: unknown[]) => mockApiPost(...args) },
  getCaptchaApiEndpoint: () => mockCaptchaEndpoint(),
}));
jest.mock(
  "../../components/EventProposalCaptcha",
  () => ({
    __esModule: true,
    default: "EventProposalCaptcha",
  }),
  { virtual: true },
);

import EventProposalModal from "../../components/EventProposalModal";

let view: ReactTestRenderer;
const originalPlatformOS = Platform.OS;
const mockLinking = Linking as unknown as {
  canOpenURL?: typeof mockCanOpenURL;
  openURL: typeof mockOpenURL;
};

const setPlatform = (os: "ios" | "android" | "web") => {
  Object.defineProperty(Platform, "OS", { configurable: true, value: os });
};

const findSubmit = () =>
  view.root
    .findAllByType("TouchableOpacity" as any)
    .find((node) => typeof node.props.disabled === "boolean")!;

afterEach(() => {
  act(() => view?.unmount());
  mockCanOpenURL.mockReset();
  mockOpenURL.mockReset();
  mockApiPost.mockReset();
  mockCaptchaEndpoint.mockClear();
  delete mockLinking.canOpenURL;
});

beforeEach(() => {
  setPlatform("ios");
  mockLinking.canOpenURL = mockCanOpenURL;
  mockLinking.openURL = mockOpenURL;
  mockApiPost.mockResolvedValue({ success: true });
});

afterAll(() => setPlatform(originalPlatformOS as "ios" | "android" | "web"));

const fillRequiredFields = () => {
  const inputs = view.root.findAllByType("TextInput" as any);
  act(() => {
    inputs[0].props.onChangeText("Open LATAM");
    inputs[1].props.onChangeText("Ada Organizer");
    inputs[2].props.onChangeText("ada@example.com");
    inputs[3].props.onChangeText("Bogotá, October 2026. Community event proposal.");
  });
};

const renderModal = () => {
  act(() => {
    view = create(<EventProposalModal visible onClose={jest.fn()} />);
  });
};

it("requires the event, contact, valid email, and details before preparing a proposal", () => {
  renderModal();

  const submit = findSubmit();
  expect(submit.props.disabled).toBe(true);

  fillRequiredFields();
  expect(findSubmit().props.disabled).toBe(false);
});

it("requires a Cap token on web and submits it to the proposal endpoint instead of opening mailto", async () => {
  setPlatform("web");
  renderModal();
  fillRequiredFields();

  expect(findSubmit().props.disabled).toBe(true);

  const captcha = view.root.findByType("EventProposalCaptcha" as any);
  expect(captcha.props.apiEndpoint).toBe("https://api.hashpass.tech/api/captcha/");

  act(() => captcha.props.onSolve("cap-token-once"));
  expect(findSubmit().props.disabled).toBe(false);

  await act(async () => {
    await findSubmit().props.onPress();
  });

  expect(mockApiPost).toHaveBeenCalledWith(
    "/event-proposals",
    {
      eventName: "Open LATAM",
      contactName: "Ada Organizer",
      email: "ada@example.com",
      eventDetails: "Bogotá, October 2026. Community event proposal.",
      captchaToken: "cap-token-once",
    },
    { skipEventSegment: true },
  );
  expect(mockCanOpenURL).not.toHaveBeenCalled();
  expect(mockOpenURL).not.toHaveBeenCalled();
});

it("recovers from a thrown web request and resets Cap before retry or close", async () => {
  setPlatform("web");
  mockApiPost.mockRejectedValueOnce(new Error("Network unavailable"));
  renderModal();
  fillRequiredFields();

  let captcha = view.root.findByType("EventProposalCaptcha" as any);
  expect(captcha.props.resetKey).toBe(0);
  act(() => captcha.props.onSolve("first-cap-token"));

  await act(async () => {
    await findSubmit().props.onPress();
  });

  captcha = view.root.findByType("EventProposalCaptcha" as any);
  expect(captcha.props.resetKey).toBe(1);
  expect(findSubmit().props.disabled).toBe(true);
  expect(findSubmit().props.accessibilityState).toMatchObject({ busy: false });
  expect(
    view.root.findAllByType("Text" as any).map((node) => node.props.children).join(" "),
  ).toContain("support@hashpass.tech");

  act(() => captcha.props.onSolve("retry-cap-token"));
  expect(findSubmit().props.disabled).toBe(false);

  act(() => {
    view.root.findByProps({ accessibilityLabel: "Close" }).props.onPress();
  });
  expect(view.root.findByType("EventProposalCaptcha" as any).props.resetKey).toBe(2);
  expect(findSubmit().props.disabled).toBe(true);
});

it("preserves a prefilled support email fallback for native clients", async () => {
  setPlatform("android");
  mockCanOpenURL.mockResolvedValue(true);
  mockOpenURL.mockResolvedValue(undefined);
  renderModal();
  fillRequiredFields();

  await act(async () => {
    await findSubmit().props.onPress();
  });

  expect(mockCanOpenURL).toHaveBeenCalledWith(expect.stringContaining("mailto:support@hashpass.tech"));
  expect(mockOpenURL).toHaveBeenCalledWith(expect.stringContaining("Event%20Proposal"));
  expect(mockOpenURL).toHaveBeenCalledWith(expect.stringContaining("Open%20LATAM"));
  expect(mockApiPost).not.toHaveBeenCalled();
  expect(view.root.findAllByType("EventProposalCaptcha" as any)).toHaveLength(0);
});

it("shows the support address when an email client cannot be opened", async () => {
  mockCanOpenURL.mockResolvedValue(false);
  renderModal();
  fillRequiredFields();

  await act(async () => {
    await findSubmit().props.onPress();
  });

  expect(view.root.findAllByType("Text" as any).map(node => node.props.children).join(" ")).toContain("support@hashpass.tech");
  expect(mockOpenURL).not.toHaveBeenCalled();
});

it("shows the fallback contact guidance when opening the email client fails", async () => {
  mockCanOpenURL.mockResolvedValue(true);
  mockOpenURL.mockRejectedValue(new Error("Email app unavailable"));
  renderModal();
  fillRequiredFields();

  await act(async () => {
    await findSubmit().props.onPress();
  });

  expect(view.root.findAllByType("Text" as any).map(node => node.props.children).join(" ")).toContain("support@hashpass.tech");
});

it("closes from the close control after an email error", async () => {
  const onClose = jest.fn();
  mockCanOpenURL.mockResolvedValue(false);
  act(() => {
    view = create(<EventProposalModal visible onClose={onClose} />);
  });
  fillRequiredFields();

  await act(async () => {
    await findSubmit().props.onPress();
  });
  act(() => {
    view.root.findByProps({ accessibilityLabel: "Close" }).props.onPress();
  });

  expect(onClose).toHaveBeenCalledTimes(1);
});
