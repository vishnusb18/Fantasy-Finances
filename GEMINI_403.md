# Gemini 403 investigation

## Confirmed findings

- A full coach request sent directly through the official SDK, independently of the browser, Nessie and SpacetimeDB, succeeded; the next equivalent request with the same key and model failed.
- The provider returned exactly `403 PERMISSION_DENIED`, `The caller does not have permission`, without an `ErrorInfo` reason identifying the denied permission. This is the reported authorization failure, not a reported quota/429 or timeout error.
- The loaded server key matches `.env.local`. No inherited key override, custom Gemini base URL, Vertex override or proxy environment setting was found.
- A single non-generation model metadata lookup authenticated successfully and returned `models/gemini-3.5-flash` with `generateContent` support. Model discovery does not prove that every inference request is authorized.
- The project is Active/available according to the user's AI Studio check. The exact key restrictions, service-account/model entitlement and billing tier have not been independently verified.

The evidence isolates the failure to Google's generation authorization rather than local startup or financial-data permissions. It does **not** identify a specific Google-side policy or prove that the key is expired, leaked, or permanently disabled. No further generation probes were made after the user asked to avoid repeated requests. A metadata lookup and local tests were used instead.

## Quota protection

- Removed the proposed permission-retry wrapper entirely.
- Removed the automatic second generation for correcting invented numbers. The existing engine-verified summary is used immediately for an unverified numeric answer, without another model call.
- Explicit SDK `httpOptions.retryOptions.attempts = 1` disables transport retries.
- Authorization errors do not produce a fake successful answer. The user gets a clear permission error with their question preserved.
- Only fixed diagnostic codes/statuses are logged. Raw SDK errors, credentials and financial payloads are not logged or returned.

Build and 186 local tests passed, including checks that a permission denial and an invalid numeric answer each invoke generation only once. These tests use mocked SDK responses and consume no Google quota.

## Remaining account-side evidence

AI Studio's Active project status is not sufficient to inspect an individual key's API restrictions, service-account permissions or model entitlement. The next information needed is the API restriction and billing tier shown for the exact key's project, without sharing its value. If those are correct, Google's project request logs/support need to identify the denied permission; retrying or rotating keys cannot establish that cause.

References: [Google API error codes](https://ai.google.dev/gemini-api/docs/api-errors), [Gemini key authentication](https://ai.google.dev/gemini-api/docs/api-key).
