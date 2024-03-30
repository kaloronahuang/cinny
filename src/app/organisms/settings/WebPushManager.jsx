import { useClientConfig } from "../../hooks/useClientConfig";
import settings from "../../../client/state/settings";
import cons from "../../../client/state/cons";
import { useMatrixClient } from "../../hooks/useMatrixClient";
import { useMemo, useState } from "react";

const urlB64ToUint8Array = (base64String) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export default function WebPushManager() {
  const cfg = useClientConfig();
  const mx = useMatrixClient();

  const setupWebpush = async (toggled) => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      const existingSubscription = await registration.pushManager.getSubscription();
      if (toggled && !existingSubscription) {
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: cfg.pushKey
        });
        const subscriptionObj = subscription.toJSON();
        console.log(subscriptionObj.expirationTime);
        mx.setPusher({
          app_display_name: "Cinny PWA",
          app_id: "app.cinny.in",
          data: {
            format: "",
            url: cfg.pushServer + "/_matrix/push/v1/notify",
            endpoint: subscriptionObj.endpoint,
            auth: subscriptionObj.keys.auth
          },
          device_display_name: cons.DEVICE_DISPLAY_NAME,
          device_id: "Cinny Test",
          enabled: toggled,
          kind: "http",
          lang: "en-US",
          pushkey: subscriptionObj.keys.p256dh
        });
      } else if (!toggled && existingSubscription) {
        const subscriptionObj = existingSubscription.toJSON();
        mx.setPusher({
          app_display_name: "Cinny PWA",
          app_id: "app.cinny.in",
          data: {
            format: "",
            url: cfg.pushServer + "/_matrix/push/v1/notify",
            endpoint: subscriptionObj.endpoint,
            auth: subscriptionObj.keys.auth
          },
          device_display_name: cons.DEVICE_DISPLAY_NAME,
          device_id: "Cinny Test",
          enabled: toggled,
          kind: null,
          lang: "en-US",
          pushkey: subscriptionObj.keys.p256dh
        });
        await existingSubscription.unsubscribe();
      }
    }
  }
  settings.addListener(cons.events.settings.NOTIFICATIONS_TOGGLED, setupWebpush)
  return (<></>);
}
