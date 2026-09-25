import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";

let mockDark = false;

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({ isDark: mockDark }),
}));
jest.mock("@hashpass/ui/primitives", () => ({ Badge: "Badge" }));

import LandingBadge from "../../components/LandingBadge";

let view: ReactTestRenderer;

afterEach(() => {
  act(() => view?.unmount());
  mockDark = false;
});

it.each([
  [false, "light"],
  [true, "dark"],
])("uses the %s theme badge treatment", (isDark, mode) => {
  mockDark = isDark;
  act(() => {
    view = create(<LandingBadge>How it works</LandingBadge>);
  });

  expect(view.root.findByType("Badge" as any).props.mode).toBe(mode);
});
