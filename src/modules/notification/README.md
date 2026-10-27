# Notification Module

Consumes domain events from the `notification` queue and sends push, SMS, WhatsApp and email.

- **Karix** delivers SMS, WhatsApp and email using templates that are **saved and whitelisted on Karix** (template ID `CA_<EVENT>_<CHANNEL>` plus the approved sender ID). Push goes through the platform push service.
- `EVENT_TEMPLATES` maps each event to channels (assumption A16). Reminder and overdue messages are only sent 08:00–19:00 IST.
- **Dedupe:** UNIQUE `dedupe_key = event:advance:channel[:suffix]`, so a redelivered event never sends twice.
- **Failures:** the row stays PENDING and is retried by `retryPendingNotifications` (5 attempts). If push fails for a critical event, it falls back to WhatsApp. A notification-provider outage never blocks money flows.
