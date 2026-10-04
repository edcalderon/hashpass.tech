# Offline design notes

- IndexedDB holds versioned destination packs; localStorage holds the small saved itinerary.
- The service worker precaches the shell and pack, then caches same-origin GET responses.
- The bundled seed avoids a blank screen before IndexedDB initialization.
- The demo toggle changes capability messaging without pretending to disable the browser network.
- Emergency guidance is cached text, plainly scoped, and points to Colombia's national 123 line.
- Updates should use a new pack and cache version rather than mutate a published pack silently.
