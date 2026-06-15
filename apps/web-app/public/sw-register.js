(function () {
  try {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    var isLocalhost =
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1' ||
      location.hostname === '[::1]';

    if (location.protocol !== 'https:' && !isLocalhost) {
      return;
    }

    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (error) {
        console.warn('Service worker registration failed', error);
      });
    });
  } catch (error) {}
})();
