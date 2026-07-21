# Local data inventory

| Data | Default retention | Protection | Sent to model |
|---|---|---|---|
| Story title and panel text | Until local deletion | AES-256-GCM; key envelope protected by macOS Keychain | De-identified panel text only |
| Generated and composed art | Until local deletion | AES-256-GCM content-addressed files | Render contract and approved references |
| Craft-card progress | Until all-data deletion | Local SQLite record; changed evidence encrypted | No |
| Raw microphone audio | None | Never written | No |
| Draft voice transcript | Stored only after it becomes child-confirmed panel text | Same as story text | As panel text after preflight |
| Complaint transcript | Discarded immediately after diagnosis | Memory only | Yes, after local private-data preflight |
| Structured logs | Local support window | No story text, prompts, responses, images, identities, or credentials | No |

Phase 0 benchmark data is synthetic and stored separately from playtest data.
No application analytics event contains story text, transcript text, prompts,
or images.
