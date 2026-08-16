(function () {
  try {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    // Deliberately https-only, even though browsers also allow service
    // workers on plain http://localhost. Registering on localhost meant the
    // dev server (next dev, always http://localhost) got a real SW
    // intercepting /_next/static/* chunk requests -- Next's dev chunk
    // hashes change on every HMR update, but the SW kept serving stale
    // cached ones, causing flicker/full-reload loops that persisted even
    // after clearing the browser cache (the SW registration itself, and its
    // separate Cache Storage, survive a normal cache clear). Production is
    // always https, so this doesn't affect real users.
    if (location.protocol !== 'https:') {
      return;
    }

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (error) {
        console.warn('Service worker registration failed', error);
      });
    });
  } catch (error) {}
})();
