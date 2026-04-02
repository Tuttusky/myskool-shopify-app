import "@shopify/ui-extensions/preact";
import { render } from "preact";
import {
  useCartLineTarget,
  useTranslate,
} from "@shopify/ui-extensions/checkout/preact";

function normalizeFromAttributes(attrs) {
  var m = {};
  for (var i = 0; i < attrs.length; i++) {
    var a = attrs[i];
    if (a && a.key) m[a.key] = a.value || "";
  }
  return {
    photo: m.Photo || m._photo_url || "",
    name: m.Name || m._child_name || "",
    school: m.School || m._school || "",
    std: m.Standard || m._std || "",
    roll: m["Roll number"] || m._roll_no || "",
    theme: m.Theme || m._theme || "",
    productId: m["Product ID"] || "",
  };
}

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const line = useCartLineTarget();
  const translate = useTranslate();
  const n = normalizeFromAttributes(line.attributes || []);

  var hasAny =
    (n.photo && String(n.photo).trim()) ||
    (n.name && String(n.name).trim()) ||
    (n.school && String(n.school).trim()) ||
    (n.std && String(n.std).trim()) ||
    (n.roll && String(n.roll).trim()) ||
    (n.theme && String(n.theme).trim()) ||
    (n.productId && String(n.productId).trim());

  if (!hasAny) {
    return null;
  }

  var rows = [];

  if (n.photo && String(n.photo).trim() && String(n.photo).indexOf("http") === 0) {
    rows.push(
      <s-stack key="photo" gap="extraTight">
        <s-text type="small" color="subdued">
          {translate("photo")}
        </s-text>
        <s-image
          src={String(n.photo)}
          alt=""
          aspectRatio={1}
          objectFit="contain"
          loading="lazy"
          inlineSize={120}
        />
      </s-stack>,
    );
  }

  function textRow(key, label, val) {
    if (!val || !String(val).trim()) return;
    rows.push(
      <s-stack key={key} gap="extraTight">
        <s-text type="small" color="subdued">
          {label}
        </s-text>
        <s-text>{String(val)}</s-text>
      </s-stack>,
    );
  }

  textRow("name", translate("name"), n.name);
  textRow("school", translate("school"), n.school);
  textRow("std", translate("standard"), n.std);
  textRow("roll", translate("rollNumber"), n.roll);
  textRow("theme", translate("theme"), n.theme);
  textRow("pid", translate("productId"), n.productId);

  if (rows.length === 0) {
    return null;
  }

  return (
    <s-box padding="small" border="base" borderRadius="base" background="subdued">
      <s-stack gap="small">
        <s-text type="small" emphasis="bold">
          {translate("personalisationTitle")}
        </s-text>
        <s-stack gap="small">
          {rows}
        </s-stack>
      </s-stack>
    </s-box>
  );
}
