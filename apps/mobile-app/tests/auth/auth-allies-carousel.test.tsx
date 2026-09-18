import React from "react";
import { act, create, ReactTestRenderer } from "react-test-renderer";
const AuthAlliesCarousel = jest.requireActual("../../components/auth/AuthAlliesCarousel.tsx").default;

jest.mock("lucide-react", () => ({ Pause: "pause-icon", Play: "play-icon" }));

describe("auth allies carousel", () => {
  let renderer: ReactTestRenderer;
  let motionChange: () => void;
  let resize: () => void;
  let reduced = false;
  const disconnect = jest.fn();
  const removeEventListener = jest.fn();
  const props = { enabled: true, pauseLabel: "Pause", resumeLabel: "Resume", color: "red" };
  const cards = [<div key="a">Event A</div>, <div key="b">Event B</div>];

  beforeEach(() => {
    reduced = false;
    jest.clearAllMocks();
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({
      get matches() { return reduced; },
      addEventListener: (_: string, listener: () => void) => { motionChange = listener; },
      removeEventListener,
    }) });
    global.ResizeObserver = jest.fn().mockImplementation((callback) => {
      resize = callback;
      return { observe: jest.fn(), disconnect };
    });
  });

  afterEach(() => { act(() => renderer?.unmount()); });

  const mount = (enabled = true, children = cards) => act(() => {
    renderer = create(<AuthAlliesCarousel {...props} enabled={enabled}>{children}</AuthAlliesCarousel>, {
      createNodeMock: () => ({ clientWidth: 600 }),
    });
  });

  it("fills the viewport with two equal loop groups and hides duplicate items", () => {
    mount();
    const track = renderer.root.findByProps({ className: "auth-allies-track" });
    expect(track.children).toHaveLength(2);
    expect(track.props.style.animationDuration).toBe(`${816 / 28}s`);
    expect(renderer.root.findAllByProps({ inert: true })).toHaveLength(3);
    act(() => resize());
    act(() => renderer.unmount());
    expect(disconnect).toHaveBeenCalled();
    expect(removeEventListener).toHaveBeenCalled();
  });

  it("supports explicit pause and resume", () => {
    mount();
    act(() => renderer.root.findByType("button").props.onClick());
    expect(renderer.root.findByType("button").props["aria-label"]).toBe("Resume");
    expect(renderer.root.findByProps({ className: "auth-allies-track" }).props.style.animationPlayState).toBe("paused");
    act(() => renderer.root.findByType("button").props.onClick());
    expect(renderer.root.findByType("button").props["aria-label"]).toBe("Pause");
  });

  it("reacts to system reduced motion without repeating cards", () => {
    mount();
    act(() => { reduced = true; motionChange(); });
    expect(renderer.root.findAllByType("button")).toHaveLength(0);
    expect(renderer.root.findAllByProps({ children: "Event A" })).toHaveLength(1);
    act(() => { reduced = false; motionChange(); });
    expect(renderer.root.findAllByType("button")).toHaveLength(1);
  });

  it("does not animate disabled mode or a single ally", () => {
    mount(false);
    expect(renderer.root.findAllByType("button")).toHaveLength(0);
    act(() => renderer.update(<AuthAlliesCarousel {...props}>{[cards[0]]}</AuthAlliesCarousel>));
    expect(renderer.root.findAllByType("button")).toHaveLength(0);
  });
});
