// Dominio rivendicato dall'app iPhone (Associated Domains: webcredentials e
// applinks) per il redirect HTTPS del login (ASWebAuthenticationSession .https,
// iOS 17.4+). L'app id (TEAMID.bundle id) arriva SOLO da MOBILE_APPLE_APP_ID:
// se manca o non ha il formato atteso il file non si serve (404).
export const MOBILE_CALLBACK_PATH = "/mobile/oauth/callback";
export const AASA_PATH = "/.well-known/apple-app-site-association";

const APP_ID_FORMAT = /^[A-Z0-9]{10}\.[A-Za-z0-9][A-Za-z0-9.-]*$/;

export function appleAppSiteAssociation(appId: string | undefined) {
  if (!appId || !APP_ID_FORMAT.test(appId)) return null;
  return {
    webcredentials: { apps: [appId] },
    applinks: {
      details: [{ appIDs: [appId], components: [{ "/": MOBILE_CALLBACK_PATH }] }],
    },
  };
}
