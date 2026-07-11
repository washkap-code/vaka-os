# Blueprint source map

## Supplied source

The user supplied a 2,116-line chat extract containing substantive Book Two, Book Three, Book Four, and the proposed titles of Books Five to Twenty-Four.

- Original attachment: `/Users/drwashington/.codex/attachments/6465b0e5-4dd7-4fca-9de7-5d99e84676aa/pasted-text.txt`
- SHA-256: `5409fa5d2f88e55b00113ef6de882295f9cb16f3aacfd0e0f891a16c22f38d10`
- Recovered content: Book Two platform phases and gates; Book Three programme map and completion definition; Book Four execution framework; 24-book title catalogue.
- Missing from supplied source: Book One and the body content of Books Five to Twenty-Four.

## Repository sources

The new books normalize and reference, rather than silently replace:

- `docs/00-foundation/` - Constitution, product philosophy, brand positioning;
- `docs/01-brand/` - visual and verbal standards;
- `docs/02-product/` - module, market, pricing, integration, AI, mobile, and product specifications;
- `docs/03-technical/` - architecture, Platform Kernel, security, API, database, testing, localisation, mobile, and AI architecture;
- `docs/04-execution/` - roadmap, gates, release, CI, definition of done, and decision log;
- `docs/05-ai/` - AI constitution, capability, safety, evaluation, memory, tools, and autonomy;
- `docs/finance/` - current-state audit, invariants, risks, migrations, remediation evidence, and financial-kernel baseline;
- `docs/engineering/mission-packs/` - executable mission definitions and completion evidence;
- `server/src/` and `web/src/` - implementation evidence only, never inferred availability;
- `knowledge-system/` - governed indexes, ADRs, ontology, canonical model, dictionary, programme control, and mission register.

## Normalisation rule

The chat is a leadership and programme source, not executable code. Where it conflicts with constitutional invariants or verified repository state, the contradiction log records the normalized decision. No checkmark or “approved for construction” label from the chat is treated as implementation evidence.
