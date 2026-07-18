import { setupE2E } from './seed';

async function globalSetup() {
  await setupE2E();
}

export default globalSetup;
