import { NextApiBridgeClient } from './client';
import { validateAndNormalizeOptions } from './config/validate';
import type { ApiBridgeOptions } from './types';

export function createNextApiBridge(options: ApiBridgeOptions): NextApiBridgeClient {
  return new NextApiBridgeClient(validateAndNormalizeOptions(options));
}
