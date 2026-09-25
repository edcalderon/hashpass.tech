import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockTranslate = (_key: string, fallback: string) => fallback;

jest.mock("../../lib/api-client", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));
jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ isDark: true, colors: {} }),
}));
jest.mock("@contexts/ScrollContext", () => ({
  useScroll: () => ({ headerHeight: 80 }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
jest.mock("../../i18n/i18n", () => ({
  useTranslation: () => ({ t: mockTranslate }),
}));
jest.mock("@hashpass/ui/primitives", () => ({
  ActionButton: "ActionButton",
  ModalBackdrop: "ModalBackdrop",
  Surface: "Surface",
}));

import BusinessInviteApprovalScreen from "../../app/(shared)/dashboard/business-invites";

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe("BusinessInviteApprovalScreen", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it("loads pending requests and confirms approval before calling the protected review API", async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: {
        items: [
          {
            id: "22222222-2222-2222-2222-222222222222",
            user_id: "11111111-1111-1111-1111-111111111111",
            user_email: "requester@example.com",
            status: "pending",
            requested_at: "2026-09-25T00:00:00.000Z",
          },
        ],
      },
    });
    mockPost.mockResolvedValue({ success: true, data: { status: "approved" } });

    let view!: ReactTestRenderer;
    await act(async () => {
      view = create(<BusinessInviteApprovalScreen />);
      await flush();
    });

    expect(mockGet).toHaveBeenCalledWith(
      "/admin/business-invites",
      expect.objectContaining({
        skipEventSegment: true,
      }),
    );
    expect(JSON.stringify(view.toJSON())).toContain("requester@example.com");

    const button = (label: string) =>
      view.root
        .findAllByType("ActionButton" as any)
        .find((node) => node.props.label === label)!;
    act(() => button("Review").props.onPress());
    expect(JSON.stringify(view.toJSON())).toContain(
      "Confirm Business access decision",
    );

    await act(async () => {
      button("Approve Business access").props.onPress();
      await flush();
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/admin/business-invites",
      {
        requestId: "22222222-2222-2222-2222-222222222222",
        decision: "approve",
      },
      { skipEventSegment: true },
    );
    expect(JSON.stringify(view.toJSON())).not.toContain(
      "requester@example.com",
    );
  });

  it("shows a reviewer-safe error when the API denies access", async () => {
    mockGet.mockResolvedValue({ success: false, error: "Forbidden" });

    let view!: ReactTestRenderer;
    await act(async () => {
      view = create(<BusinessInviteApprovalScreen />);
      await flush();
    });

    expect(JSON.stringify(view.toJSON())).toContain(
      "Unable to load Business access requests. Confirm you have review access and try again.",
    );
  });
});
