import { loadLocalEnvironment, runtimeConfig } from "./config.js";

loadLocalEnvironment();
// Validate the whole runtime contract before importing modules that consume
// configuration or opening the HTTP listener.
const config = runtimeConfig();
const [{ applicationLogger: logger }, { createErrorTracker, installCrashHandlers }, { createApp }] = await Promise.all([
  import("./observability.js"),
  import("./error-tracking.js"),
  import("./app.js"),
]);
const errorTracker = createErrorTracker(config.errorTracking, logger);
installCrashHandlers({ logger, tracker: errorTracker });
createApp({ logger, errorTracker, version: config.appVersion }).listen(config.port, () => {
  logger.info("server.started", {
    event: "server.started",
    port: config.port,
    version: config.appVersion,
  });
});
