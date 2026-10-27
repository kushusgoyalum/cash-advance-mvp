# Third-party Module

Ports (interfaces) plus adapters. Domain modules only see the ports from `index.ts`.

| Port | Real adapter | Mock | Notes |
|---|---|---|---|
| `BankingProvider` | `httpBank.adapter.ts` | `mockBank.adapter.ts` | Escrow balance, payout, consented debit, balance, statement. **Every call goes through the circuit breaker** (`banking.registry.ts`). `probeBankHealth()` uses the escrow balance-check API as the 60s health probe. |
| `BureauProvider` | `httpBureau.adapter.ts` | `mockBureau.adapter.ts` | Hard pull only with a consent reference. |
| `MessagingProvider` | `karix.adapter.ts` | `mockMessaging.adapter.ts` | Karix SMS, WhatsApp and email with whitelisted template IDs and sender ID. |
| `PushProvider` | platform push service | mock | Device tokens are owned by the platform. |
| `PlatformClient` | `httpPlatform.adapter.ts` | `mockPlatform.adapter.ts` | User, account and KYC status (this service never owns KYC). |

`http.ts` classifies failures into `ProviderError` kinds (TIMEOUT, NETWORK, SERVER, RATE_LIMITED, CLIENT), which drive the retry and status-query decisions. It also writes a masked call log to Mongo. `USE_MOCK_PROVIDERS=true` switches every port to its mock.
