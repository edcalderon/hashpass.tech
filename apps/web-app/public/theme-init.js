(function () {
  try {
    var stored = localStorage.getItem('hashpass_theme');
    var theme =
      stored === 'light'
        ? 'light'
        : stored === 'dark'
          ? 'dark'
          : window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (error) {}
})();
