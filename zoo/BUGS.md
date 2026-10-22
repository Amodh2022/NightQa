# Bug zoo answer key

ZooShop is a tiny demo shop (products, cart, coupons, checkout, search, orders) with **10 deliberately seeded bugs**.
It is NightQA's test bench: the eval harness runs flows against it and measures precision and recall.

```
pnpm zoo                    # all 10 bugs on, http://127.0.0.1:4010
ZOO_BUGS=none pnpm zoo      # clean baseline: any bug reported here is a false alarm
ZOO_BUGS=B01,B04 pnpm zoo   # just those bugs
```

Test account (never put these in flow files): `ZOO_TEST_USER` / `ZOO_TEST_PASSWORD`, defaults `test-buyer@example.com` / `zoo-pass`.
Test cards: `4242 4242 4242 4242` succeeds, `4000 0000 0000 0002` is declined.
Coupons: `SAVE10` is valid (10% off). `EXPIRED50` is expired and must be rejected.

| ID  | Severity | Bug                                                     | Where             | Steps to trigger                                      | Expected                        | Actual (bug on)                           | How NightQA should notice |
| --- | -------- | ------------------------------------------------------- | ----------------- | ----------------------------------------------------- | ------------------------------- | ----------------------------------------- | ------------------------- |
| B01 | high     | Expired coupon is accepted at checkout                  | `/cart`           | Add any item, apply `EXPIRED50`                       | "Coupon EXPIRED50 has expired"  | "Coupon applied: 50% off", total drops    | Expectation failed        |
| B02 | high     | Cart total ignores quantity                             | `/cart`           | Add Blue T-shirt, set quantity to 2                   | Total $98.00                    | Total stays $49.00                        | Expectation failed        |
| B03 | low      | Add to wishlist throws an uncaught error                | `/product/tshirt` | Click "Add to wishlist"                               | "Saved to wishlist"             | Nothing shown, TypeError in console       | Uncaught JS error         |
| B04 | high     | Search with an ampersand returns a server error         | `/search`         | Search for `a & b`                                    | "0 results" (no error)          | "Something went wrong", `/api/search` 500 | HTTP 5xx                  |
| B05 | medium   | Returns policy link leads to page not found             | footer            | Click "Returns policy"                                | Returns policy page             | "Page not found" (404)                    | Dead in-app link          |
| B06 | medium   | Order history page is blank                             | `/orders`         | Click "Orders"                                        | "Order history" heading         | Empty page                                | Blank page                |
| B07 | medium   | Product reviews spinner never ends                      | `/product/tshirt` | Open a product page, wait                             | Reviews appear                  | "Loading reviews..." forever              | Endless spinner           |
| B08 | high     | Chosen size is ignored: cart gets size L                | `/product/tshirt` | Choose size M, click "Add to cart", open cart         | "Blue T-shirt (size M)"         | "Blue T-shirt (size L)"                   | Expectation failed        |
| B09 | critical | Pay button stays disabled for a card number with spaces | `/checkout`       | Type `4242 4242 4242 4242`, expiry `12/30`, CVC `123` | "Pay now" becomes enabled       | Stays disabled, payment impossible        | Expectation failed        |
| B10 | high     | Confirmation shows order number "undefined"             | `/confirmation`   | Pay with `4242424242424242`                           | "Your order number is ORD-1001" | "Your order number is undefined"          | Expectation failed        |

Keep `zoo/bugs.ts` (the machine-readable catalog) and this table in sync.
