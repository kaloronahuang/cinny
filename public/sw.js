/* eslint-disable import/no-extraneous-dependencies */
/// <reference types="vite-plugin-pwa/client" />
import NOTIFICATION_BADGE_ICON from "./favicon.ico?url";
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
import { clientsClaim } from "workbox-core";

const baseURL = new URL(self.registration.scope);

async function findClient(predicate) {
  const clientList = await self.clients.matchAll({type: "window"});
  for (const client of clientList) {
    if (await predicate(client)) {
      return client;
    }
  }
}

self.addEventListener("install", () => {
  console.log("[ServiceWorker] Installed!");
  self.skipWaiting();
});

self.addEventListener("activate", () => {
  console.log("[ServiceWorker] Activated");
  self.skipWaiting();
});

const NOTIF_TAG_NEW_MESSAGE = "new_message";

const setNotificationBadge = async (badgeCount) => {
  console.log("[ServiceWorker] Setting new app badge count", { badgeCount });
  self.navigator.setAppBadge?.(badgeCount);
};

const handlePush = async (data) => {
  const sessionId = data.session_id;
  let sender = data.sender_display_name || data.sender;
  if (sender && data.event_id) {
    const roomId = data.room_id;
    const hasFocusedClientOnRoom = !!await findClient(async client => {
      return true;
    });
    if (hasFocusedClientOnRoom) {
      console.log("client is focused, room is open, don't show notif");
      return;
    }
    const newMessageNotifs = Array.from(await self.registration.getNotifications({tag: NOTIF_TAG_NEW_MESSAGE}));
    const notifsForRoom = newMessageNotifs.filter(n => n.data.roomId === roomId);
    const hasMultiNotification = notifsForRoom.some(n => n.data.multi);
    const hasSingleNotifsForRoom = newMessageNotifs.some(n => !n.data.multi);
    const roomName = data.room_name || data.room_alias;
    let multi = false;
    let label;
    let body;
    if (hasMultiNotification) {
      console.log("already have a multi message, don't do anything");
      return;
    } else if (hasSingleNotifsForRoom) {
      console.log("showing multi message notification");
      multi = true;
      label = roomName || sender;
      body = "New messages";
    } else {
      console.log("showing new message notification");
      if (roomName && roomName !== sender) {
          label = `${sender} in ${roomName}`;
      } else {
          label = sender;
      }
      body = data.content?.body || "New message";
    }
    await self.registration.showNotification(label, {
      body,
      data: {sessionId, roomId, multi},
      badge: NOTIFICATION_BADGE_ICON,
      tag: NOTIF_TAG_NEW_MESSAGE
    });
  }
  await setNotificationBadge(data.unread || 0);
};

self.addEventListener("push", (event) => {
  console.log("[ServiceWorker] Received Web Push Event", event);
  event.waitUntil(handlePush(event.data.json()));
});

const handleClick = async (event) => {
  if (event.notification.tag !== NOTIF_TAG_NEW_MESSAGE) {
    console.log("clicked notif with tag", event.notification.tag);
    return;
  }
  const clientWithSession = await findClient(async client => {
    return await sendAndWaitForReply(client, "hasSessionOpen", {sessionId});
  });
  if (!clientWithSession && self.clients.openWindow) {
    console.log("notificationclick: no client found with session open, opening new window");
    const window = new URL(`./`, baseURL).href;
    await self.clients.openWindow(window);
  }
};

self.addEventListener("notificationclick", (event) => {
  console.log("[ServiceWorker] NotificationClick");
  event.waitUntil(handleClick(event));
});

precacheAndRoute(
  self.__WB_MANIFEST
);

// Claim all open windows
clientsClaim();
// Delete any cached old dist files from previous service worker versions
cleanupOutdatedCaches();

if (!import.meta.env.DEV) {
  // this is the fallback single-page-app route, matching vite.config.js PWA config,
  // and is served by the go web server. It is needed for the single-page-app to work.
  // https://developer.chrome.com/docs/workbox/modules/workbox-routing/#how-to-register-a-navigation-route
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL("/index.html"))
  );

  // the manifest excludes config.js (see vite.config.js) since the dist-file differs from the
  // actual config served by the go server. this adds it back with `NetworkFirst`, so that the
  // most recent config from the go server is cached, but the app still works if the network
  // is unavailable. this is important since there's no "refresh" button in the installed pwa
  // to force a reload.
  registerRoute(({ url }) => url.pathname === "/config.json", new NetworkFirst());
}
