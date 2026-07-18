import { pool } from "../src/lib.js";
import { seedZimbabweBlackBookWithPrincipalEditor } from "../src/modules/blackbook/seed.js";
import { logEvent } from "../src/observability.js";

try {
  const result = await seedZimbabweBlackBookWithPrincipalEditor();
  logEvent("blackbook.seed.completed", result);
} finally {
  await pool.end();
}
