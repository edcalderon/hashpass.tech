(function () {
  try {
    var host = window.location.hostname.toLowerCase();
    var path = window.location.pathname || '/';
    var search = window.location.search || '';
    var hash = window.location.hash || '';
    var target = null;
    var eventHostSuffix = '.hashpass.tech';
    var attendingEventHosts = {
      'bsl-on-tour': true,
      bsl2025: true,
      chile2026: true,
      colombia2026: true,
      cbweek: true,
      cbweek2026: true,
      'hash-poker': true,
      peru2026: true,
    };

    if (host === 'attending.hashpass.tech') {
      if (path === '/attending' || path === '/attending/' || path === '/attending/index.html') {
        target = 'https://attending.hashpass.tech/' + search + hash;
      }
      var isAttendingLanding = /^\/attending\/?$/i.test(path);
      var legacyEvent = isAttendingLanding ? null : path.match(/^\/([a-z0-9][a-z0-9-]{0,79})\/?$/i);
      var attendingEvent = path.match(/^\/attending\/([a-z0-9][a-z0-9-]{0,79})\/?$/i);
      var eventSlug = legacyEvent ? legacyEvent[1] : attendingEvent ? attendingEvent[1] : null;
      if (eventSlug) {
        var encodedSlug = encodeURIComponent(eventSlug.toLowerCase());
        var eventPath = eventSlug.toLowerCase() === 'bsl' ? '/attending/bsl/' : '/';
        target = 'https://' + encodedSlug + '.hashpass.tech' + eventPath + search + hash;
      }
    } else if (host === 'club.hashpass.tech') {
      target = 'https://hashpass.club' + path + search + hash;
    } else if (host === 'hashpass.club') {
      if (/^\/attending\/?$/i.test(path)) {
        target = 'https://hashpass.club/' + search + hash;
      }
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
    } else if (host === 'bsl.hashpass.tech') {
      // Keep the existing BSL app intact; its artwork builder is nested below /attending/bsl/.
    } else if (host.endsWith(eventHostSuffix)) {
      var subdomain = host.slice(0, -eventHostSuffix.length);
      if (subdomain.indexOf('.') === -1 && attendingEventHosts[subdomain] === true) {
        var eventRoute = path.match(/^\/attending\/([a-z0-9][a-z0-9-]{0,79})\/?$/i);
        var shortRoute = path.match(/^\/([a-z0-9][a-z0-9-]{0,79})\/?$/i);
        var requestedSlug = eventRoute ? eventRoute[1] : shortRoute ? shortRoute[1] : null;
        if (path === '/attending' || path === '/attending/') {
          target = 'https://' + host + '/' + search + hash;
        } else if (eventRoute && requestedSlug === subdomain) {
          // Static hosting rewrites the event subdomain root to this page.
        } else if (requestedSlug) {
          var encodedEvent = encodeURIComponent(requestedSlug.toLowerCase());
          var requestedPath = requestedSlug.toLowerCase() === 'bsl' ? '/attending/bsl/' : '/';
          target = 'https://' + encodedEvent + eventHostSuffix + requestedPath + search + hash;
        }
      }
    }

    if (target && target !== window.location.href) {
      window.location.replace(target);
    }
  } catch (error) {}
})();
