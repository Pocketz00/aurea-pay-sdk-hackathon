# Changelog

All notable changes to `@aureahub/pay` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the
versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.6] — 2026-07-08

Additive, non-breaking type refinement. `AureaEvent.type` and
`EventDelivery.event_type` were typed as `string`; they are now a
forward-compatible `AureaEventType` union that documents every webhook event the
platform emits and gives editor autocomplete, while still accepting any future
event type (widened with `(string & {})`). No runtime change — consumers upgrade
in place without re-testing.

### Added

- `AureaEventType` union: `checkout.session.{created,completed,expired,canceled}`,
  `refund.{created,succeeded,failed,updated}`, and `payout.{paid,failed}`. The
  latter three (`refund.updated`, `payout.paid`, `payout.failed`) are emitted by
  the current platform but were previously undocumented in the SDK.

## [0.3.2] — 2026-05-04

Documentation-only patch. **No code changes** — the public API surface
locked at 0.3.0 is unchanged; consumers can upgrade in place without
re-testing. The bump exists to ship the updated CHANGELOG in the npm
tarball describing today's platform go-live.

### Server-side update — Aurea Pay platform go-live

- **Stripe Connect (Standard, OAuth) is now the default card rail for
  every merchant.** The admin-canary visibility gate has been removed
  across the entire Stripe surface (settings tab, OAuth start, status,
  payout-IBAN, disconnect, refresh, onboard). Existing Stripe merchants
  see no change; new merchants see the connect CTA on first visit to
  `Settings → Stripe`.
- **Mollie is being retired** and is hidden from the merchant dashboard
  behind a feature flag (`AUREA_MOLLIE_ENABLED`, default off). All
  Mollie code paths — webhook handler, OAuth callback, reconciliation,
  refunds — remain functional for in-flight sessions; only NEW card
  sessions stop being routed to Mollie.
- **Fee disclosure surface added** to the merchant dashboard: every fee
  that applies (Aurea 0.25% + €1.00, Stripe 1.5% + €0.25 EEA cards /
  2.5% + €0.25 non-EEA, Noah / Monerium where applicable) is shown on
  Settings → Payment methods, → Stripe, and → Shopify. Numbers come
  from a single source-of-truth module (`lib/fees.ts`) so the disclosure
  cannot drift from actual amounts charged.
- **Stripe webhook fee-drift sanity check.** On every `charge.succeeded`
  event the platform compares Stripe's actual `application_fee_amount`
  against `computeAureaApplicationFee` for the gross amount. Drift > 1
  minor unit fires an `AmlAlert` (severity high) plus an observability
  alert.
- **Production-hardening cluster** (no merchant-visible behaviour change):
  Stripe webhook secret rotation cap (7-day hard cap on PREVIOUS_SECRET);
  per-IP rate limit + body cap on Noah / Monerium / Shopify GDPR webhooks;
  admin-portal TOTP fail-closed in production; trusted-device User-Agent
  fingerprint pinning + auto-revoke on admin password rotation;
  AUREA_INTEGRITY_KEY KV source flag (shared with Stripe OAuth state
  CSRF token); email-change saga with explicit Firebase rollback on DB
  failure; Phase 4A pre-flip validator script.

### SDK consumer impact

- **None.** Public API surface is identical to 0.3.1. The rail-agnostic
  event model means consumers receive the same
  `checkout.session.completed`, `refund.*`, etc. regardless of which
  underlying provider settled the payment. If you've integrated against
  any 0.3.x version, no code or test changes are required.

## [0.3.1] — 2026-04-29

Documentation-only patch. **No code changes** — the public API surface
locked at 0.3.0 is unchanged; consumers can upgrade in place without
re-testing. The bump exists to ship the updated CHANGELOG in the npm
tarball so a future merchant running `npm install @aureahub/pay` reads
the current platform-rail context without having to cross-reference
the GitHub repo.

### Server-side rail addition (no SDK API change)

- The Aurea Pay platform now supports **Stripe Connect** as a parallel
  card-acceptance rail alongside Mollie. Visible only to admin merchants
  during the canary phase. **No SDK changes required**: the public
  surface (`checkout.sessions`, `refunds`, `events`, `webhookEndpoints`,
  `account`) is rail-agnostic — the platform picks the rail server-side
  based on merchant configuration. SDK consumers continue to receive the
  same event types (`checkout.session.completed`, `refund.succeeded`,
  etc.) regardless of which underlying provider settled the payment.
- Documentation will be updated in 0.4.x to mention Stripe explicitly
  in the rails-overview section, but no code change is needed.

## [0.3.0] — 2026-04-28

The first stable-surface minor before 1.0. Public API is now considered
**locked**: any breaking change in the next release will require a
major version bump. Under-the-hood improvements (more tests, richer
JSDoc, internal refactors) can still ship as 0.3.x patches without
breaking consumers.

### Locked surface

The following are stable contracts. Adding new optional fields is
allowed; renaming, removing, or changing semantics is not.

- `class Aurea` constructor options: `apiKey`, `baseUrl`, `timeout`,
  `maxRetries`, `httpClient`, `defaultHeaders`.
- Resources: `aurea.checkout.sessions.{create, retrieve, list, cancel, simulate}`,
  `aurea.refunds.{create, retrieve, list}`,
  `aurea.webhookEndpoints.{create, retrieve, list, update, delete, test}`,
  `aurea.events.{list, retrieve, resend}`,
  `aurea.account.retrieve`.
- Webhook verifier: `Webhook.constructEvent(body, header, secret, tolerance = 60)`,
  `class AureaSignatureError` (with stable `code` field).
- Browser entry: `openCheckout({ sessionId, baseUrl? })`,
  `class AureaCheckoutRedirectError`.
- React entry: `<AureaCheckoutButton sessionId baseUrl? label? theme? className? style? disabled? />`,
  `<AureaLogoMark />`, `<AureaBrandLockup />`.
- Errors: `AureaError` and the six typed subclasses
  (`AureaAuthenticationError`, `AureaInvalidRequestError`,
  `AureaIdempotencyError`, `AureaRateLimitError`, `AureaNotFoundError`,
  `AureaApiError`).
- Validators: `assertMinorUnits`, `assertOptionalMinorUnits`.

### Notes

- No breaking changes from `0.2.0-beta.5`. Consumers can upgrade
  in-place.
- The webhook tolerance default (60s) is unchanged.
- Zero-runtime-deps gate enforced on every publish via
  `audit:no-runtime-deps`.
- Provenance attestation (`npm publish --provenance`) ships with this
  release: `npm audit signatures` will verify the tarball came from the
  GitHub Actions run that built it.

## [0.2.0-beta.5] — 2026-04-27

### Added

- **`aurea.checkout.sessions.simulate(id)`** — drive a test-mode session
  to `complete` server-to-server without hitting any rail. Useful for
  end-to-end tests of webhook delivery and post-payment redirects from
  CI. The Partner API rejects `sk_live_*` keys on this path, so a
  production key cannot accidentally book a fake settlement.

  ```ts
  // sk_test_* only
  const s = await aurea.checkout.sessions.create({ ... })
  // … your test verifies redirects, dashboard state, etc.
  await aurea.checkout.sessions.simulate(s.id)
  // s.status is now 'complete'; checkout.session.completed webhook
  // fires to all matching endpoints.
  ```

- Comprehensive JSDoc on every public class, method, and option. Editor
  hover/quick-info now shows parameter meanings, examples, side
  effects, and `@throws` for the entire SDK surface.

- Expanded test suite (3 → 5 files, 32 → 64 cases) covering retries,
  idempotency policy, error mapping, default base URL, header
  forwarding, and the `openCheckout` host allowlist.

### Notes

- No breaking changes from beta.3.
- Webhook tolerance default stays at 60s (set explicitly if needed).

## [0.2.0-beta.3] — 2026-04-27

### Breaking

- **Default webhook timestamp tolerance reduced from 300s (5 min) to 60s.**
  The `tolerance` parameter on `Webhook#constructEvent(body, header,
  secret, tolerance?)` defaults to 60 if you don't pass one. Legitimate
  webhook delivery completes in single-digit seconds, so the wider
  window only helped attackers replay captured signatures. Pass an
  explicit value if you have a delayed-queue processor that genuinely
  needs more time:

  ```ts
  // back to the previous behaviour:
  webhook.constructEvent(body, header, secret, 300)
  ```

### Fixed

- README: dead link to `aureapay.com` replaced with `pay.aureahub.com`
  (production hostname).

## [0.2.0-beta.1] — 2026-04-24

### Breaking

- **`amount` fields are now validated client-side as integer minor units**
  (cents). `aurea.checkout.sessions.create({ amount: 4.99 })` now throws
  `AureaInvalidRequestError` synchronously. Pass `499` instead. Same applies
  to `aurea.refunds.create({ amount })`. This prevents a class of silent
  rounding bugs where floats in JS (`0.1 + 0.2 !== 0.3`) would surface as
  off-by-one-cent payouts.
- **Default request timeout reduced from 30s to 10s.** Long enough for
  the checkout path, short enough that a network hang doesn't stall a
  buyer's browser. Override via `new Aurea({ timeout })`.
- **Webhook verification errors now return a generic external message**
  (`"Invalid webhook signature."`) with a machine-readable `code` field
  (`missing_header`, `timestamp_stale`, `signature_mismatch`, …). Apps
  that branched on the `message` string should branch on `code` instead.
  Configuration errors (`missing_secret`, `invalid_json`) still surface
  detailed messages.

### Added

- **Auto-retry for transient failures.** The HTTP client now retries
  `429` and `5xx` responses with exponential backoff + jitter (up to 2
  additional attempts by default). GETs retry unconditionally; POST /
  PATCH / DELETE retry only when the caller passed an `idempotencyKey`
  so we never risk duplicate side-effects. Honours `Retry-After` when
  the server sends it. Override via `new Aurea({ maxRetries })`.
- **`MinorUnits` type alias** exported for ergonomic caller typing:
  ```ts
  import { Aurea, type MinorUnits } from '@aureahub/pay'
  const amount: MinorUnits = 499
  ```
- **`AureaSignatureFailureCode`** type for webhook verification branches.
- **`sideEffects: false`** in package.json so bundlers can tree-shake
  unused exports.

### Changed

- Source maps are no longer published to npm. Consumers can still debug
  the compiled JS; we stop leaking absolute paths from our build machine.
- README annotations on every `amount` field clarify the "integer minor
  units" contract inline, not just in the top-of-file doc comment.

## [0.1.0-beta.3] — 2026-04-21

- `Account.enabled_payment_methods` now exposed alongside `capabilities`
  so merchants can distinguish "rail not ready" from "account-level cap".
- Bug fix: redirect-only browser SDK (no modal mode — CSP incompatible).

## [0.1.0-beta.2] — 2026-04-20

- Branded `<AureaCheckoutButton>` with logo / wordmark baked in.

## [0.1.0-beta.1] — 2026-04-18

- Initial SDK: Node server, browser redirect, React component, examples.

---

## Roadmap to 1.0

Before cutting a stable release we want:

1. **Public-surface stability** — no further breaking changes to the
   server resource methods (`checkout.sessions`, `refunds`, `events`,
   `webhookEndpoints`, `account`). The shapes should lock in at 0.3.x.
2. **Test coverage** — today the SDK is at ~60% line coverage across
   `client`, `webhooks`, `validate`. Target 80%+ before 1.0; add
   integration tests against a locally-running Partner API mock.
3. **Documentation** — every public export needs a JSDoc example and
   the errors page needs to map every server-side `code` to the SDK's
   exception class.
4. **Field battle-test** — 10+ merchants integrated in production
   without a bug report against SDK internals.
5. **Semver bump** — once the above is met, rename the current
   `0.2.0-beta.N` series to `1.0.0-rc.N`, then `1.0.0`.

Anything we cut from 1.0 goes into the Unreleased section above as the
target for 1.1.
