-- P1-003 rollback. This removes workflow execution history; use only as a
-- deliberate deployment rollback after confirming no later migration depends
-- on these tables.
DROP TABLE IF EXISTS "workflow_actions";
DROP TABLE IF EXISTS "workflow_instances";
DROP TABLE IF EXISTS "workflow_definitions";
