import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  LegacyCard,
  IndexTable,
  Text,
  Thumbnail,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

type LineItemNode = {
  customAttributes?: Array<{ key?: string | null; value?: string | null }>;
};

type OrderNode = {
  id: string;
  name: string;
  createdAt: string;
  displayFulfillmentStatus: string;
  customer?: { displayName?: string | null } | null;
  lineItems: { nodes: LineItemNode[] };
};

function attrMap(
  attrs: Array<{ key?: string | null; value?: string | null }>,
) {
  const m: Record<string, string> = {};
  for (const a of attrs) {
    if (a.key && a.value != null) m[a.key] = String(a.value);
  }
  return m;
}

function firstPersonalisedLine(order: OrderNode) {
  for (const line of order.lineItems.nodes) {
    const m = attrMap(line.customAttributes || []);
    if (m._child_name && m._child_name.trim()) return line;
  }
  return null;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const response = await admin.graphql(
    `#graphql
      query PersonalisedOrders {
        orders(first: 50, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            name
            createdAt
            displayFulfillmentStatus
            customer {
              displayName
            }
            lineItems(first: 50) {
              nodes {
                customAttributes {
                  key
                  value
                }
              }
            }
          }
        }
      }`,
  );

  const json = (await response.json()) as {
    data?: { orders?: { nodes?: OrderNode[] } };
  };
  const nodes = json.data?.orders?.nodes ?? [];
  const filtered = nodes.filter((o) => firstPersonalisedLine(o) !== null);
  const rows = filtered.map((order) => {
    const line = firstPersonalisedLine(order)!;
    const m = attrMap(line.customAttributes || []);
    return {
      id: order.id,
      orderName: order.name,
      createdAt: order.createdAt,
      customer: order.customer?.displayName ?? "—",
      childName: m._child_name ?? "",
      theme: m._theme ?? "—",
      photoUrl: m._photo_url ?? "",
      status: order.displayFulfillmentStatus,
    };
  });

  return { rows };
};

export default function AppOrders() {
  const { rows } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page>
      <TitleBar title="Personalised orders" />
      <Layout>
        <Layout.Section>
          <LegacyCard>
            <IndexTable
              resourceName={{ singular: "order", plural: "orders" }}
              itemCount={rows.length}
              headings={[
                { title: "Order" },
                { title: "Date" },
                { title: "Customer" },
                { title: "Child name" },
                { title: "Theme" },
                { title: "Photo" },
                { title: "Status" },
              ]}
              selectable={false}
            >
              {rows.map((row, index) => (
                <IndexTable.Row
                  id={row.id}
                  key={row.id}
                  position={index}
                  onClick={() =>
                    navigate(`/app/orders/${encodeURIComponent(row.id)}`)
                  }
                >
                  <IndexTable.Cell>
                    <Text variant="bodyMd" fontWeight="bold" as="span">
                      {row.orderName}
                    </Text>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {new Date(row.createdAt).toLocaleString()}
                  </IndexTable.Cell>
                  <IndexTable.Cell>{row.customer}</IndexTable.Cell>
                  <IndexTable.Cell>{row.childName}</IndexTable.Cell>
                  <IndexTable.Cell>{row.theme}</IndexTable.Cell>
                  <IndexTable.Cell>
                    {row.photoUrl ? (
                      <Thumbnail source={row.photoUrl} alt="" size="small" />
                    ) : (
                      <Text as="span" tone="subdued">
                        —
                      </Text>
                    )}
                  </IndexTable.Cell>
                  <IndexTable.Cell>{row.status}</IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </LegacyCard>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
