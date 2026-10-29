export function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** True when the email goes only to the sending account itself, which is not worth tracking. */
export function isSelfOnly(recipients: readonly string[], account: string): boolean {
  const me = normalizeAddress(account);
  const addresses = recipients.map(normalizeAddress).filter((address) => address.length > 0);
  return addresses.length > 0 && addresses.every((address) => address === me);
}
