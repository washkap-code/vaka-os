import { ServiceContainer } from "./container/service.js";
import type { ServiceContainerContract } from "./container/interfaces.js";
import { PLATFORM_KERNEL_VERSION } from "./types.js";
import type { PlatformKernelContract } from "./interfaces.js";
import type { PlatformKernelVersion } from "./platform-types.js";

export class PlatformKernel implements PlatformKernelContract {
  readonly version: PlatformKernelVersion = PLATFORM_KERNEL_VERSION;

  constructor(readonly container: ServiceContainerContract = new ServiceContainer()) {}
}

export const createPlatformKernel = (): PlatformKernel => new PlatformKernel();
