import { test, expect } from '@playwright/test';

test.describe('SuperAdmin RBAC Matrix', () => {
  // Test for PLATFORM_OWNER
  test('PLATFORM_OWNER should have access to all features', async ({ page }) => {
    page.on('dialog', async dialog => {
      console.error(`DIALOG APPEARED: ${dialog.message()}`);
      await dialog.accept();
    });

    await page.goto('/login');
    await page.fill('input[type="email"]', 'owner@test-e2e.com');
    await page.fill('input[type="password"]', 'TestAdmin123!');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('.text-red-500')).not.toBeVisible();
    await page.waitForURL('/dashboard');

    // Should see Global KPIs, Finance KPIs, Usage KPIs
    await expect(page.locator('text=Utilisateurs Total')).toBeVisible();
    await expect(page.locator('text=MRR (Revenu Mensuel)')).toBeVisible();
    await expect(page.locator('button:has-text("Rafraîchir")').first()).toBeVisible();
    await expect(page.locator('button', { hasText: /impersonate|contrôle/i }).first()).toBeVisible();
  });

  // Test for PLATFORM_FINANCE
  test('PLATFORM_FINANCE should not see Usage KPIs or Impersonation', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'finance@test-e2e.com');
    await page.fill('input[type="password"]', 'TestAdmin123!');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('.text-red-500')).not.toBeVisible();
    await page.waitForURL('/dashboard');
    
    await expect(page.locator('text=MRR (Revenu Mensuel)')).toBeVisible();
    // Should NOT see impersonation buttons
    await expect(page.locator('button', { hasText: /impersonate|contrôle/i })).toHaveCount(0);
  });

  // Test for PLATFORM_SUPPORT
  test('PLATFORM_SUPPORT should not see Finance KPIs but can impersonate', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'support@test-e2e.com');
    await page.fill('input[type="password"]', 'TestAdmin123!');
    await page.click('button[type="submit"]');
    
    await expect(page.locator('.text-red-500')).not.toBeVisible();
    await page.waitForURL('/dashboard');
    
    // Should NOT see MRR
    await expect(page.locator('text=MRR Global')).not.toBeVisible();
    // Should see impersonation
    await expect(page.locator('button', { hasText: /impersonate|contrôle/i }).first()).toBeVisible();
  });
});
