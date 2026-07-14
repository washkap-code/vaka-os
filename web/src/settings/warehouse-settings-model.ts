export function isLightBrandColour(value: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return false;
  const colour = Number.parseInt(match[1], 16);
  const red = (colour >> 16) & 255;
  const green = (colour >> 8) & 255;
  const blue = colour & 255;
  return (red * 299 + green * 587 + blue * 114) / 1000 > 170;
}

export function warehouseSettingsAccess(permissions: readonly string[], readonly: boolean) {
  const canView = permissions.some((permission) =>
    ["settings.manage", "inventory.read", "inventory.write"].includes(permission));
  const canManage = !readonly && permissions.some((permission) =>
    ["settings.manage", "inventory.write"].includes(permission));
  return { canView, canManage };
}
