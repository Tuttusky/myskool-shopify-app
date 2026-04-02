import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import { authenticate, unauthenticated } from "../shopify.server";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Accept, Authorization, X-Requested-With, X-Shopify-Access-Token",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonWithCors(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  const c = corsHeaders();
  Object.entries(c).forEach(([k, v]) => headers.set(k, String(v)));
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers,
  });
}

function extractShopDomain(request: Request): string | null {
  const url = new URL(request.url);
  const fromParam = url.searchParams.get("shop");
  if (fromParam) return fromParam;
  const referer = request.headers.get("referer") || request.headers.get("origin") || "";
  const match = referer.match(/([a-z0-9-]+\.myshopify\.com)/i);
  return match ? match[1] : null;
}

async function getAdminClient(request: Request) {
  const url = new URL(request.url);

  // 1. App Proxy auth (storefront → Shopify → Railway, includes HMAC signature)
  try {
    const proxy = await authenticate.public.appProxy(request);
    if (proxy.admin) {
      console.log("[api.upload-photo] App Proxy auth OK, admin available");
      return proxy.admin;
    }
    console.warn(
      "[api.upload-photo] App Proxy auth OK but admin is null. Shop:",
      url.searchParams.get("shop") || "(unknown)",
    );
  } catch (proxyErr) {
    console.log(
      "[api.upload-photo] Not an App Proxy request:",
      proxyErr instanceof Error ? proxyErr.message : proxyErr,
    );
  }

  // 2. Admin session (embedded admin iframe)
  try {
    const { admin } = await authenticate.admin(request);
    console.log("[api.upload-photo] Admin session auth OK");
    return admin;
  } catch (adminErr) {
    console.log(
      "[api.upload-photo] Admin auth failed:",
      adminErr instanceof Error ? adminErr.message : adminErr,
    );
  }

  // 3. Fallback: look up offline session by shop domain (direct Railway hit from storefront)
  const shop = extractShopDomain(request);
  if (shop) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      console.log("[api.upload-photo] Unauthenticated admin fallback OK for", shop);
      return admin;
    } catch (unauthedErr) {
      console.warn(
        "[api.upload-photo] Unauthenticated admin lookup failed for",
        shop,
        ":",
        unauthedErr instanceof Error ? unauthedErr.message : unauthedErr,
      );
    }
  } else {
    console.warn("[api.upload-photo] No shop domain found in request — cannot use unauthenticated fallback");
  }

  return null;
}

/**
 * Remix requires a `loader` for GET/HEAD to this route. Uploads use `action` (POST) only.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "HEAD") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  return jsonWithCors(
    {
      ok: true,
      message:
        "Photo upload API. Use POST with multipart/form-data (field name: file).",
    },
    { status: 200 },
  );
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== "POST") {
    return jsonWithCors({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    return await handleUploadPost(request);
  } catch (error) {
    console.error("[api.upload-photo]", error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    return jsonWithCors(
      {
        error: message,
        hint: "Check Railway logs. If the response was HTML, verify App Proxy URL and deploy.",
      },
      { status: 500 },
    );
  }
};

async function handleUploadPost(request: Request) {
  const admin = await getAdminClient(request);
  if (!admin) {
    return jsonWithCors(
      {
        error: "Unauthorized — no Shopify session found",
        hint:
          "Open the app once in Shopify Admin to create an offline session, then retry the upload from the storefront via the App Proxy URL (/apps/myskool/api/upload-photo).",
      },
      { status: 401 },
    );
  }

  const uploadHandler = unstable_createMemoryUploadHandler({
    maxPartSize: 20_000_000,
  });
  let formData;
  try {
    formData = await unstable_parseMultipartFormData(request, uploadHandler);
  } catch {
    return jsonWithCors({ error: "Invalid multipart body" }, { status: 400 });
  }

  const upload = formData.get("file");
  if (
    !upload ||
    typeof upload === "string" ||
    typeof upload.arrayBuffer !== "function"
  ) {
    return jsonWithCors({ error: "Missing file" }, { status: 400 });
  }

  const file = upload as File;
  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const filename = file.name || "upload.bin";

  const stagedRes = await admin.graphql(
    `#graphql
      mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters {
              name
              value
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        input: [
          {
            filename,
            mimeType,
            resource: "FILE",
            fileSize: String(buffer.byteLength),
          },
        ],
      },
    },
  );

  const stagedJson = (await stagedRes.json()) as {
    data?: {
      stagedUploadsCreate?: {
        stagedTargets?: Array<{
          url: string;
          resourceUrl: string;
          parameters: Array<{ name: string; value: string }>;
        }>;
        userErrors?: Array<{ message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  const stagedErrors =
    stagedJson.data?.stagedUploadsCreate?.userErrors?.filter(Boolean) ?? [];
  if (stagedErrors.length) {
    return jsonWithCors(
      { error: stagedErrors.map((e) => e.message).join("; ") },
      { status: 400 },
    );
  }

  const stagedTargets =
    stagedJson.data?.stagedUploadsCreate?.stagedTargets;
  const target = stagedTargets?.[0];
  if (!target?.url || !target.resourceUrl) {
    const gqlErr = stagedJson.errors?.map((e) => e.message).join("; ");
    return jsonWithCors(
      { error: gqlErr || "Staged upload failed" },
      { status: 400 },
    );
  }

  const uploadForm = new FormData();
  for (const parameter of target.parameters) {
    uploadForm.append(parameter.name, parameter.value);
  }
  uploadForm.append(
    "file",
    new Blob([buffer], { type: mimeType }),
    filename,
  );

  const uploadHttp = await fetch(target.url, {
    method: "POST",
    body: uploadForm,
  });

  if (!uploadHttp.ok) {
    const text = await uploadHttp.text();
    return jsonWithCors(
      {
        error: `Staged upload HTTP ${uploadHttp.status}`,
        detail: text.slice(0, 500),
      },
      { status: 502 },
    );
  }

  const createRes = await admin.graphql(
    `#graphql
      mutation fileCreate($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            __typename
            ... on MediaImage {
              id
              image {
                url
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }`,
    {
      variables: {
        files: [
          {
            originalSource: target.resourceUrl,
            contentType: "IMAGE",
          },
        ],
      },
    },
  );

  const createJson = (await createRes.json()) as {
    data?: {
      fileCreate?: {
        files?: Array<{
          id?: string;
          image?: { url?: string };
        }>;
        userErrors?: Array<{ message: string }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  const fileErrors =
    createJson.data?.fileCreate?.userErrors?.filter(Boolean) ?? [];
  if (fileErrors.length) {
    return jsonWithCors(
      { error: fileErrors.map((e) => e.message).join("; ") },
      { status: 400 },
    );
  }

  const created = createJson.data?.fileCreate?.files?.[0];
  const cdnUrl = created?.image?.url;
  const fileId = created?.id;
  if (!cdnUrl) {
    const gqlErr = createJson.errors?.map((e) => e.message).join("; ");
    return jsonWithCors(
      { error: gqlErr || "fileCreate did not return an image URL" },
      { status: 400 },
    );
  }

  return jsonWithCors({ cdnUrl, fileId }, { status: 200 });
}
