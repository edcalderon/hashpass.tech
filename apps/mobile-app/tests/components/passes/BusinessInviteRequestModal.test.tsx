import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

jest.mock("../../../hooks/useTheme", () => ({ useTheme: () => ({ isDark: true }) }));
jest.mock("../../../i18n/i18n", () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));
jest.mock("@hashpass/ui/primitives", () => ({
  ActionButton: "ActionButton",
  ModalBackdrop: "ModalBackdrop",
  Surface: "Surface",
}));

import BusinessInviteRequestModal from "../../../components/passes/BusinessInviteRequestModal";

describe("BusinessInviteRequestModal", () => {
  it("offers a retry only when a Business request was not submitted", () => {
    const onClose = jest.fn();
    const onRetry = jest.fn();
    let view!: ReactTestRenderer;

    act(() => {
      view = create(
        <BusinessInviteRequestModal status="error" onClose={onClose} onRetry={onRetry} />,
      );
    });

    const button = (label: string) =>
      view.root
        .findAllByType("ActionButton" as any)
        .find((node) => node.props.label === label)!;
    expect(JSON.stringify(view.toJSON())).toContain(
      "Could not submit your Business access request",
    );
    act(() => button("Try again").props.onPress());
    act(() => button("Close").props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("explains that a submitted invitation remains pending without a duplicate action", () => {
    let view!: ReactTestRenderer;
    act(() => {
      view = create(
        <BusinessInviteRequestModal status="pending" onClose={jest.fn()} onRetry={jest.fn()} />,
      );
    });

    expect(JSON.stringify(view.toJSON())).toContain("Business access pending review");
    expect(view.root.findAllByType("ActionButton" as any)).toHaveLength(1);
  });
});
