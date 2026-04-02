import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { apiVersion } from "../shopify.server";

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

/**
 * Lightweight GraphQL client that uses a raw Admin API access token.
 * No sessions or database needed — just the token + shop domain.
 */
function createTokenAdmin(shop: string, token: string) {
  const endpoint = `https://${shop}/admin/api/${apiVersion}/graphql.json`;
  return {
    graphql: async (query: string, options?: { variables?: Record<string, unknown> }) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({ query, variables: options?.variables }),
      });
      return {
        json: () => res.json(),
      };
    },
  };
}

type AdminClient = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<{ json: () => Promise<unknown> }>;
};

function extractShopDomain(request: Request): string | null {
  const url = new URL(request.url);
  const fromParam = url.searchParams.get("shop");
  if (fromParam) return fromParam;
  const referer =
    request.headers.get("referer") || request.headers.get("origin") || "";
  const match = referer.match(/([a-z0-9-]+\.myshopify\.com)/i);
  return match ? match[1] : null;
}

async function getAdminClient(request: Request): Promise<AdminClient | null> {
  // 1. App Proxy auth
  try {
    const proxy = await authenticate.public.appProxy(request);
    if (proxy.admin) {
      console.log("[upload] Auth via App Proxy OK");
      return proxy.admin as unknown as AdminClient;
    }
  } catch {
    // not a proxy request
  }

  // 2. Admin session (embedded iframe)
  try {
    const { admin } = await authenticate.admin(request);
    console.log("[upload] Auth via admin session OK");
    return admin as unknown as AdminClient;
  } catch {
    // no admin session
  }

  // 3. Env-var token (no DB needed)
  const token = process.env.SHOPIFY_ADMIN_API_TOKEN?.trim();
  const envShop = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const shop = extractShopDomain(request) || envShop;

  if (token && shop) {
    console.log("[upload] Auth via SHOPIFY_ADMIN_API_TOKEN for", shop);
    return createTokenAdmin(shop, token);
  }

  console.warn(
    "[upload] All auth methods failed. Set SHOPIFY_ADMIN_API_TOKEN + SHOPIFY_STORE_DOMAIN on Railway.",
  );
  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "HEAD") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  return jsonWithCors(
    {
      ok: true,
      message:
        "Photo upload API. POST multipart/form-data with field name 'file'.",
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
    console.error("[upload]", error);
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    return jsonWithCors(
      { error: message, hint: "Check Railway logs." },
      { status: 500 },
    );
  }
};

async function handleUploadPost(request: Request) {
  const admin = await getAdminClient(request);
  if (!admin) {
    return jsonWithCors(
      {
        error: "Unauthorized",
        hint:
          "Set SHOPIFY_ADMIN_API_TOKEN and SHOPIFY_STORE_DOMAIN as environment variables on Railway.",
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

  // Stage the upload — resource must be IMAGE for photos
  const stagedRes = await admin.graphql(
    `mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: [
          {
            filename,
            mimeType,
            resource: "IMAGE",
            httpMethod: "POST",
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

  const target = stagedJson.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!target?.url || !target.resourceUrl) {
    const gqlErr = stagedJson.errors?.map((e) => e.message).join("; ");
    return jsonWithCors(
      { error: gqlErr || "Staged upload failed" },
      { status: 400 },
    );
  }

  // Upload file bytes to the staged target
  let uploadHttp: Response;
  const params = target.parameters ?? [];

  if (params.length > 0) {
    // POST with multipart form data (S3-style) — params first, file last
    const uploadForm = new FormData();
    for (const p of params) {
      uploadForm.append(p.name, p.value);
    }
    uploadForm.append("file", new Blob([buffer], { type: mimeType }), filename);
    uploadHttp = await fetch(target.url, { method: "POST", body: uploadForm });
  } else {
    // PUT with raw body (GCS-style signed URL)
    uploadHttp = await fetch(target.url, {
      method: "PUT",
      headers: { "Content-Type": mimeType },
      body: buffer,
    });
  }

  if (!uploadHttp.ok) {
    const text = await uploadHttp.text();
    console.error(
      "[upload] Staged upload failed:",
      uploadHttp.status,
      target.url.slice(0, 80),
      text.slice(0, 300),
    );
    return jsonWithCors(
      {
        error: `Staged upload HTTP ${uploadHttp.status}`,
        detail: text.slice(0, 500),
      },
      { status: 502 },
    );
  }

  // Create the file in Shopify
  const createRes = await admin.graphql(
    `mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          __typename
          ... on MediaImage { id image { url } }
        }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        files: [{ originalSource: target.resourceUrl, contentType: "IMAGE" }],
      },
    },
  );

  const createJson = (await createRes.json()) as {
    data?: {
      fileCreate?: {
        files?: Array<{ id?: string; image?: { url?: string } }>;
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
