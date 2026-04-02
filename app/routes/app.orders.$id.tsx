import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Box,
  InlineStack,
  Thumbnail,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

type OrderLine = {
  name: string;
  quantity: number;
  customAttributes?: Array<{ key?: string | null; value?: string | null }>;
};

type OrderDetail = {
  id: string;
  name: string;
  createdAt: string;
  displayFulfillmentStatus: string;
  customer?: { displayName?: string | null; email?: string | null } | null;
  lineItems: { nodes: OrderLine[] };
};

function attrsToRecord(
  attrs: Array<{ key?: string | null; value?: string | null }>,
) {
  const m: Record<string, string> = {};
  for (const a of attrs) {
    if (a.key && a.value != null) m[a.key] = String(a.value);
  }
  return m;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const rawId = params.id ? decodeURIComponent(params.id) : "";
  const response = await admin.graphql(
    `#graphql
      query OrderOne($id: ID!) {
        order(id: $id) {
          id
          name
          createdAt
          displayFulfillmentStatus
          customer {
            displayName
            email
          }
          lineItems(first: 50) {
            nodes {
              name
              quantity
              customAttributes {
                key
                value
              }
            }
          }
        }
      }`,
    { variables: { id: rawId } },
  );

  const json = (await response.json()) as {
    data?: { order?: OrderDetail | null };
  };
  const order = json.data?.order;
  if (!order) {
    throw new Response("Order not found", { status: 404 });
  }
  return { order };
};

export default function AppOrderDetail() {
  const { order } = useLoaderData<typeof loader>();
  const lineItems = order.lineItems?.nodes;
  const personalised = (lineItems || []).filter((line) =>
    (line.customAttributes || []).some(
      (a) => a.key === "_child_name" && a.value && String(a.value).trim(),
    ),
  );

  return (
    <Page>
      <TitleBar title="Order details" />
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                {order.name}
              </Text>
              <Text as="p" variant="bodyMd">
                {order.createdAt
                  ? new Date(order.createdAt).toLocaleString()
                  : ""}
              </Text>
              <Text as="p" variant="bodyMd">
                Status: {order.displayFulfillmentStatus ?? ""}
              </Text>
              <Text as="p" variant="bodyMd">
                Customer: {order.customer?.displayName ?? "—"}
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Personalised line items
              </Text>
              {personalised.length === 0 ? (
                <Text as="p" tone="subdued">
                  No personalised items on this order.
                </Text>
              ) : (
                personalised.map((line, i) => {
                  const m = attrsToRecord(line.customAttributes || []);
                  return (
                    <Box
                      key={i}
                      padding="400"
                      background="bg-surface-secondary"
                      borderRadius="200"
                    >
                      <BlockStack gap="200">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          {line.name} × {line.quantity}
                        </Text>
                        <InlineStack gap="400" blockAlign="center">
                          {m._photo_url ? (
                            <Thumbnail
                              source={m._photo_url}
                              alt=""
                              size="small"
                            />
                          ) : null}
                          <BlockStack gap="100">
                            <Text as="p" variant="bodyMd">
                              Child: {m._child_name}
                            </Text>
                            <Text as="p" variant="bodyMd">
                              School: {m._school || "—"}
                            </Text>
                            <Text as="p" variant="bodyMd">
                              Std: {m._std || "—"} · Roll: {m._roll_no || "—"}
                            </Text>
                            <Text as="p" variant="bodyMd">
                              Theme: {m._theme || "—"}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                      </BlockStack>
                    </Box>
                  );
                })
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
