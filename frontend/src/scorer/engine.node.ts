/** Node-side SWIPL factory, used by tests and the golden-file harness. */
import SWIPL from 'swipl-wasm/dist/swipl-node.js';
import type { SwiplFactory, SwiplModule } from './engine';

export const nodeSwiplFactory: SwiplFactory = () =>
  (SWIPL as (o: unknown) => Promise<SwiplModule>)({ arguments: ['-q'] });
