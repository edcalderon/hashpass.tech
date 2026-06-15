(function () {
  try {
    var host = window.location.hostname.toLowerCase();
    var path = window.location.pathname || '/';
    var search = window.location.search || '';
    var hash = window.location.hash || '';
    var target = null;

    if (host === 'club.hashpass.tech') {
      target = 'https://hashpass.club' + path + search + hash;
    } else if (host === 'docs.hashpass.tech') {
      if (path === '/' || path === '/documentation' || path === '/documentation/') {
        target = 'https://hashpass.club/documentation/' + search + hash;
      } else if (!path.startsWith('/documentation/')) {
        target =
          'https://hashpass.club/documentation' +
          (path.charAt(0) === '/' ? path : '/' + path) +
          search +
          hash;
      }
    }

    if (target && target !== window.location.href) {
      window.location.replace(target);
    }
  } catch (error) {}
})();
