import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Checkbox,
  Banner,
  Box,
  Button,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

type CustomizerShape = {
  primaryColor: string;
  fontSize: string;
  showSchool: boolean;
};

const defaultCustomizer: CustomizerShape = {
  primaryColor: "#111827",
  fontSize: "16",
  showSchool: true,
};

function parseCustomizer(raw: unknown): CustomizerShape {
  if (!raw || typeof raw !== "object") return { ...defaultCustomizer };
  const o = raw as Record<string, unknown>;
  return {
    primaryColor:
      typeof o.primaryColor === "string" && o.primaryColor
        ? o.primaryColor
        : defaultCustomizer.primaryColor,
    fontSize:
      typeof o.fontSize === "string" && o.fontSize
        ? o.fontSize
        : defaultCustomizer.fontSize,
    showSchool:
      typeof o.showSchool === "boolean" ? o.showSchool : defaultCustomizer.showSchool,
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const row = await prisma.nameSlipTemplate.findUnique({
    where: { shop },
  });

  return json({
    template: row
      ? {
          name: row.name,
          customizer: parseCustomizer(row.customizer),
        }
      : null,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) {
    return json({ ok: false as const, error: "Template name is required." }, { status: 400 });
  }

  const customizer: CustomizerShape = {
    primaryColor: String(formData.get("primaryColor") ?? defaultCustomizer.primaryColor).trim() || defaultCustomizer.primaryColor,
    fontSize: String(formData.get("fontSize") ?? defaultCustomizer.fontSize).trim() || defaultCustomizer.fontSize,
    showSchool: formData.get("showSchool") === "true",
  };

  await prisma.nameSlipTemplate.upsert({
    where: { shop },
    create: {
      shop,
      name,
      customizer,
    },
    update: {
      name,
      customizer,
    },
  });

  return json({ ok: true as const, error: null as string | null });
};

export default function NameSlipTemplatePage() {
  const { template } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const initialName = template?.name ?? "";
  const c = template?.customizer ?? defaultCustomizer;

  const [name, setName] = useState(initialName);
  const [primaryColor, setPrimaryColor] = useState(c.primaryColor);
  const [fontSize, setFontSize] = useState(c.fontSize);
  const [showSchool, setShowSchool] = useState(c.showSchool);

  const handleShowSchool = useCallback((checked: boolean) => setShowSchool(checked), []);

  useEffect(() => {
    if (!template) return;
    setName(template.name);
    const next = template.customizer;
    setPrimaryColor(next.primaryColor);
    setFontSize(next.fontSize);
    setShowSchool(next.showSchool);
  }, [template]);

  return (
    <Page>
      <TitleBar title="Name slip template" />
      <Layout>
        <Layout.Section>
          {actionData?.ok ? (
            <Box paddingBlockEnd="400">
              <Banner tone="success" title="Saved">
                Your name slip template and customizer settings were saved.
              </Banner>
            </Box>
          ) : null}
          {actionData && "error" in actionData && actionData.error ? (
            <Box paddingBlockEnd="400">
              <Banner tone="critical" title="Could not save">
                {actionData.error}
              </Banner>
            </Box>
          ) : null}

          <Form method="post">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Template
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    One template per shop. Used to label this configuration in the admin.
                  </Text>
                  <TextField
                    label="Template name"
                    name="name"
                    value={name}
                    onChange={setName}
                    autoComplete="off"
                    requiredIndicator
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Name slip customizer
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Preview settings for the storefront name slip (stored as JSON; you can extend
                    this later).
                  </Text>
                  <TextField
                    label="Primary text color"
                    name="primaryColor"
                    type="text"
                    value={primaryColor}
                    onChange={setPrimaryColor}
                    autoComplete="off"
                    helpText="CSS color, e.g. #111827"
                  />
                  <TextField
                    label="Base font size (px)"
                    name="fontSize"
                    type="text"
                    value={fontSize}
                    onChange={setFontSize}
                    autoComplete="off"
                  />
                  <input type="hidden" name="showSchool" value={showSchool ? "true" : "false"} />
                  <Checkbox
                    label="Show school on slip"
                    checked={showSchool}
                    onChange={(newVal) => {
                      handleShowSchool(newVal);
                    }}
                  />
                </BlockStack>
              </Card>

              <Button variant="primary" submit>
                Save
              </Button>
            </BlockStack>
          </Form>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
