(function () {
  try {
    var stored = localStorage.getItem('hashpass_theme');
    var theme =
      stored === 'light'
        ? 'light'
        : stored === 'dark'
          ? 'dark'
          : stored === 'system'
            ? window.matchMedia('(prefers-color-scheme: light)').matches
              ? 'light'
              : 'dark'
            : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    var themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', theme === 'dark' ? '#050816' : '#fafbff');
  } catch (error) {}
})();
