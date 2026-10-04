import React, { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { ActionButton, Badge, FilterChip, FormField, Surface } from '@hashpass/ui/primitives';
import { uiPalette, uiTokens, type ColorMode } from '@hashpass/ui/tokens';
import seedPack from '../data/guatape.json';
import { buildItinerary } from './engine';
import { getPack, getSavedItinerary, getSimulatedOffline, saveItinerary, savePack, saveSimulatedOffline } from './storage';
import type { DestinationPack, ItineraryItem, Language } from './types';
import './styles.css';

const fallback = seedPack as DestinationPack;
type View = 'guide' | 'businesses' | 'essential';
const copy = {
  en: {
    eyebrow: 'OFFLINE DESTINATION INTELLIGENCE', title: 'Guatapé, in your pocket.',
    subtitle: 'Download local knowledge once. Explore confidently—even when your signal disappears.',
    download: 'Download for offline use', ready: 'Offline pack ready', pack: 'Offline pack',
    ask: 'What do you want to do in Guatapé?', placeholder: 'I have 3 hours, COP 100,000. I like nature and local food.',
    plan: 'Build my offline plan', local: 'Support local', essential: 'Essential', guide: 'Ask LocalPass',
    businesses: 'Local businesses', saved: 'Saved offline', demo: 'Simulate offline', online: 'Online', offline: 'Offline',
    why: 'Why this fits', cost: 'Estimated cost', time: 'Time', empty: 'Your practical plan will appear here.',
    dataset: 'Demo dataset based on publicly available local information.',
    core: 'Core guidance is running entirely on this device.', day: 'Your day, locally made',
    internet: 'Not required', essentialTitle: 'Essential information',
    footer: 'Download intelligence once. Use it many times.', operators: 'local operators',
    storageError: 'Unable to save on this device. Check browser storage settings and try again.',
    suggestions: ['2 hours · COP 50,000', 'Local food', 'Rainy day'],
  },
  es: {
    eyebrow: 'INTELIGENCIA LOCAL SIN CONEXIÓN', title: 'Guatapé, en tu bolsillo.',
    subtitle: 'Descarga el conocimiento local una vez. Explora con confianza, incluso sin señal.',
    download: 'Descargar para usar sin conexión', ready: 'Paquete sin conexión listo', pack: 'Paquete sin conexión',
    ask: '¿Qué quieres hacer en Guatapé?', placeholder: 'Tengo 3 horas y COP 100.000. Me gusta la naturaleza y la comida local.',
    plan: 'Crear mi plan sin conexión', local: 'Apoya local', essential: 'Esencial', guide: 'Pregunta a LocalPass',
    businesses: 'Negocios locales', saved: 'Guardado sin conexión', demo: 'Simular sin conexión', online: 'En línea', offline: 'Sin conexión',
    why: 'Por qué encaja', cost: 'Costo estimado', time: 'Tiempo', empty: 'Tu plan práctico aparecerá aquí.',
    dataset: 'Datos de demostración basados en información local disponible públicamente.',
    core: 'La guía esencial funciona completamente en este dispositivo.', day: 'Tu día, hecho localmente',
    internet: 'No requerido', essentialTitle: 'Información esencial',
    footer: 'Descarga inteligencia una vez. Úsala muchas veces.', operators: 'operadores locales',
    storageError: 'No se pudo guardar en este dispositivo. Revisa el almacenamiento del navegador e inténtalo de nuevo.',
    suggestions: ['2 horas · COP 50.000', 'Comida local', 'Día lluvioso'],
  },
};
const paymentLabels: Record<string, string> = { cash: 'efectivo', card: 'tarjeta' };

function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [mode, setMode] = useState<ColorMode>(() => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [pack, setPack] = useState<DestinationPack>(fallback);
  const [downloaded, setDownloaded] = useState(false);
  const [simulated, setSimulated] = useState(getSimulatedOffline);
  const [online, setOnline] = useState(navigator.onLine);
  const [view, setView] = useState<View>('guide');
  const [query, setQuery] = useState(copy.en.placeholder);
  const [items, setItems] = useState<ItineraryItem[]>(getSavedItinerary);
  const [storageError, setStorageError] = useState(false);
  const t = copy[language];
  const offline = simulated || !online;
  const palette = uiPalette(mode);
  const theme = {
    ...Object.fromEntries(Object.entries(palette).map(([key, value]) => [`--${key}`, value])),
    ...Object.fromEntries(Object.entries(uiTokens.space).map(([key, value]) => [`--space-${key}`, `${value}px`])),
    ...Object.fromEntries(Object.entries(uiTokens.type).map(([key, value]) => [`--type-${key}`, `${value}px`])),
    '--media-radius': `${uiTokens.radius.media}px`,
  } as CSSProperties;
  const money = (cost: number) => `COP ${cost.toLocaleString(language === 'es' ? 'es-CO' : 'en-US')}`;

  useEffect(() => {
    // Older downloaded packs lack bilingual metadata; refresh from the bundled pack.
    getPack().then(async cached => {
      if (!cached) return;
      if (cached.places.every(place => place.location_es && place.category_es && place.opening_hours_es)) {
        setPack(cached);
      } else {
        await savePack(fallback);
      }
      setDownloaded(true);
    }).catch(() => setStorageError(true));
    const onNetworkChange = () => setOnline(navigator.onLine);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onThemeChange = () => setMode(media.matches ? 'dark' : 'light');
    media.addEventListener('change', onThemeChange);
    addEventListener('online', onNetworkChange);
    addEventListener('offline', onNetworkChange);
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      void navigator.serviceWorker.register('/sw.js').catch(() => setStorageError(true));
    }
    return () => {
      media.removeEventListener('change', onThemeChange);
      removeEventListener('online', onNetworkChange);
      removeEventListener('offline', onNetworkChange);
    };
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const size = useMemo(() => (new Blob([JSON.stringify(pack)]).size / 1024).toFixed(0), [pack]);

  async function download() {
    try {
      await savePack(fallback);
      setPack(fallback);
      setDownloaded(true);
      setStorageError(false);
    } catch { setStorageError(true); }
  }
  function plan() {
    const next = buildItinerary(pack, query, language);
    setItems(next);
    try { saveItinerary(next); setStorageError(false); }
    catch { setStorageError(true); }
  }
  function toggleOffline() {
    try {
      saveSimulatedOffline(!simulated);
      setSimulated(!simulated);
      setStorageError(false);
    } catch { setStorageError(true); }
  }

  return <div className="app" style={theme}>
    <header>
      <a className="brand" href="#top"><img src="/brand/localpass-mark.svg" alt="" /><span>LocalPass</span></a>
      <div className="header-actions">
        <ActionButton mode={mode} variant="ghost" label={language === 'en' ? 'Español' : 'English'} onPress={() => setLanguage(language === 'en' ? 'es' : 'en')} />
        <div role="status"><Badge mode={mode} tone={offline ? 'accent' : 'neutral'}>{offline ? t.offline : t.online}</Badge></div>
      </div>
    </header>
    <main id="top">
      <section className="hero">
        <div>
          <p className="eyebrow">{t.eyebrow}</p><h1>{t.title}</h1><p className="lead">{t.subtitle}</p>
          <Surface mode={mode} style={{ gap: uiTokens.space.lg }}>
            <strong>Guatapé</strong><span>{downloaded ? t.ready : `${t.pack} · ${size} KB`}</span>
            <ActionButton mode={mode} onPress={download} disabled={downloaded} label={downloaded ? t.ready : t.download} />
          </Surface>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="sun" /><div className="mountain m1" /><div className="mountain m2" /><div className="water" /><div className="town">▰ ▰ ▰ ▰</div><div className="art-label"><span>06°14′N</span><strong>Antioquia</strong></div></div>
      </section>
      <Surface mode={mode}>
        <div className="offline-bar">
          <div><strong>{offline ? t.offline : t.online}</strong><p>{t.core}</p></div>
          <FilterChip mode={mode} selected={simulated} aria-pressed={simulated} label={t.demo} onPress={toggleOffline} />
        </div>
      </Surface>
      {storageError && <p role="alert">{t.storageError}</p>}
      <nav aria-label={language === 'es' ? 'Secciones' : 'Sections'}>
        {(['guide', 'businesses', 'essential'] as const).map(tab => <FilterChip key={tab} mode={mode} selected={view === tab} aria-pressed={view === tab} label={t[tab]} onPress={() => setView(tab)} />)}
      </nav>
      {view === 'guide' && <section className="workspace">
        <Surface mode={mode}>
          <span className="section-no">01</span><h2>{t.ask}</h2>
          <FormField mode={mode} label={t.ask} value={query} onChangeText={setQuery} placeholder={t.placeholder} multiline numberOfLines={5} />
          <div className="suggestions">{t.suggestions.map(suggestion => <FilterChip key={suggestion} mode={mode} label={suggestion} selected={query === suggestion} aria-pressed={query === suggestion} onPress={() => setQuery(suggestion)} />)}</div>
          <ActionButton mode={mode} label={t.plan} onPress={plan} /><p className="privacy">{t.core}</p>
        </Surface>
        <Surface mode={mode}>
          <div className="result-title"><div><span className="section-no">02</span><h2>{t.day}</h2></div>{items.length > 0 && !storageError && <Badge mode={mode}>{t.saved}</Badge>}</div>
          {items.length === 0 ? <div className="empty"><p>{t.empty}</p></div> : <div className="timeline">{items.map(item => {
            const place = pack.places.find(candidate => candidate.id === item.place_id);
            if (!place) return null;
            return <article key={item.place_id}>
              <time>{item.start_time}</time><div>
                <div className="card-head"><h3>{place.name}</h3>{place.local_business && <Badge mode={mode}>{t.local}</Badge>}</div>
                <p>{place[`description_${language}`]}</p>
                <dl><div><dt>{t.time}</dt><dd>{item.duration} min</dd></div><div><dt>{t.cost}</dt><dd>{money(item.estimated_cost)}</dd></div><div><dt>Internet</dt><dd>{t.internet}</dd></div></dl>
                <p><b>{t.why}:</b> {language === 'es' ? 'Se ajusta a tu tiempo y presupuesto.' : 'Fits your time and budget.'}</p>
              </div>
            </article>;
          })}</div>}
        </Surface>
      </section>}
      {view === 'businesses' && <section className="directory">
        <span className="section-no">02</span><h2>{t.businesses}</h2><p>{t.dataset}</p>
        <div className="grid">{pack.places.filter(place => place.local_business).map(place => <Surface key={place.id} mode={mode} style={{ gap: uiTokens.space.md }}>
          <Badge mode={mode}>{t.local}</Badge><span className="category">{language === 'es' ? place.category_es : place.category}</span>
          <h3>{place.name}</h3><p>{place[`description_${language}`]}</p>
          <small>{language === 'es' ? place.location_es : place.location} · {language === 'es' ? place.opening_hours_es : place.opening_hours}</small>
          <strong>{money(place.estimated_cost)} · {place.accepted_payments.map(payment => language === 'es' ? paymentLabels[payment] ?? payment : payment).join(' / ')}</strong>
        </Surface>)}</div>
      </section>}
      {view === 'essential' && <section className="directory">
        <span className="section-no">03</span><h2>{t.essentialTitle}</h2><p>{t.core}</p>
        <div className="essential-grid">{[...pack.essential].sort((a, b) => a.priority - b.priority).map(entry => <Surface key={entry.type} mode={mode}>
          <h3>{entry[`title_${language}`]}</h3><p>{entry[`content_${language}`]}</p>
        </Surface>)}</div>
      </section>}
    </main>
    <footer><strong>LocalPass</strong><span>{t.footer}</span><span>Guatapé · {pack.places.filter(place => place.local_business).length} {t.operators} · EN / ES</span></footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
