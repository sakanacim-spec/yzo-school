import { test, expect } from '@playwright/test';

test.describe('SuperAdmin Impersonation Flow', () => {
  test.describe.configure({ mode: 'serial' });

  // Setup before each test to login as PLATFORM_OWNER
  test.beforeEach(async ({ page }) => {
    page.on('dialog', async dialog => {
      console.error(`DIALOG APPEARED: ${dialog.message()}`);
      await dialog.accept();
    });
    page.on('console', msg => console.log(`BROWSER CONSOLE: ${msg.text()}`));

    await page.goto('/login');
    await page.fill('input[type="email"]', 'owner@test-e2e.com');
    await page.fill('input[type="password"]', 'TestAdmin123!');
    await page.click('button[type="submit"]');
    
    // Fast fail assertion
    await expect(page.locator('.text-red-500')).not.toBeVisible();
    await page.waitForURL('/dashboard', { timeout: 10000 });
  });

  test('should execute full impersonation lifecycle (create, persist, revoke)', async ({ page }) => {
    // 1. Locate the Impersonate button for the E2E tenant
    const impersonateBtn = page.locator('button', { hasText: /impersonate|contrôle/i }).first();
    await expect(impersonateBtn).toBeVisible();
    
    // 2. Click Impersonate
    await impersonateBtn.click();
    
    // 3. Wait for the banner to appear
    const banner = page.locator('text=Mode Impersonation Actif').first();
    await expect(banner).toBeVisible({ timeout: 10000 });
    
    // 4. Verify banner contains revocation button
    const revokeBtn = page.locator('button:has-text("Quitter l\'impersonation")').first();
    await expect(revokeBtn).toBeVisible();
    
    // 5. Test page reload persistence
    await page.reload();
    await expect(banner).toBeVisible();

    // 6. Revoke session
    await page.locator('button:has-text("Quitter l\'impersonation")').first().click();
    
    // 7. Banner should disappear
    await expect(banner).not.toBeVisible({ timeout: 10000 });
  });

  test('should invalidate session after browser close and resume (simulated by new context)', async ({ browser }) => {
    // We already handle session isolation by default in Playwright, 
    // each test gets a fresh context, so we don't need to manually simulate it here.
    // However, if we wanted to test specifically:
    const context1 = await browser.newContext();
    const page1 = await context1.newPage();
    
    await page1.goto('/login');
    await page1.fill('input[type="email"]', 'owner@test-e2e.com');
    await page1.fill('input[type="password"]', 'TestAdmin123!');
    await page1.click('button[type="submit"]');
    await expect(page1.locator('.text-red-500')).not.toBeVisible();
    await page1.waitForURL('/dashboard');
    
    // Close context
    await context1.close();
    
    // New context - shouldn't have session
    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto('/dashboard');
    await page2.waitForURL('/login');
    
    await context2.close();
  });
});
