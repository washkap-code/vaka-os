# Enterprise Data Dictionary standard

Every canonical object, physical table/field, API field and event field must record:

1. stable name and identifier;
2. business definition and owner;
3. canonical-object mapping;
4. tenant, legal-entity and other scope;
5. system/source of truth and lineage;
6. type, format, unit/currency/timezone and precision;
7. null, default, validation and uniqueness rules;
8. lifecycle and mutability, including append-only/immutable behavior;
9. relationships, constraints and indexes;
10. data classification and sensitivity;
11. read/write permissions and audit events;
12. retention, deletion, legal hold and export behavior;
13. localisation/display key separate from machine value;
14. API/event/provider mappings and version;
15. migration/backfill/reconciliation history;
16. example, effective date and last reviewer.

The first physical baseline is `server/src/db/schema.ts`; the target canonical model is Book Six. A generated schema inventory may aid maintenance but never supplies missing business definitions automatically.
