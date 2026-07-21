# Governed AI foundation

This service assembles read-only context for the authenticated user and tenant.
Canonical business fields are included only when the MetadataRegistry marks
them `aiReadable`; restricted and AI-hidden objects fail closed. Every object
read is a closed, tenant-filtered query, and the request-bound IdentityService
must grant the same permission required by the normal object timeline.

The service can write only `ai_conversations`, `ai_messages`, `ai_evidence` and
`ai_audit`. It has no tool execution or business-table mutation capability.
Model prompts are hashed in `ai_audit`; the full assembled prompt is not stored
there. Evidence snippets contain only governed context sent to the provider.

The first provider adapter uses Anthropic's HTTP API through the runtime's
native `fetch`. `AI_PROVIDER=anthropic`, `ANTHROPIC_API_KEY` and
`ANTHROPIC_MODEL` are required only when a model call is made. Tests inject a
model client and never make live network calls.
