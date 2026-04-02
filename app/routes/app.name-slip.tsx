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
  Select,
  FormLayout,
  Divider,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { useState, useCallback, useEffect } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// ─── Types ──────────────────────────────────────────────────────────────────

type CustomizerShape = {
  accentColor: string;
  primaryColor: string;
  fontSize: string;
  showSchool: boolean;
  showStandard: boolean;
  defaultTheme: string;
  buttonLabel: string;
};

const THEMES = [
  { value: "animal", label: "🐼 Animal" },
  { value: "dino", label: "🦖 Dino" },
  { value: "jungle", label: "🌿 Jungle" },
  { value: "kinder", label: "🎨 Kinder" },
  { value: "mermaid", label: "🧜 Mermaid" },
  { value: "sea", label: "🐙 Sea" },
];

const THEME_EMOJI: Record<string, string> = {
  animal: "🐼",
  dino: "🦖",
  jungle: "🌿",
  kinder: "🎨",
  mermaid: "🧜",
  sea: "🐙",
};

const defaultCustomizer: CustomizerShape = {
  accentColor: "#7c3aed",
  primaryColor: "#111827",
  fontSize: "16",
  showSchool: true,
  showStandard: true,
  defaultTheme: "animal",
  buttonLabel: "Personalise This",
};

function parseCustomizer(raw: unknown): CustomizerShape {
  if (!raw || typeof raw !== "object") return { ...defaultCustomizer };
  const o = raw as Record<string, unknown>;
  return {
    accentColor:
      typeof o.accentColor === "string" && o.accentColor
        ? o.accentColor
        : defaultCustomizer.accentColor,
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
    showStandard:
      typeof o.showStandard === "boolean"
        ? o.showStandard
        : defaultCustomizer.showStandard,
    defaultTheme:
      typeof o.defaultTheme === "string" && o.defaultTheme
        ? o.defaultTheme
        : defaultCustomizer.defaultTheme,
    buttonLabel:
      typeof o.buttonLabel === "string" && o.buttonLabel
        ? o.buttonLabel
        : defaultCustomizer.buttonLabel,
  };
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const row = await prisma.nameSlipTemplate.findUnique({ where: { shop } });

  return json({
    template: row
      ? { name: row.name, customizer: parseCustomizer(row.customizer) }
      : null,
  });
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const fd = await request.formData();
  const name = String(fd.get("name") ?? "").trim();
  if (!name) {
    return json(
      { ok: false as const, error: "Template name is required." },
      { status: 400 },
    );
  }

  const customizer: CustomizerShape = {
    accentColor:
      String(fd.get("accentColor") ?? defaultCustomizer.accentColor).trim() ||
      defaultCustomizer.accentColor,
    primaryColor:
      String(fd.get("primaryColor") ?? defaultCustomizer.primaryColor).trim() ||
      defaultCustomizer.primaryColor,
    fontSize:
      String(fd.get("fontSize") ?? defaultCustomizer.fontSize).trim() ||
      defaultCustomizer.fontSize,
    showSchool: fd.get("showSchool") === "true",
    showStandard: fd.get("showStandard") === "true",
    defaultTheme:
      String(fd.get("defaultTheme") ?? defaultCustomizer.defaultTheme).trim() ||
      defaultCustomizer.defaultTheme,
    buttonLabel:
      String(fd.get("buttonLabel") ?? defaultCustomizer.buttonLabel).trim() ||
      defaultCustomizer.buttonLabel,
  };

  await prisma.nameSlipTemplate.upsert({
    where: { shop },
    create: { shop, name, customizer },
    update: { name, customizer },
  });

  return json({ ok: true as const, error: null as string | null });
};

// ─── Component ───────────────────────────────────────────────────────────────

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 18,
        height: 18,
        borderRadius: 4,
        background: color,
        border: "1px solid #e5e7eb",
        verticalAlign: "middle",
        marginLeft: 6,
        flexShrink: 0,
      }}
    />
  );
}

function PreviewCard({
  templateName,
  customizer,
}: {
  templateName: string;
  customizer: CustomizerShape;
}) {
  const fsNum = Math.max(10, Math.min(30, parseInt(customizer.fontSize, 10) || 16));

  return (
    <div
      style={{
        borderRadius: 16,
        border: "1.5px solid #e5e7eb",
        overflow: "hidden",
        background: "#fff",
        boxShadow: "0 4px 16px rgba(0,0,0,0.07)",
      }}
    >
      {/* header strip */}
      <div
        style={{
          background: customizer.accentColor,
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>
          {templateName || "My Name Slip"}
        </span>
        <span style={{ fontSize: 20 }}>
          {THEME_EMOJI[customizer.defaultTheme] ?? "🐼"}
        </span>
      </div>

      {/* card body */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 14px 10px",
        }}
      >
        {/* photo placeholder */}
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: "50%",
            background: "#f3f4f6",
            border: "2px solid #e5e7eb",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width="30"
            height="30"
            viewBox="0 0 30 30"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="15" cy="12" r="6" fill="#d1d5db" />
            <ellipse cx="15" cy="27" rx="11" ry="6" fill="#d1d5db" />
          </svg>
        </div>

        {/* text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: fsNum,
              color: customizer.primaryColor,
              letterSpacing: 1,
              textTransform: "uppercase",
              lineHeight: 1.2,
              marginBottom: 4,
            }}
          >
            CHILD NAME
          </div>
          {customizer.showSchool && (
            <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
              School Name
            </div>
          )}
          {customizer.showStandard && (
            <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>
              Std 5 · Roll 12
            </div>
          )}
        </div>
      </div>

      {/* button preview */}
      <div style={{ padding: "0 14px 14px" }}>
        <div
          style={{
            background: customizer.accentColor,
            color: "#fff",
            borderRadius: 8,
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {customizer.buttonLabel || "Personalise This"}
        </div>
      </div>
    </div>
  );
}

export default function NameSlipTemplatePage() {
  const { template } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const c = template?.customizer ?? defaultCustomizer;

  const [name, setName] = useState(template?.name ?? "");
  const [accentColor, setAccentColor] = useState(c.accentColor);
  const [primaryColor, setPrimaryColor] = useState(c.primaryColor);
  const [fontSize, setFontSize] = useState(c.fontSize);
  const [showSchool, setShowSchool] = useState(c.showSchool);
  const [showStandard, setShowStandard] = useState(c.showStandard);
  const [defaultTheme, setDefaultTheme] = useState(c.defaultTheme);
  const [buttonLabel, setButtonLabel] = useState(c.buttonLabel);

  useEffect(() => {
    if (!template) return;
    const next = template.customizer;
    setName(template.name);
    setAccentColor(next.accentColor);
    setPrimaryColor(next.primaryColor);
    setFontSize(next.fontSize);
    setShowSchool(next.showSchool);
    setShowStandard(next.showStandard);
    setDefaultTheme(next.defaultTheme);
    setButtonLabel(next.buttonLabel);
  }, [template]);

  const handleShowSchool = useCallback((v: boolean) => setShowSchool(v), []);
  const handleShowStandard = useCallback((v: boolean) => setShowStandard(v), []);

  const liveCustomizer: CustomizerShape = {
    accentColor,
    primaryColor,
    fontSize,
    showSchool,
    showStandard,
    defaultTheme,
    buttonLabel,
  };

  return (
    <Page>
      <TitleBar title="Name slip template" />

      {actionData?.ok && (
        <Box paddingBlockEnd="400">
          <Banner tone="success" title="Saved">
            Template and customizer settings saved.
          </Banner>
        </Box>
      )}
      {actionData && "error" in actionData && actionData.error && (
        <Box paddingBlockEnd="400">
          <Banner tone="critical" title="Could not save">
            {actionData.error}
          </Banner>
        </Box>
      )}

      <Form method="post">
        {/* hidden booleans so unchecked checkboxes still submit */}
        <input type="hidden" name="showSchool" value={showSchool ? "true" : "false"} />
        <input type="hidden" name="showStandard" value={showStandard ? "true" : "false"} />

        <Layout>
          {/* ── Left column ─────────────────────────────────────── */}
          <Layout.Section>
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Template
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    One template per shop. This name is used to label the configuration in
                    the admin.
                  </Text>
                  <TextField
                    label="Template name"
                    name="name"
                    value={name}
                    onChange={setName}
                    autoComplete="off"
                    requiredIndicator
                    placeholder="e.g. My Skool Name Slip 2025"
                  />
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Customizer
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    These settings control how the storefront widget looks. The live preview
                    updates as you type.
                  </Text>

                  <Divider />

                  <Text as="h3" variant="headingSm">
                    Button & button label
                  </Text>
                  <FormLayout>
                    <FormLayout.Group>
                      <TextField
                        label="Button label"
                        name="buttonLabel"
                        value={buttonLabel}
                        onChange={setButtonLabel}
                        autoComplete="off"
                        placeholder="Personalise This"
                      />
                      <div>
                        <Text as="span" variant="bodyMd">
                          Accent color (button / header)
                        </Text>
                        <InlineStack gap="200" blockAlign="center">
                          <TextField
                            label=""
                            labelHidden
                            name="accentColor"
                            value={accentColor}
                            onChange={setAccentColor}
                            autoComplete="off"
                            placeholder="#7c3aed"
                          />
                          <ColorSwatch color={accentColor} />
                        </InlineStack>
                      </div>
                    </FormLayout.Group>
                  </FormLayout>

                  <Divider />

                  <Text as="h3" variant="headingSm">
                    Typography
                  </Text>
                  <FormLayout>
                    <FormLayout.Group>
                      <div>
                        <Text as="span" variant="bodyMd">
                          Primary text color
                        </Text>
                        <InlineStack gap="200" blockAlign="center">
                          <TextField
                            label=""
                            labelHidden
                            name="primaryColor"
                            value={primaryColor}
                            onChange={setPrimaryColor}
                            autoComplete="off"
                            placeholder="#111827"
                          />
                          <ColorSwatch color={primaryColor} />
                        </InlineStack>
                      </div>
                      <TextField
                        label="Base font size (px)"
                        name="fontSize"
                        value={fontSize}
                        onChange={setFontSize}
                        autoComplete="off"
                        placeholder="16"
                        type="number"
                        min="10"
                        max="30"
                      />
                    </FormLayout.Group>
                  </FormLayout>

                  <Divider />

                  <Text as="h3" variant="headingSm">
                    Default theme
                  </Text>
                  <Select
                    label="Default theme chip"
                    name="defaultTheme"
                    options={THEMES}
                    value={defaultTheme}
                    onChange={setDefaultTheme}
                  />

                  <Divider />

                  <Text as="h3" variant="headingSm">
                    Visible fields
                  </Text>
                  <BlockStack gap="200">
                    <Checkbox
                      label="Show school field on slip"
                      checked={showSchool}
                      onChange={handleShowSchool}
                    />
                    <Checkbox
                      label="Show standard & roll number"
                      checked={showStandard}
                      onChange={handleShowStandard}
                    />
                  </BlockStack>
                </BlockStack>
              </Card>

              <Button variant="primary" submit>
                Save template
              </Button>
            </BlockStack>
          </Layout.Section>

          {/* ── Right column: live preview ───────────────────────── */}
          <Layout.Section variant="oneThird">
            <div style={{ position: "sticky", top: 64 }}>
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Live preview
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Updates as you change settings — no need to save first.
                  </Text>
                  <PreviewCard
                    templateName={name}
                    customizer={liveCustomizer}
                  />
                </BlockStack>
              </Card>
            </div>
          </Layout.Section>
        </Layout>
      </Form>
    </Page>
  );
}
