import type React from 'react';

/**
 * The app's standard bottom-sheet drawer, shared by every drawer surface for consistent
 * look and behavior. Conventions follow mobile-platform standards (Material 3 bottom
 * sheet / iOS sheet): a centered grabber pill — never a text "Expand" label — that toggles
 * between the content-sized sheet and a near-full-height expanded mode, a frosted backdrop
 * on web (plain dim on native, where no backdrop blur exists), rounded top corners, and a
 * close affordance in the header row. Screen readers still get names for every control
 * (`expandLabel`/`shrinkLabel`/`closeLabel`); nothing relies on the visual pill alone.
 *
 * Two layout/animation rules the earlier versions got wrong:
 * - The dim/blur backdrop absolutely fills the modal and the panel anchors over it. A
 *   backdrop laid out as a `flex: 1` sibling of the drawer splits the screen 50/50 and
 *   leaves an undimmed white strip above the sheet.
 * - The entrance animation is driven here with the JS driver (`useNativeDriver: false`).
 *   `animationType="slide"` asks for the native animated module, which does not exist on
 *   web — every open logged the "useNativeDriver is not supported" fallback warning.
 */
export type DrawerSheetProps = {
  open: boolean;
  onClose: () => void;
  /** Header row with the title and × button. Omit for a grabber-only sheet. */
  title?: string;
  closeLabel?: string;
  expandLabel?: string;
  shrinkLabel?: string;
  /** 'content' (default) sizes the sheet to its children. 'medium' opens at a fixed
   *  mid-height sheet (~60% of the screen) so information drawers feel substantial
   *  without covering the page; content scrolls inside. */
  defaultHeight?: 'content' | 'medium';
  /** Pinned below the scrolling body (primary actions). Omit for a body-only sheet. */
  footer?: React.ReactNode;
  children: React.ReactNode;
};
