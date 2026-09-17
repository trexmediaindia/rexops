export type FlagProvider = {
  getBooleanValue(key: string, fallback: boolean): Promise<boolean> | boolean;
};

let provider: FlagProvider = {
  getBooleanValue: (_key, fallback) => fallback,
};

export function setFlagProvider(nextProvider: FlagProvider) {
  provider = nextProvider;
}

export async function flag(key: string, fallback = false) {
  return provider.getBooleanValue(key, fallback);
}
