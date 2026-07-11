import { DuplicateServiceError, MissingServiceError } from "./errors.js";
import type { ServiceContainerContract } from "./interfaces.js";
import type { ServiceFactory, ServiceToken } from "./types.js";

type Provider<T> = { factory: ServiceFactory<T>; instance?: T };

export const createServiceToken = <T>(description: string): ServiceToken<T> =>
  Symbol(description) as ServiceToken<T>;

export class ServiceContainer implements ServiceContainerContract {
  private readonly providers = new Map<symbol, Provider<unknown>>();

  registerValue<T>(token: ServiceToken<T>, value: T): void {
    this.registerFactory(token, () => value);
  }

  registerFactory<T>(token: ServiceToken<T>, factory: ServiceFactory<T>): void {
    if (this.providers.has(token)) throw new DuplicateServiceError();
    this.providers.set(token, { factory });
  }

  get<T>(token: ServiceToken<T>): T {
    const provider = this.providers.get(token) as Provider<T> | undefined;
    if (!provider) throw new MissingServiceError();
    if (provider.instance === undefined) provider.instance = provider.factory(this);
    return provider.instance;
  }

  has<T>(token: ServiceToken<T>): boolean { return this.providers.has(token); }
}
