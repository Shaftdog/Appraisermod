import { test, expect } from '@playwright/test';

test('Reviewer loop + appraiser submit revisions', async ({ page }) => {
  // Login as reviewer
  await page.goto('/login');
  await page.getByLabel('Username').fill('reviewer@example.com');
  await page.getByLabel('Password').fill('P@ssw0rd!');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/reviewer$/);

  // Open first order in queue
  await page.getByTestId('button-review-order').first().click();
  await expect(page).toHaveURL(/\/reviewer\/orders\//);

  // Navigate to Actions tab and request changes
  await page.getByRole('tab', { name: /actions/i }).click();
  await page.getByRole('button', { name: /request changes/i }).click();
  await page.getByTestId('textarea-reject-reason').fill('Please align time-basis with market metric.');
  await page.getByTestId('button-confirm-reject').click();
  await expect(page.getByText(/changes requested/i)).toBeVisible();

  // Simulate appraiser session - navigate to order page
  await page.goto('/orders/order-123'); // Use correct order ID format
  await expect(page.getByText(/changes requested by reviewer/i)).toBeVisible();

  // Submit revisions as appraiser
  await page.getByTestId('button-submit-revisions').click();
  await page.getByTestId('textarea-revision-message').fill('Aligned basis to salePrice; updated narrative.');
  await page.getByTestId('button-confirm-submit-revisions').click();
  await expect(page.getByText(/revisions submitted/i)).toBeVisible();

  // Return to reviewer and approve
  await page.goto('/reviewer/orders/order-123');
  await page.getByRole('tab', { name: /actions/i }).click();
  await page.getByRole('button', { name: /approve order/i }).click();
  await page.getByTestId('button-confirm-approve').click();
  await expect(page.getByText(/approved/i)).toBeVisible();
});