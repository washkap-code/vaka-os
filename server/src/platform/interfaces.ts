import type { ServiceContainerContract } from "./container/interfaces.js";
import type { PlatformKernelVersion } from "./platform-types.js";

export interface PlatformKernelContract {
  readonly version: PlatformKernelVersion;
  readonly container: ServiceContainerContract;
}
