# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: checkout.spec.ts >> Checkout with card
- Location: tests/.generated/1792653822539/checkout.spec.ts:7:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('size M').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText('size M').first() with timeout 5000ms
  - waiting for getByText('size M').first()

```

```yaml
- banner:
  - link "ZooShop":
    - /url: /products
    - strong: ZooShop
  - link "Products":
    - /url: /products
  - link "Cart (1)":
    - /url: /cart
  - link "Orders":
    - /url: /orders
  - link "Sign in":
    - /url: /login
  - search:
    - text: Search
    - searchbox "Search"
    - button "Go"
- main:
  - heading "Your cart" [level=1]
  - paragraph: Cart shows 1 item
  - text: Blue T-shirt (size L) - $49.00 Quantity for Blue T-shirt
  - spinbutton "Quantity for Blue T-shirt": "1"
  - button "Remove Blue T-shirt"
  - text: Coupon code
  - textbox "Coupon code"
  - button "Apply coupon"
  - status
  - paragraph:
    - strong: "Total: $49.00"
  - link "Checkout":
    - /url: /checkout
- contentinfo:
  - link "Returns policy":
    - /url: /returns
  - link "All products":
    - /url: /products
```

# Test source

```ts
  1  | // NightQA: "Checkout with card" (run 01M5H7X0P4RKQTETCV6QC6VADQ)
  2  | // Plain Playwright test. Edit it freely and run it with: NIGHTQA_BASE_URL=<staging> npx playwright test
  3  | import { test, expect } from '@playwright/test';
  4  | 
  5  | test.use({ baseURL: process.env.NIGHTQA_BASE_URL });
  6  | 
  7  | test("Checkout with card", async ({ page }) => {
  8  |   await page.goto("/products");
  9  | 
  10 |   // Step 1: Open the Blue T-shirt, choose size M and add it to the cart
  11 |   await page.getByRole("link", { name: "Blue T-shirt", exact: true }).click();
  12 |   await page.getByRole("combobox", { name: "Size", exact: true }).selectOption({ label: "M" });
  13 |   await page.getByRole("button", { name: "Add to cart", exact: true }).click();
  14 |   await expect(page.getByText("Added Blue T-shirt to the cart").first()).toBeVisible();
  15 | 
  16 |   // Step 2: Open the cart
  17 |   await page.goto("/cart");
  18 |   await expect(page.getByText("Cart shows 1 item").first()).toBeVisible();
> 19 |   await expect(page.getByText("size M").first()).toBeVisible();
     |                                                  ^ Error: expect(locator).toBeVisible() failed
  20 |   await expect(page.getByText("Total: $49.00").first()).toBeVisible();
  21 | 
  22 |   // Step 3: Go to checkout and pay with the test card 4242 4242 4242 4242, expiry 12/30, CVC 123
  23 |   await page.getByRole("link", { name: "Checkout", exact: true }).click();
  24 |   await page.getByRole("textbox", { name: "Card number", exact: true }).fill("4242 4242 4242 4242");
  25 |   await page.getByRole("textbox", { name: "Expiry (MM/YY)", exact: true }).fill("12/30");
  26 |   await page.getByRole("textbox", { name: "CVC", exact: true }).fill("123");
  27 |   await page.getByRole("button", { name: "Pay now", exact: true }).click();
  28 |   await expect(page.getByText("Your order number is ORD-").first()).toBeVisible();
  29 | });
  30 | 
```