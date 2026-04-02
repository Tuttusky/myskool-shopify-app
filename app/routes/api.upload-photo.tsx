import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import {
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";
import { authenticate } from "../shopify.server";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonWithCors(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  const c = corsHeaders();
  Object.entries(c).forEach(([k, v]) => headers.set(k, String(v)));
  return Response.json(data, { ...init, headers });
}

async function getAdminClient(request: Request) {
  try {
    const proxy = await authenticate.public.appProxy(request);
    if (proxy.admin) {
      return proxy.admin;
    }
  } catch {
    // fall through to session auth
  }
  const { admin } = await authenticate.admin(request);
  return admin;
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

  let admin;
  try {
    admin = await getAdminClient(request);
  } catch (error) {
    if (error instanceof Response) {
      return jsonWithCors({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
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
};
