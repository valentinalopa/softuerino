export const SESSION_COOKIE_NAME = "softuerino_session";

// Header interno: lo imposta solo src/proxy.ts (a "1") sulle richieste sotto
// /api/mobile/ e lo toglie sempre da quelle in arrivo dal client. Il Bearer vale
// solo se c'è: ovunque altrove getSession lo ignora.
export const MOBILE_REQUEST_HEADER = "x-softuerino-mobile";
