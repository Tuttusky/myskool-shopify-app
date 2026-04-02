import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "./db.server";

/**
 * Public HTTPS URL of this app (must match Shopify Partner Dashboard).
 * Railway’s RAILWAY_PUBLIC_DOMAIN is sometimes unset; set SHOPIFY_APP_URL explicitly in production.
 */
function resolveAppUrl(): string {
  const tryHttps = (raw: string | undefined): string | undefined => {
    const v = raw?.trim();
    if (!v) return undefined;
    if (v.startsWith("http://") || v.startsWith("https://")) return v;
    // bare hostname (e.g. *.up.railway.app)
    const host = v.replace(/^https?:\/\//, "").split("/")[0];
    if (!host || host === "localhost" || host === "0.0.0.0" || host.startsWith("127."))
      return undefined;
    return `https://${host}`;
  };

  const rawList = [
    process.env.SHOPIFY_APP_URL,
    process.env.PUBLIC_URL,
    process.env.APP_URL,
    process.env.HOST,
    process.env.RAILWAY_PUBLIC_DOMAIN,
  ];

  for (const raw of rawList) {
    const url = tryHttps(raw);
    if (url) return url;
  }
  return "";
}

const appUrl = resolveAppUrl();
if (!appUrl) {
  throw new Error(
    "Missing public app URL. In Railway: open your service → Settings → Networking → generate a public domain, " +
      "then Variables → add SHOPIFY_APP_URL = https://<that-domain> (same URL in Shopify Partner Dashboard → App URL). " +
      "RAILWAY_PUBLIC_DOMAIN is not always injected; SHOPIFY_APP_URL is required if it stays empty.",
  );
}

// Partner Dashboard: Client ID → SHOPIFY_API_KEY, Client secret → SHOPIFY_API_SECRET (same names Shopify CLI uses).
const apiKey =
  process.env.SHOPIFY_API_KEY?.trim() || process.env.SHOPIFY_CLIENT_ID?.trim();
const apiSecretKey =
  process.env.SHOPIFY_API_SECRET?.trim() ||
  process.env.SHOPIFY_CLIENT_SECRET?.trim() ||
  "";

if (!apiKey || !apiSecretKey) {
  throw new Error(
    "Missing SHOPIFY_API_KEY and/or SHOPIFY_API_SECRET. In Railway, add them on this service (Variables) — " +
      "exact names: SHOPIFY_API_KEY (Client ID) and SHOPIFY_API_SECRET (Client secret from Shopify Partners). " +
      "Redeploy after saving. If you use another name, set SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET as aliases.",
  );
}

const shopify = shopifyApp({
  apiKey,
  apiSecretKey,
  apiVersion: ApiVersion.January25,
  scopes: process.env.SCOPES
    ? process.env.SCOPES.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined,
  appUrl,
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
