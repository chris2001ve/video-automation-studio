import type { ProviderId } from '../types';
import { BytePlusProvider } from './byteplus';
import { FalProvider } from './fal';
import type { FetchFn } from './http';
import { MockProvider } from './mock';
import { PollinationsProvider } from './pollinations';
import type { VideoProvider } from './types';

export * from './types';
export { FalProvider, BytePlusProvider, MockProvider, PollinationsProvider };

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  fal: 'fal.ai (Pago)',
  byteplus: 'BytePlus ModelArk (Pago)',
  pollinations: 'Gratuito (Pollinations)',
  mock: 'Demo (simulado)',
};

const mockSingleton = new MockProvider();

export function createProvider(id: ProviderId, apiKey: string, fetchFn: FetchFn): VideoProvider {
  switch (id) {
    case 'fal': return new FalProvider(apiKey, fetchFn);
    case 'byteplus': return new BytePlusProvider(apiKey, fetchFn);
    case 'pollinations': return new PollinationsProvider(fetchFn);
    case 'mock': return mockSingleton;
    default: return mockSingleton;
  }
}
