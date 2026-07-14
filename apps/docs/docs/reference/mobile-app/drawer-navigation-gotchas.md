# react-navigation Drawer: Custom `drawerContent` Gotchas

Two bugs found and fixed together in v1.8.219, both in
`apps/mobile-app/app/(shared)/dashboard/_layout.tsx`'s `CustomDrawerContent`
(the component passed as `<Drawer drawerContent={...}>`). Neither produced
a crash or an error — both failed silently, which is why they're worth
documenting: nothing in the console pointed at the cause.

## Bug 1: `useNavigation()` inside `drawerContent` resolves to the wrong navigator

**Symptom**: tapping the hamburger button did nothing. No error, no
warning, no crash — `dispatch(DrawerActions.openDrawer())` appeared to
"succeed" (no exception thrown) but the drawer never visually opened.

**Root cause**: `CustomDrawerContent` called the `useNavigation()` hook to
get a navigation object:

```tsx
// Wrong — resolves to the nearest ancestor Stack navigator, not the Drawer
function CustomDrawerContent() {
  const navigation = useNavigation<DrawerNavigation>();
  ...
}
```

`@react-navigation/drawer` explicitly passes `navigation` as a **prop** to
whatever component renders as `drawerContent` — it's part of
`DrawerContentComponentProps`, and it's guaranteed to be the Drawer
navigator itself. `useNavigation()` resolves via React context lookup
instead, and in this app's specific tree, that context lookup found the
nearest ancestor **Stack** navigator, not the Drawer. `react-navigation`
silently drops a dispatched action that the target navigator doesn't
recognize (`OPEN_DRAWER` sent to a Stack navigator does nothing, no
error) — hence the tap "working" with zero visible or logged effect.

**Confirmed, not guessed**: added a temporary log calling `getState()` on
both the hook-obtained navigator and the prop-obtained one before fixing
anything —

```
drawerNavRef state:        {"type":"stack", ...}   // hook — wrong
navigationFromContext state: {"type":"stack", ...}  // same object!
```

— proving they were literally the same Stack navigator. After the fix:

```
drawerNavRef state: {"type":"drawer", "routeNames":["explore","notifications",...]}
```

**Fix**: use the prop, not the hook.

```tsx
function CustomDrawerContent({ navigation }: DrawerContentComponentProps) {
  // navigation here IS the Drawer navigator
}
```

**Takeaway**: any custom component rendered via `drawerContent` (or
similarly, a custom `header` render prop, `tabBarContent`, etc.) receives
the correctly-scoped navigation object as a **prop** for exactly this
reason — reach for the prop before reaching for `useNavigation()`. The
hook is for components that don't otherwise have access to it; components
react-navigation renders directly into a slot usually already have it.

## Bug 2: a sibling Header with elevated `zIndex` paints over the open drawer panel

**Context**: this app renders a custom `Header` as a sibling of `<Drawer>`
on Android (not inside it), with `position: absolute` and `zIndex: 1000`,
so screen content can scroll underneath it. See the comment block above
`ScreenWithHeader` in `_layout.tsx` for why Header lives outside the
Drawer's own subtree on Android specifically (a separate, older
react-native-screens crash workaround).

**Symptom**: once Bug 1 was fixed and the drawer actually opened, its
panel was visible but visually started *below* the Header row instead of
covering the full screen — the Header appeared to sit on top of the open
drawer.

**What didn't work**: dropping the Header's `zIndex` conditionally
(`isDrawerOpen ? 0 : 1000`) while the drawer is open. Confirmed via log
that `isDrawerOpen` was flipping correctly and the style was being
applied — the Header still rendered on top regardless. React Native's
`zIndex` reliably reorders siblings within the *same* stacking context,
but Android specifically often needs a matching `elevation` too for
genuine overlap reordering, and/or the Drawer's own open panel may render
through a native surface that a plain sibling `zIndex` change can't
out-rank.

**What worked**: don't render the Header at all while the drawer is open,
instead of trying to out-stack it.

```tsx
{Platform.OS === 'android' && !isDrawerOpen && <ScreenWithHeader />}
```

The Drawer's own content already has its own top branding/header, so
nothing is visually lost — and this sidesteps the stacking question
entirely rather than fighting it.

**Getting `isDrawerOpen` into `DashboardLayout`**: `@react-navigation/drawer`
exports `useDrawerStatus()`, but it only works called from *inside* the
Drawer's context — i.e., from `CustomDrawerContent`, not from
`DashboardLayout` itself (which renders `<Drawer>`, and is therefore an
ancestor, not a descendant, of the Drawer's own context). Lift it with a
callback prop:

```tsx
// CustomDrawerContent
const drawerStatus = useDrawerStatus();
useEffect(() => {
  onDrawerStatusChange?.(drawerStatus === 'open');
}, [drawerStatus, onDrawerStatusChange]);

// DashboardLayout
const [isDrawerOpen, setIsDrawerOpen] = useState(false);
// ...pass onDrawerStatusChange={setIsDrawerOpen} down via drawerContent
```

**Side effect worth knowing about**: with the Header hidden while the
drawer is open, the hamburger button (part of Header) can't be tapped
again to close the drawer on Android — there's nothing on screen to tap.
Users close it via the standard drawer affordances instead: tapping the
dimmed backdrop, swiping, or the Android back button — all handled by
react-navigation's Drawer natively, unaffected by any of this. The
`onPress` handler was changed from always `DrawerActions.openDrawer()` to
`DrawerActions.toggleDrawer()` anyway, since on iOS `Header` renders
*inside* the Drawer's own header slot (a different code path,
`drawerHeaderOptions` in the same file) and stays reachable while the
drawer is open — toggling is what makes the same button close it there.

## How this was actually debugged

Static code reading didn't find either bug — both were found by adding
temporary, clearly-marked `console.log`/`getState()` instrumentation,
rebuilding a real release APK, and reading `adb logcat` while
reproducing on an emulator. See
[local-android-debugging.md](./local-android-debugging.md) for the
general workflow. Don't skip straight to a plausible-sounding fix for a
silent failure like this — get the actual navigator state or event log
first.
