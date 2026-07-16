import { loadLocalEnvironment, runtimeConfig } from "./config.js";

loadLocalEnvironment();
// Validate the whole runtime contract before importing modules that consume
// configuration or opening the HTTP listener.
const config = runtimeConfig();
const { createApp } = await import("./app.js");
createApp().listen(config.port, () => console.log(`VAKA OS API on :${config.port}`));
