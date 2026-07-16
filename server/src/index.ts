import { createApp } from "./app.js";
import { emailDeliveryConfig } from "./config.js";
// Validate before opening the listener: production must never boot without a
// complete real SMTP configuration.
emailDeliveryConfig();
const port = Number(process.env.PORT || 4000);
createApp().listen(port, () => console.log(`VAKA OS API on :${port}`));
