// Vercel serverless entry — wraps the Express app.
// All /api/v1/* requests are rewritten here (see vercel.json).
import { createApp } from "../server/src/app.js";

export default createApp();
