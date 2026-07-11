export type ServiceToken<T> = symbol & { readonly __serviceType?: T };
export type ServiceFactory<T> = (container: import("./interfaces.js").ServiceContainerContract) => T;
