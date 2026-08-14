import React from "react";
import { Platform, Text } from "react-native";
import {
  Activity,
  Apple,
  ArrowDown,
  ArrowUpDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bell,
  BellOff,
  Bookmark,
  BookmarkCheck,
  Bot,
  BookOpen,
  Building2,
  Cog,
  CalendarDays,
  CalendarX2,
  Camera,
  ChartBar,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Circle,
  CirclePlus,
  ClipboardList,
  Clock,
  CloudDownload,
  Coffee,
  Bug,
  Compass,
  Copy,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CirclePause,
  CirclePlay,
  CircleX,
  Eye,
  ExternalLink,
  FilterX,
  Fingerprint,
  Globe,
  Grid3x3,
  History,
  Hourglass,
  IdCard,
  Inbox,
  Info,
  KeyRound,
  LayoutDashboard,
  Link2,
  List,
  Lock,
  LockOpen,
  Mail,
  MailOpen,
  MailPlus,
  MapPin,
  Maximize,
  Menu,
  MessageCircle,
  Mic,
  Moon,
  Lightbulb,
  PartyPopper,
  Pencil,
  Phone,
  Plus,
  QrCode,
  Ticket,
  RefreshCw,
  RotateCw,
  ScanQrCode,
  Search,
  SearchX,
  Send,
  Share2,
  Shield,
  ShieldCheck,
  LogIn,
  LogOut,
  SquarePlay,
  Star,
  SlidersHorizontal,
  Tag,
  Sun,
  Trash2,
  TrendingUp,
  TriangleAlert,
  User,
  UserPlus,
  Users,
  UsersRound,
  Utensils,
  Video,
  Volume2,
  VolumeX,
  Captions,
  CaptionsOff,
  Wallet,
  X,
  Zap,
  ThumbsUp,
  Image as ImageIcon,
  Filter,
  type LucideProps,
} from "lucide-react-native";
import type { TextStyle } from "react-native";
// Use a relative node_modules path so the Babel module-resolver alias for
// `@expo/vector-icons` does not rewrite these native fallbacks back into this wrapper.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NativeIonicons =
  require("../../../node_modules/@expo/vector-icons/Ionicons.js")
    .default as React.ComponentType<LucideProps>;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const NativeMaterialIcons =
  require("../../../node_modules/@expo/vector-icons/MaterialIcons.js")
    .default as React.ComponentType<LucideProps>;

type IconProps = { name: string; size?: number; color?: string; style?: any };

type WebIconComponent = React.ComponentType<LucideProps>;

/**
 * SVG-backed icons for the Explorer controls.
 *
 * These controls are shared by native and web. Keep them off the font-based
 * MaterialIcons path: an icon name that is missing from a native font set is
 * rendered as a `?` glyph on some Android devices. Lucide uses
 * react-native-svg, so these names have one deterministic implementation on
 * every platform.
 */
export type NativeSafeIconName =
  | "search"
  | "filter"
  | "list"
  | "grid"
  | "rail"
  | "sort"
  | "bookmark"
  | "bookmark-filled"
  | "search-off"
  | "arrow-up"
  | "arrow-left"
  | "arrow-right"
  | "refresh"
  | "event"
  | "people"
  | "info";

const NATIVE_SAFE_ICONS: Record<NativeSafeIconName, WebIconComponent> = {
  search: Search,
  filter: Filter,
  list: List,
  grid: Grid3x3,
  rail: LayoutDashboard,
  sort: ArrowUpDown,
  bookmark: Bookmark,
  "bookmark-filled": BookmarkCheck,
  "search-off": SearchX,
  "arrow-up": ArrowUp,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  refresh: RefreshCw,
  event: CalendarDays,
  people: Users,
  info: Info,
};

export function NativeSafeIcon({
  name,
  size = 22,
  color = "currentColor",
  strokeWidth = 2,
  ...props
}: Omit<LucideProps, "name"> & { name: NativeSafeIconName }) {
  const IconComponent = NATIVE_SAFE_ICONS[name] || Info;
  return (
    <IconComponent
      {...props}
      size={size}
      color={color}
      strokeWidth={strokeWidth}
    />
  );
}

function GoogleIcon({
  size = 24,
  color = "#4285F4",
  style,
}: {
  size?: number;
  color?: string;
  style?: TextStyle;
}) {
  return (
    <Text
      style={[
        {
          width: size,
          height: size,
          lineHeight: size,
          fontSize: size * 0.82,
          fontWeight: "700",
          textAlign: "center",
          textAlignVertical: "center",
          color,
          fontFamily: "Arial",
          includeFontPadding: false,
        },
        style,
      ]}
    >
      G
    </Text>
  );
}

const WEB_MATERIAL_ICONS: Record<string, WebIconComponent> = {
  // Keep every Material icon used by web/native shared screens mapped here;
  // unmapped names intentionally fall back to CircleHelp, so add new names
  // before using them in UI copy or controls.
  add: Plus,
  "add-circle-outline": CirclePlus,
  "expand-less": ChevronUp,
  "expand-more": ChevronDown,
  "admin-panel-settings": Cog,
  analytics: ChartBar,
  "bar-chart": ChartBar,
  apps: Grid3x3,
  "arrow-back": ArrowLeft,
  "arrow-downward": ArrowDown,
  "arrow-forward": ArrowRight,
  "arrow-upward": ArrowUp,
  "unfold-more": ArrowUpDown,
  assignment: ClipboardList,
  block: X,
  bolt: Zap,
  "book-outline": BookOpen,
  book: BookOpen,
  bookmark: Bookmark,
  "bookmark-border": Bookmark,
  "bookmark-added": BookmarkCheck,
  "bug-report": Bug,
  business: Building2,
  "camera-alt": Camera,
  "camera-outline": Camera,
  cancel: CircleX,
  "card-membership": IdCard,
  celebration: PartyPopper,
  chat: MessageCircle,
  forum: MessageCircle,
  check: Check,
  "check-circle": CircleCheck,
  "checkmark-circle": CircleCheck,
  "check-box": CircleCheck,
  "check-box-outline-blank": Circle,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "clear-all": FilterX,
  clear: X,
  close: X,
  "close-circle": CircleX,
  "cloud-download": CloudDownload,
  "cloud-download-outline": CloudDownload,
  "content-copy": Copy,
  "confirmation-number": Ticket,
  dashboard: LayoutDashboard,
  delete: Trash2,
  "delete-outline": Trash2,
  trash: Trash2,
  drafts: MailOpen,
  edit: Pencil,
  email: Mail,
  "error-outline": CircleAlert,
  event: CalendarDays,
  "event-busy": CalendarX2,
  "event-note": CalendarDays,
  view_agenda: List,
  view_carousel: LayoutDashboard,
  explore: Compass,
  favorite: Star,
  "filter-list": SlidersHorizontal,
  "flash-on": Zap,
  flip: RotateCw,
  "free-breakfast": Coffee,
  group: Users,
  "help-outline": CircleHelp,
  history: History,
  "hourglass-empty": Hourglass,
  inbox: Inbox,
  info: Info,
  "info-outline": Info,
  list: List,
  mail: Mail,
  mic: Mic,
  call: Phone,
  "keyboard-arrow-down": ChevronDown,
  "keyboard-arrow-up": ChevronUp,
  "calendar-today": CalendarDays,
  key: KeyRound,
  dialpad: KeyRound,
  label: Tag,
  language: Globe,
  link: Link2,
  "thumb-up": ThumbsUp,
  image: ImageIcon,
  "link-outline": Link2,
  "location-on": MapPin,
  "lock-open": LockOpen,
  "log-in": LogIn,
  "log-out-outline": LogOut,
  login: LogIn,
  logout: LogOut,
  "mark-email-unread": MailPlus,
  menu: Menu,
  moon: Moon,
  "moon-outline": Moon,
  notifications: Bell,
  "notifications-none": BellOff,
  "open-in-full": Maximize,
  "open-in-new": ExternalLink,
  lightbulb: Lightbulb,
  "lightbulb-outline": Lightbulb,
  "pause-circle-outline": CirclePause,
  people: Users,
  "people-alt": UsersRound,
  "eye-outline": Eye,
  eye: Eye,
  "finger-print-outline": Fingerprint,
  "lock-closed-outline": Lock,
  "lock-outline": Lock,
  "people-outline": Users,
  person: User,
  "person-add": UserPlus,
  "person-outline": User,
  "account-circle": User,
  "emoji-emotions": PartyPopper,
  android: Bot,
  face: User,
  "photo-camera": Camera,
  "priority-high": TriangleAlert,
  "trash-outline": Trash2,
  "play-circle-outline": CirclePlay,
  "qr-code": QrCode,
  "qr-code-outline": QrCode,
  "qr-code-scanner": ScanQrCode,
  "radio-button-unchecked": Circle,
  refresh: RefreshCw,
  restaurant: Utensils,
  schedule: Clock,
  // AgendaTracker uses Material's `timer` icon for the remaining-live-session
  // label. Without this mapping web falls back to CircleHelp, rendering a
  // misleading question-mark badge instead of a clock.
  timer: Clock,
  search: Search,
  "search-off": SearchX,
  "search-outline": Search,
  send: Send,
  share: Share2,
  "shield-checkmark": ShieldCheck,
  "shield-outline": Shield,
  security: Shield,
  star: Star,
  "star-border": Star,
  "ticket-outline": Ticket,
  "trending-up": TrendingUp,
  "warning-outline": TriangleAlert,
  "network-check": Activity,
  sunny: Sun,
  timeline: Activity,
  "wb-sunny": Sun,
  sync: RefreshCw,
  "system-update": RefreshCw,
  tune: SlidersHorizontal,
  "video-call": Video,
  "volume-off": VolumeX,
  "volume-up": Volume2,
  subtitles: Captions,
  "subtitles-off": CaptionsOff,
  warning: TriangleAlert,
  settings: Cog,
  "call-outline": Phone,
  "logo-google-playstore": SquarePlay,
  "logo-apple": Apple,
  wallet: Wallet,
};

function WebMaterialIcons({ name, ...props }: IconProps) {
  const MappedIcon = WEB_MATERIAL_ICONS[name] ?? CircleHelp;
  // Lucide's Star renders as an outline by default; MaterialIcons distinguishes
  // the filled 'star' from the hollow 'star-border' as two different glyphs, so
  // fill it here to preserve that same filled/outline contrast.
  const fillProps =
    name === "star" ? { fill: (props as { color?: string }).color } : undefined;
  return <MappedIcon {...props} {...fillProps} />;
}

function WebIonicons({ name, ...props }: IconProps) {
  if (name === "logo-google") {
    return <GoogleIcon {...props} />;
  }

  if (name === "logo-google-playstore") {
    return <SquarePlay {...props} />;
  }

  if (name === "logo-apple") {
    return <Apple {...props} />;
  }

  const mappedName = WEB_IONICONS_TO_MATERIAL_ICONS[name] ?? "help-outline";
  return <WebMaterialIcons {...props} name={mappedName} />;
}

// Keep web rendering off the Expo font path so the browser never requests TTF assets.
const WEB_IONICONS_TO_MATERIAL_ICONS: Record<string, string> = {
  "alert-circle": "error-outline",
  "alert-circle-outline": "error-outline",
  "arrow-back": "arrow-back",
  "arrow-up": "arrow-upward",
  "book-outline": "book",
  "calendar-outline": "calendar-today",
  "call-outline": "call",
  "camera-outline": "camera-alt",
  "checkmark-circle": "check-circle",
  "chevron-down": "keyboard-arrow-down",
  "chevron-forward": "chevron-right",
  close: "close",
  "close-circle": "cancel",
  "cloud-download-outline": "cloud-download",
  "copy-outline": "content-copy",
  "calendar-today": "calendar-today",
  "compass-outline": "explore",
  dialpad: "dialpad",
  "information-circle-outline": "info-outline",
  "keypad-outline": "dialpad",
  "link-outline": "link",
  "log-in": "login",
  "log-out-outline": "logout",
  "mail-open-outline": "drafts",
  "mail-outline": "email",
  menu: "menu",
  moon: "moon",
  "moon-outline": "moon",
  "document-text-outline": "assignment",
  "eye-outline": "eye-outline",
  "finger-print-outline": "finger-print-outline",
  "globe-outline": "language",
  "help-circle-outline": "help-outline",
  "language-outline": "language",
  "lock-closed-outline": "lock-closed-outline",
  "notifications-outline": "notifications",
  "people-outline": "people-outline",
  "person-outline": "person",
  "refresh-outline": "refresh",
  "school-outline": "book-outline",
  "trash-outline": "trash-outline",
  "qr-code-outline": "qr-code",
  refresh: "refresh",
  "search-outline": "search",
  "settings-outline": "settings",
  "shield-outline": "security",
  "shield-checkmark-outline": "shield-checkmark",
  star: "star",
  "ticket-outline": "confirmation-number",
  "wallet-outline": "wallet",
  "warning-outline": "warning",
  sunny: "sunny",
  "logo-apple": "logo-apple",
  "logo-google-playstore": "logo-google-playstore",
};

export const Ionicons = Platform.OS === "web" ? WebIonicons : NativeIonicons;
export const MaterialIcons =
  Platform.OS === "web" ? WebMaterialIcons : NativeMaterialIcons;
