// UP10 MCQ MASTER - Service Worker
// Cache version - badhao jab bhi files update karo taaki purana cache clear ho
const CACHE_VERSION = "up10-mcq-master-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./questions.js",
  "./manifest.webmanifest",
  "./icon.svg"
];

// INSTALL: app shell cache karo
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_VERSION);
        await cache.addAll(APP_SHELL);
      } catch (err) {
        console.error("SW install cache error:", err);
      }
      self.skipWaiting();
    })()
  );
});

// ACTIVATE: purane cache versions delete karo
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        );
      } catch (err) {
        console.error("SW activate cleanup error:", err);
      }
      await self.clients.claim();
    })()
  );
});

// FETCH: network-first for navigation/app-shell files, cache fallback for offline
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Sirf GET requests handle karo
  if (req.method !== "GET") {
    return;
  }

  // Cross-origin requests ko default browser behaviour par chhodo
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        // Network se latest file fetch karne ki koshish
        const networkResponse = await fetch(req);
        if (networkResponse && networkResponse.status === 200) {
          const cache = await caches.open(CACHE_VERSION);
          cache.put(req, networkResponse.clone());
        }
        return networkResponse;
      } catch (err) {
        // Network fail -> cache se serve karo
        const cachedResponse = await caches.match(req);
        if (cachedResponse) {
          return cachedResponse;
        }
        // Navigation requests ke liye index.html fallback
        if (req.mode === "navigate") {
          const fallback = await caches.match("./index.html");
          if (fallback) return fallback;
        }
        return new Response("Offline aur cache mein file uplabdh nahi hai.", {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
      }
    })()
  );
});
