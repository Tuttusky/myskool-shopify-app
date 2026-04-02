# Myskool checkout line item

Renders **Personalisation** (photo + form fields) on:

- Checkout order summary (`purchase.checkout.cart-line-item.render-after`)
- Thank you / order status line items (`purchase.thank-you.cart-line-item.render-after`)

Uses the same line item property keys as the storefront widget (`Photo`, `Name`, `School`, …) and legacy `_photo_url` / `_child_name` keys.

## Merchant setup

1. Deploy the app (`shopify app deploy`).
2. In **Shopify Admin** → **Settings** → **Checkout** → **Customize** (or **Checkout editor**), add the app block **myskool-checkout-line** to the checkout experience so it appears on each line item.
