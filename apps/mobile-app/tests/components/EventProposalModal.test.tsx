/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Linking } from "react-native";

const mockCanOpenURL = jest.fn();
const mockOpenURL = jest.fn();

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

import EventProposalModal from "../../components/EventProposalModal";

let view: ReactTestRenderer;
const mockLinking = Linking as unknown as {
  canOpenURL?: typeof mockCanOpenURL;
  openURL: typeof mockOpenURL;
};

afterEach(() => {
  act(() => view?.unmount());
  mockCanOpenURL.mockReset();
  mockOpenURL.mockReset();
  delete mockLinking.canOpenURL;
});

beforeEach(() => {
  mockLinking.canOpenURL = mockCanOpenURL;
  mockLinking.openURL = mockOpenURL;
});

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

  const submit = view.root.findByProps({ accessibilityLabel: "Prepare proposal email" });
  expect(submit.props.disabled).toBe(true);

  fillRequiredFields();
  expect(view.root.findByProps({ accessibilityLabel: "Prepare proposal email" }).props.disabled).toBe(false);
});

it("opens a prefilled support email instead of claiming the proposal was sent", async () => {
  mockCanOpenURL.mockResolvedValue(true);
  mockOpenURL.mockResolvedValue(undefined);
  renderModal();
  fillRequiredFields();

  await act(async () => {
    await view.root.findByProps({ accessibilityLabel: "Prepare proposal email" }).props.onPress();
  });

  expect(mockCanOpenURL).toHaveBeenCalledWith(expect.stringContaining("mailto:support@hashpass.tech"));
  expect(mockOpenURL).toHaveBeenCalledWith(expect.stringContaining("Event%20Proposal"));
  expect(mockOpenURL).toHaveBeenCalledWith(expect.stringContaining("Open%20LATAM"));
});

it("shows the support address when an email client cannot be opened", async () => {
  mockCanOpenURL.mockResolvedValue(false);
  renderModal();
  fillRequiredFields();

  await act(async () => {
    await view.root.findByProps({ accessibilityLabel: "Prepare proposal email" }).props.onPress();
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
    await view.root.findByProps({ accessibilityLabel: "Prepare proposal email" }).props.onPress();
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
    await view.root.findByProps({ accessibilityLabel: "Prepare proposal email" }).props.onPress();
  });
  act(() => {
    view.root.findByProps({ accessibilityLabel: "Close" }).props.onPress();
  });

  expect(onClose).toHaveBeenCalledTimes(1);
});
