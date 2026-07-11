import type { ServiceFactory, ServiceToken } from "./types.js";

export interface ServiceContainerContract {
  registerValue<T>(token: ServiceToken<T>, value: T): void;
  registerFactory<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void;
  get<T>(token: ServiceToken<T>): T;
  has<T>(token: ServiceToken<T>): boolean;
}
