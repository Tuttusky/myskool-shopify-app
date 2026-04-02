/**
 * Storefront cart uses visible property keys (Photo, Name, …).
 * Older line items may still use _photo_url, _child_name, etc.
 */
export function normalisedLineProps(m: Record<string, string>) {
  return {
    childName: m.Name || m._child_name || "",
    photoUrl: m.Photo || m._photo_url || "",
    school: m.School || m._school || "",
    std: m.Standard || m._std || "",
    rollNo: m["Roll number"] || m._roll_no || "",
    theme: m.Theme || m._theme || "",
    productId: m["Product ID"] || "",
  };
}

export function isPersonalisedAttrs(m: Record<string, string>) {
  return Boolean((m.Name || m._child_name || "").trim());
}
