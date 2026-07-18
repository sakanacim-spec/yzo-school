import { test, expect } from '@playwright/test';

test.describe('SuperAdmin Authentication', () => {
  test('should login successfully with valid credentials and redirect to dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'owner@test-e2e.com');
    await page.fill('input[type="password"]', 'TestAdmin123!');
    await page.click('button[type="submit"]');

    // Fast fail assertion: error message should NOT be visible
    await expect(page.locator('.text-red-500')).not.toBeVisible();

    // Wait for URL to be /dashboard
    await page.waitForURL('/dashboard', { timeout: 10000 });
    await expect(page).toHaveURL('/dashboard');

    // Verify dashboard elements
    await expect(page.locator('text=Oziow Admin').first()).toBeVisible();
    await expect(page.locator('text=Vue d\'ensemble').first()).toBeVisible();
  });

  test('should fail login with invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'wrong@test-e2e.com');
    await page.fill('input[type="password"]', 'wrongpass');

    let alertMessage = '';
    page.once('dialog', async dialog => {
      alertMessage = dialog.message();
      await dialog.accept();
    });

    await page.click('button[type="submit"]');

    // Check if the alert message was correct
    await expect.poll(() => alertMessage).toContain('Invalid login credentials');
  });

  test('should protect dashboard page from unauthenticated access', async ({ page }) => {
    await page.goto('/dashboard');
    // It should redirect back to /login because session is empty
    await page.waitForURL('/login', { timeout: 5000 });
    await expect(page).toHaveURL('/login');
  });
});
