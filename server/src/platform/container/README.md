# Dependency Container

The container provides explicit constructor dependency injection for Platform
services. It is intentionally small: values and memoised factories are enough
for the kernel foundation and keep composition visible at application roots.

The existing application is not switched to this container by P1-001.
