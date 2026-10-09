# @aureahub/pay

Official SDK for the [Aurea Pay](https://pay.aureahub.com) Partner API — accept
SEPA bank transfers and card payments on any custom e-commerce, with
settlement to your existing Aurea wallet.

- **Server SDK** for Node.js (`@aureahub/pay`) — create checkout sessions,
  execute refunds, manage webhook endpoints, verify signatures.
- **Browser drop-in** (`@aureahub/pay/browser`) — redirect the current
  window to the Aurea-hosted checkout. No PCI scope on your side.
- **React component** (`@aureahub/pay/react`) — one-line `<AureaCheckoutButton>`.

> **Heads-up — `0.2.0-beta.1` is a correctness-first release.** Amounts
> must be integer minor units (cents); the SDK now throws synchronously
> if you pass a float. Default timeout dropped to 10s. Webhook errors
> changed to a generic external message with a machine-readable `code`
> field. Full list in [CHANGELOG.md](./CHANGELOG.md).

> **Hackathon snapshot.** This repository is a read-only copy of the SDK
> source for hackathon participants. Install the published package from npm
> (`npm install @aureahub/pay`) and use **test-mode keys only** (`sk_test_…`)
> issued by the organisers. Releases are not published from this repository.

## Install

```bash
npm install @aureahub/pay
# or: pnpm add @aureahub/pay / yarn add @aureahub/pay
```

Requires Node.js 18+ (uses the global `fetch`).

## Quick start

### 1. Generate an API key

From your Aurea Pay dashboard → **Settings → Developers → API Keys**,
create a `sk_test_…` key for development or `sk_live_…` for production.
The plaintext is shown once. Store it as `AUREA_SECRET` in your env.

### 2. Create a checkout session on your server

```ts
import { Aurea } from '@aureahub/pay'

const aurea = new Aurea({ apiKey: process.env.AUREA_SECRET! })

export async function createOrder(req) {
  const order = await db.orders.create({ total: 4999, /* ... */ })

  const session = await aurea.checkout.sessions.create({
    amount:    order.total,                          // integer minor units (cents) — 4999 = €49.99
    currency:  'EUR',
    success_url: `https://yourshop.com/thanks?session={CHECKOUT_SESSION_ID}`,
    cancel_url:  `https://yourshop.com/cart`,
    external_reference: order.id,
    customer_email:     order.email,
    payment_methods:    ['sepa', 'card'],            // optional; narrowed to your account cap
    metadata:           { orderId: order.id },
  }, { idempotencyKey: `order-${order.id}` })

  return { sessionId: session.id, url: session.url }
}
```

### Render only the methods you accept

Each merchant account has a **Payment methods** toggle (SEPA, card, or both).
Before rendering an "Aurea Pay" row on your checkout page, read the current
setting so you don't advertise SEPA when the merchant has it disabled:

```ts
const account = await aurea.account.retrieve()

// What buyers will actually see on the hosted page:
account.capabilities.sepa            // boolean — rail ready AND cap allows
account.capabilities.card            // boolean — rail ready AND cap allows

// Raw account-level cap (independent of rail readiness):
account.enabled_payment_methods      // e.g. ['card']
```

If a caller passes `payment_methods: ['sepa']` to `sessions.create` when SEPA
is disabled at the account level, the server throws an
`AureaInvalidRequestError` with `code === 'payment_methods_not_available'`.

### 3. Redirect your buyer to the hosted checkout

Server-side redirect (simplest):

```ts
res.redirect(303, session.url)
```

Or, from your frontend:

```ts
import { openCheckout } from '@aureahub/pay/browser'
openCheckout({ sessionId })
```

Or as a React button:

```tsx
import { AureaCheckoutButton } from '@aureahub/pay/react'

// Visual identity (logo + "Aurea Pay" wordmark) is baked in — only the
// prefix label and theme are customisable (children prop removed in 0.1.0-beta.2).
<AureaCheckoutButton sessionId={sessionId} />

// Prefix options (default "Pay with"):
<AureaCheckoutButton sessionId={sessionId} label="Continue with" />
<AureaCheckoutButton sessionId={sessionId} label="Checkout with" />

// Light theme for dark backgrounds:
<AureaCheckoutButton sessionId={sessionId} theme="light" />
```

The browser SDK redirects the current window to the Aurea-hosted checkout
(`/pay/session/{id}`). A modal/iframe mode is not available because the
hosted page sets `Content-Security-Policy: frame-ancestors 'none'` to
prevent clickjacking.

### 4. Verify webhooks on your server

Register your webhook URL in **Dashboard → Developers → Webhook Endpoints**.
Copy the `whsec_…` secret shown once.

```ts
import { Webhook } from '@aureahub/pay/webhooks'

app.post('/webhooks/aurea', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.header('Aurea-Signature')
  let event
  try {
    event = Webhook.constructEvent(req.body, sig, process.env.AUREA_WEBHOOK_SECRET!)
  } catch {
    return res.status(400).send('invalid signature')
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object
    // Mark order paid, ship goods, etc.
  }

  res.sendStatus(200)
})
```

**IMPORTANT**: pass the RAW request body to `constructEvent`, not a
JSON-parsed object. Whitespace differences will break the signature.

## Event types

| Event | Fires when |
|---|---|
| `checkout.session.created` | Session created via the API |
| `checkout.session.completed` | Payment settled (SEPA received or card charged) |
| `checkout.session.expired` | Session reached its `expires_at` without settling |
| `checkout.session.canceled` | Explicitly cancelled via API |
| `refund.created` | Refund enqueued |
| `refund.succeeded` | Refund fully processed |
| `refund.failed` | Refund execution failed |

## Refunds

```ts
const refund = await aurea.refunds.create({
  checkout_session: 'cs_live_...',
  amount:           2500,               // partial allowed; omit for full
  reason:           'customer request',
}, { idempotencyKey: `refund-${order.id}` })
```

- **Card (Mollie)** — refund is executed immediately via Mollie API;
  status goes `processing` → `succeeded`.
- **SEPA (Noah / Monerium)** — status is `manual`; the Aurea treasury
  team processes the bank-side reversal. You'll receive `refund.succeeded`
  when complete.

## Test mode

Use a `sk_test_…` key to create test sessions. The hosted checkout shows
a **Simulate payment** button that fires the full `checkout.session.completed`
event chain without moving real money. Test-mode sessions never hit
Noah / Mollie / Monerium.

## Money handling

Every `amount` field — on checkout sessions and refunds — is an **integer
number of minor units** (cents for EUR). Never pass a float.

```ts
import { type MinorUnits } from '@aureahub/pay'

const price: MinorUnits = 499     // €4.99 — good
const price2: MinorUnits = 4.99   // type error + runtime throw
```

The SDK validates synchronously before the HTTP call and throws
`AureaInvalidRequestError` with `code: 'invalid_amount'` on any non-integer
or out-of-range value. This catches a whole class of IEEE-754 rounding bugs
(`0.1 + 0.2 !== 0.3`) that would otherwise silently produce off-by-one-cent
payouts.

## Errors

All non-2xx responses throw a typed error:

```ts
import { AureaInvalidRequestError, AureaAuthenticationError } from '@aureahub/pay'

try {
  await aurea.checkout.sessions.create({ amount: -1, /* ... */ })
} catch (e) {
  if (e instanceof AureaInvalidRequestError) {
    console.log(e.code, e.param) // 'invalid_amount', 'amount'
  }
}
```

| Error class | When |
|---|---|
| `AureaAuthenticationError` | Missing / invalid / revoked key; or merchant readiness lapsed (`merchant_not_enabled`) |
| `AureaInvalidRequestError` | Bad parameter, validation failure (`invalid_amount`, `invalid_url`, `payment_methods_not_available`, `idempotency_key_expired`, …) |
| `AureaIdempotencyError`    | Idempotency-Key reused with different parameters |
| `AureaRateLimitError`      | Quota exceeded — `Retry-After` header indicates when to retry |
| `AureaNotFoundError`       | Resource does not exist or is not yours |
| `AureaApiError`            | Server-side failure (5xx) — auto-retried by the SDK |

### Webhook verification errors

`Webhook.constructEvent(body, header, secret)` throws `AureaSignatureError`
on any verification failure. The external `message` is deliberately generic
(`"Invalid webhook signature."`) so an attacker probing the endpoint can't
distinguish "wrong secret" from "stale timestamp". Branch on the
machine-readable `code` field instead:

```ts
try {
  const event = Webhook.constructEvent(body, sig, secret)
} catch (e) {
  if (e instanceof AureaSignatureError) {
    // e.code: 'missing_header' | 'missing_secret' | 'malformed_header'
    //       | 'timestamp_invalid' | 'timestamp_stale' | 'signature_mismatch'
    //       | 'invalid_json'
    if (e.code === 'timestamp_stale') return res.status(400).send('stale')
    return res.status(400).send('invalid')
  }
}
```

## Auto-retry & timeouts

The SDK retries transient failures (`429` and `5xx`) with exponential
backoff + jitter:

- **GETs** retry unconditionally — they have no side effects.
- **POST / PATCH / DELETE** retry **only** when you supplied an
  `idempotencyKey`. Without one we refuse to retry rather than risk
  creating a duplicate session or refund.
- `Retry-After` is honoured when the server sends it.

Defaults: 2 extra attempts, 10 s per-request timeout.

## Configuration

```ts
new Aurea({
  apiKey:     'sk_live_...',
  baseUrl:    'https://pay.aureahub.com', // override for staging/self-hosted
  timeout:    10_000,                      // request timeout in ms (default 10_000)
  maxRetries: 2,                           // 0 to disable (default 2)
  httpClient: customFetch,                 // for tests or older runtimes
})
```

## Webhook endpoint URL rules

The URL you register through `aurea.webhookEndpoints.create()` is
validated at both save time and every dispatch to prevent SSRF against
internal services. Your URL must:

- Use the `https://` scheme.
- Use port `443` or `8443`.
- Resolve to a public IP. RFC 1918 private ranges, loopback (`127/8`,
  `::1`), link-local (`169.254/16` — cloud metadata!), CGNAT
  (`100.64/10`), IPv6 ULA (`fc00::/7`), and multicast are all blocked.
- Have a fully-qualified hostname (no bare `internal`).
- Not carry credentials (no `https://user:pass@host/...`).
- Not point at an Aurea-owned domain.

Deliveries also refuse to follow redirects so a public host can't 302 us
into a private address. DNS is re-checked immediately before each fetch.

## License

MIT
