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

import { QrCode, Bell, Headset, User, Briefcase } from "lucide-react-native";
import { NativeSafeIcon, WEB_IONICONS_TO_MATERIAL_ICONS, WEB_MATERIAL_ICONS } from "../../lib/vector-icons";

it('maps the expanded quick-settings chevron to an up arrow on web', () => {
  expect(WEB_IONICONS_TO_MATERIAL_ICONS['chevron-up']).toBe('keyboard-arrow-up');
});

it.each([
  ['briefcase-outline', 'work-outline'],
  ['business-outline', 'business'],
  ['mic-outline', 'mic'],
] as const)('maps the %s account detail icon to a real web glyph', (icon, glyph) => {
  expect(WEB_IONICONS_TO_MATERIAL_ICONS[icon]).toBe(glyph);
});

it('renders the role icon as a briefcase instead of the question-mark fallback', () => {
  expect(WEB_MATERIAL_ICONS['work-outline']).toBe(Briefcase);
});

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
    "arrow-up-right",
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

it.each([['qr-code', QrCode], ['notifications', Bell], ['person', User], ['support', Headset]] as const)('renders the actual %s account icon instead of the info fallback', (name, expected) => {
  expect(NativeSafeIcon({ name }).type).toBe(expected);
});
