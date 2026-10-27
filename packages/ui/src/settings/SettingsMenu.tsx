'use client';

/**
 * Settings dropdown shared by Club, Companion and any other DOM React app: Appearance, Language and Animations
 * in the same order and shape as the mobile Quick Settings panel. It owns no state about the settings themselves;
 * each app passes values and callbacks, so it works with any provider. Colours come from a palette prop.
 * Mobile (react-native) shares the model in `./settings`, not this DOM component.
 */
import { createContext, useContext, useEffect, useId, useState, type CSSProperties, type ReactElement } from 'react';
import { uiTokens } from '../system/tokens';
import { SETTINGS_PALETTES } from './settings';
import type { SettingsChoice, SettingsMenuProps, SettingsPalette, SettingsToggleProps } from './settings.types';

const PaletteContext = createContext<SettingsPalette>(SETTINGS_PALETTES.cool.dark);

const paths: Record<NonNullable<SettingsChoice['icon']> | 'gear' | 'check' | 'chevron', string[]> = {
  gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z'],
  check: ['m5 12 4.5 4.5L19 7'],
  chevron: ['m6 9 6 6 6-6'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z'],
  contrast: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M12 3v18'],
  sun: ['M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  zap: ['M13 2 3 14h9l-1 8 10-12h-9l1-8Z'],
  sliders: ['M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6'],
  pause: ['M6 4h4v16H6zM14 4h4v16h-4z'],
};

function Icon({ name, size = 16 }: { name: keyof typeof paths; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
      {paths[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** On/off row for extra settings (for example voice-over). Use inside the menu's children. */
export function SettingsToggle({ label, description, note, checked, onChange, disabled }: SettingsToggleProps): ReactElement {
  const palette = useContext(PaletteContext);
  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', minHeight: 48, padding: '6px 4px', border: 0, background: 'transparent', color: palette.text, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, font: 'inherit', textAlign: 'left' }}
      >
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{label}</span>
          {description && <span style={{ display: 'block', fontSize: 12, color: palette.mutedText }}>{description}</span>}
        </span>
        <span aria-hidden style={{ position: 'relative', width: 44, height: 26, flex: 'none', borderRadius: uiTokens.radius.pill, border: `1px solid ${checked ? palette.activeBorder : palette.border}`, background: checked ? palette.activeSurface : palette.surface }}>
          <span style={{ position: 'absolute', top: 3, left: checked ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: checked ? palette.activeText : palette.mutedText, transition: 'left 0.15s' }} />
        </span>
      </button>
      {note && <p style={{ margin: '4px 4px 0', fontSize: 12, color: palette.mutedText }}>{note}</p>}
    </div>
  );
}

export function SettingsMenu(props: SettingsMenuProps): ReactElement {
  const { labels, isDark, themes, theme, onTheme, locales, locale, onLocale, animations, animation, onAnimation } = props;
  const palette = (props.palettes ?? SETTINGS_PALETTES.cool)[isDark ? 'dark' : 'light'];
  const size = props.size ?? 40;
  const [open, setOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const uid = useId();
  const current = locales.find((l) => l.code === locale) ?? locales[0];

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const pill = (active: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    border: `1px solid ${active ? palette.activeBorder : palette.border}`,
    background: active ? palette.activeSurface : palette.surface,
    boxShadow: active ? palette.activeShadow : 'none',
    color: active ? palette.activeText : palette.text,
    borderRadius: uiTokens.radius.pill,
    minHeight: 40,
    padding: '0 14px',
    cursor: 'pointer',
    font: 'inherit',
    fontSize: 14,
    fontWeight: 700,
  });
  const heading: CSSProperties = { fontSize: 12, fontWeight: 800, letterSpacing: '0.13em', textTransform: 'uppercase', color: palette.mutedText, margin: '0 0 10px' };
  const rule: CSSProperties = { height: 1, background: palette.border, margin: '16px 0' };

  const choiceRow = (items: readonly SettingsChoice[], value: string | undefined, pick: (v: string) => void) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {items.map((item) => (
        <button key={item.value} type="button" aria-pressed={value === item.value} title={item.description} onClick={() => pick(item.value)} style={pill(value === item.value)}>
          {item.icon && <Icon name={item.icon} />}
          {item.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className={props.triggerClassName}
        onClick={() => setOpen((v) => !v)}
        aria-label={labels.open}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? uid : undefined}
        title={labels.panel}
        style={{ width: size, height: size, padding: 0, lineHeight: 0, boxSizing: 'border-box', borderRadius: '50%', cursor: 'pointer', display: 'grid', placeItems: 'center', ...props.triggerStyle }}
      >
        <Icon name="gear" size={19} />
      </button>

      {open && (
        <>
          <button type="button" aria-label={labels.close} onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99, border: 0, background: 'transparent', cursor: 'default' }} />
          <section
            id={uid}
            className="hp-settings-panel"
            role="dialog"
            aria-label={labels.panel}
            style={{
              position: 'fixed',
              top: props.panelTop ?? 72,
              right: props.panelRight ?? 24,
              zIndex: 100,
              width: 'min(350px, calc(100vw - 32px))',
              maxHeight: 'min(640px, calc(100vh - 88px))',
              overflowY: 'auto',
              padding: 20,
              borderRadius: uiTokens.radius.card,
              border: `1px solid ${palette.border}`,
              background: palette.panel,
              boxShadow: isDark ? '0 24px 64px rgba(0,0,0,0.48)' : '0 24px 64px rgba(13,23,40,0.20)',
              color: palette.text,
              fontFamily: 'inherit',
            }}
          >
            <p style={heading}>{labels.appearance}</p>
            {choiceRow(themes, theme, onTheme)}

            <div style={rule} />
            <p style={heading}>{labels.language}</p>
            <button
              type="button"
              aria-expanded={langOpen}
              aria-haspopup="listbox"
              onClick={() => setLangOpen((v) => !v)}
              style={{ ...pill(false), width: '100%', justifyContent: 'flex-start', borderRadius: uiTokens.radius.media, minHeight: 46, fontWeight: 600 }}
            >
              <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>{current?.flag ?? '🌐'}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{current?.nativeName}</span>
              <span style={{ display: 'inline-flex', transform: langOpen ? 'rotate(180deg)' : 'none' }}><Icon name="chevron" /></span>
            </button>
            {langOpen && (
              <ul role="listbox" aria-label={labels.language} style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'grid', gap: 2 }}>
                {locales.map((option) => {
                  const active = option.code === locale;
                  return (
                    <li key={option.code} role="option" aria-selected={active}>
                      <button
                        type="button"
                        onClick={() => {
                          onLocale(option.code);
                          setLangOpen(false);
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', minHeight: 44, padding: '6px 10px', border: 0, borderRadius: uiTokens.radius.input, background: active ? palette.surface : 'transparent', color: palette.text, cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
                      >
                        <span aria-hidden style={{ fontSize: 20, lineHeight: 1 }}>{option.flag ?? '🌐'}</span>
                        <span style={{ flex: 1, fontSize: 15, fontWeight: active ? 700 : 500 }}>{option.nativeName}</span>
                        <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', border: `1px solid ${active ? palette.activeBorder : palette.border}`, background: active ? palette.activeSurface : 'transparent', color: active ? palette.activeText : palette.mutedText, fontSize: 10, fontWeight: 700 }}>
                          {active ? <Icon name="check" size={13} /> : option.code.toUpperCase()}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {animations && onAnimation && (
              <>
                <div style={rule} />
                <p style={heading}>{labels.animation}</p>
                {choiceRow(animations, animation, onAnimation)}
              </>
            )}

            {props.children && (
              <PaletteContext.Provider value={palette}>
                <div style={rule} />
                {props.children}
              </PaletteContext.Provider>
            )}
          </section>
          <style>{`
            .hp-settings-panel { animation: hp-settings-in 0.18s cubic-bezier(0.22,1,0.36,1) both; }
            @keyframes hp-settings-in { from { opacity: 0; transform: translateY(-8px) scale(0.98); } to { opacity: 1; transform: none; } }
            @media (prefers-reduced-motion: reduce) { .hp-settings-panel { animation: none; } }
            @media (max-width: 768px) { .hp-settings-panel { right: 16px !important; } }
          `}</style>
        </>
      )}
    </div>
  );
}
