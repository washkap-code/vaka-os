# P12-001 — Governed AI foundation

## Scope and outcome

P12-001 introduces the read-only substrate used by future VAKA AI features. It
does not add chat, autonomous agents, tool execution or business write actions.
The proof endpoint summarises one canonical object's Universal Timeline and
returns the exact evidence records used for that response.

## Security and data boundaries

- The authenticated user and tenant are captured into a request-bound
  `IdentityService`. Supplied user or tenant identifiers must match that
  identity exactly.
- Each canonical object uses the same normal read permission as its Universal
  Timeline. All permission checks complete before an object query or model call.
- Every business read contains an explicit `tenant_id` predicate. Customer and
  Supplier projections also enforce their canonical role and soft-delete state.
- Only fields marked `aiReadable` in the `MetadataRegistry` enter context.
  Restricted fields and AI-hidden Employee/User objects fail closed.
- Timeline facts expose kind, action and date. Before/after values are filtered
  again through the object's `aiReadable` field set; notification bodies,
  workflow comments and unrestricted event payloads are not sent to the model.
- The AI service can write only to `ai_conversations`, `ai_messages`,
  `ai_evidence` and `ai_audit`. A test enforces that its PostgreSQL adapter has
  no business-table insert, update or delete path.

## Evidence and audit

Each canonical record and timeline item supplied to the model becomes an
`ai_evidence` row attached to the assistant message. The API returns those
evidence rows with the summary. Every attempted model call records an
`ai_audit` row with a SHA-256 prompt hash, provider model, token counts and
evidence count. The assembled prompt is not stored in `ai_audit`.

## Provider and failure behaviour

The first `ModelClient` implementation calls Anthropic through native `fetch`;
no provider library was added. Runtime configuration is held in environment
secrets:

- `AI_PROVIDER=anthropic`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`

Configuration is evaluated lazily. Missing provider configuration makes the AI
endpoint return an unavailable error without preventing the server or non-AI
features from starting. CI injects a mock client or HTTP test double and makes
no live network calls.

## API and permissions

`POST /api/v1/ai/summarise`

```json
{ "objectType": "Product", "objectId": "uuid" }
```

The route is authenticated and tenant-scoped. Permission is selected from the
requested canonical object rather than granting a broad AI permission. Store
P16-001 is not merged into the P1-006 base of this branch, so the conditional
`requireFeature('ai')` entitlement guard is intentionally deferred to branch
integration; no legacy feature flag is used as a substitute.

There is no user interface in this mission. The endpoint's error messages and
response fields must enter the normal English/Shona/Ndebele catalogue when a
future UI consumes them.
