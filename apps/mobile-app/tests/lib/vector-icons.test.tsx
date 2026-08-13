/// <reference types="jest" />

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: "Svg",
  Path: "Path",
  Circle: "Circle",
  Line: "Line",
  Rect: "Rect",
  Polyline: "Polyline",
  Polygon: "Polygon",
  G: "G",
  Defs: "Defs",
  LinearGradient: "LinearGradient",
  Stop: "Stop",
}));
jest.mock("../../../../node_modules/@expo/vector-icons/Ionicons.js", () => ({
  default: "Ionicons",
}));
jest.mock(
  "../../../../node_modules/@expo/vector-icons/MaterialIcons.js",
  () => ({ default: "MaterialIcons" }),
);

import { NativeSafeIcon } from "../../lib/vector-icons";

describe("NativeSafeIcon", () => {
  it("renders the Explorer filter icon from the SVG baseline", () => {
    const element = NativeSafeIcon({
      name: "filter",
      size: 22,
      color: "#b91c1c",
    });

    expect(element).toBeTruthy();
    expect(element.props).toMatchObject({ size: 22, color: "#b91c1c" });
    expect(String(element.type)).not.toContain("CircleHelp");
  });

  it.each([
    "list",
    "grid",
    "rail",
    "sort",
    "bookmark",
    "search",
    "arrow-up",
  ] as const)("has a concrete SVG mapping for %s", (name) => {
    const element = NativeSafeIcon({ name, size: 18, color: "#111827" });
    expect(element.type).toBeDefined();
    expect(String(element.type)).not.toContain("CircleHelp");
  });

  it("falls back to a concrete SVG icon for an unknown runtime name", () => {
    const element = NativeSafeIcon({
      name: "not-a-real-icon" as never,
      size: 18,
      color: "#111827",
    });
    expect(element.type).toBeDefined();
    expect(String(element.type)).not.toContain("CircleHelp");
  });
});
