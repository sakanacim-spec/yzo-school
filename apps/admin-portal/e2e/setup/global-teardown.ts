import { teardownE2E } from './seed';

async function globalTeardown() {
  await teardownE2E();
}

export default globalTeardown;
