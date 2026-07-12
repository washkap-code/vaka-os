# Status and claim legend

Every capability, module, service, integration, country pack, mission, and launch gate has four independent statuses.

## Definition

`not-assessed` -> `captured` -> `draft` -> `proposed` -> `accepted` -> `superseded`

Definition describes the quality and authority of the specification. It does not describe code.

## Implementation

`not-assessed` -> `not-implemented` -> `partial` -> `implemented` -> `retired`

Implemented means the accepted scope exists in code/configuration and required migrations have completed. It does not imply verification or availability.

## Verification

`not-run` -> `blocked` or `failed` -> `passed` -> `externally-approved`

Passed must identify the exact tests, environment, version/commit, date, and reviewer. External approval is separate and applies only where required.

## Availability

`planned` -> `internal` -> `preview` -> `pilot` -> `GA`, with `disabled` and `retired` terminal or temporary states.

Availability is a Product/Release decision. Code in `main` is not automatically customer-facing.

## Required evidence

Each status record includes capability ID, owner, controlling source, target outcome, current-state evidence, dependencies, Mission Packs, test evidence, professional review, last-reviewed date, known gaps, and availability decision.

## Prohibited unsupported claims

Do not label VAKA or a capability “complete”, “enterprise-grade”, “Microsoft-level”, “SAP-level”, “certified”, “compliant”, “secure”, “production-ready”, or “live” without a defined benchmark and evidence. This blueprint may set those as target standards; only release evidence may assert achievement.
