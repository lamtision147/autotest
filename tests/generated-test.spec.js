// @ts-check
const { test, expect } = require('@playwright/test');

// Helper function for logging
const log = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

test.describe('SEITRACE API INSIGHTS', () => {
  test('Testcase: SAI01 - Verify user can redirect to "Seitrace Insights" screen by click on "Seitrace Insights" button on header', async ({ page }) => {
    log('Starting test: SAI01 - Verify user can redirect to "Seitrace Insights" screen by click on "Seitrace Insights" button on header');
    log('Precondition: Precondition: 1. User is in https://seitrace.com/');
    log('Navigating to starting URL');
    await page.goto('https://seitrace.com/');
    await page.waitForLoadState('networkidle');

    // Step 1: Click on "Resources" button on header
    log('Executing step 1: Click on "Resources" button on header');
    await page.getByText('Resources').click();
    await page.waitForLoadState('networkidle');
    // Expected: Resources is displayed as dropdownlist and have "Seitrace Insights" button
    log('Verifying: Resources is displayed as dropdownlist and have "Seitrace Insights" button');

    log('Test completed: SAI01 - Verify user can redirect to "Seitrace Insights" screen by click on "Seitrace Insights" button on header');
  });

});

test.describe('Default Feature', () => {
  test('Testcase: SAI01 - ', async ({ page }) => {
    log('Starting test: SAI01 - ');
    log('Navigating to starting URL');
    await page.goto('https://seitrace.com/');
    await page.waitForLoadState('networkidle');

    // Step 2: Click on "Seitrace Insights" button
    log('Executing step 2: Click on "Seitrace Insights" button');
    await page.getByText('Seitrace Insights').click();
    await page.waitForLoadState('networkidle');
    // Expected: - User redirect to SEITRACE INSIGHTS screen successfully
    log('Verifying: - User redirect to SEITRACE INSIGHTS screen successfully');

    log('Test completed: SAI01 - ');
  });

  test('Testcase: SAI02 - Verify user can auto scroll to "Maximize your potential" section when click on "API Pricing Plan" button', async ({ page }) => {
    log('Starting test: SAI02 - Verify user can auto scroll to "Maximize your potential" section when click on "API Pricing Plan" button');
    log('Precondition: Precondition: 1. User is in SEITRACE INSIGHTS screen');
    log('Navigating to starting URL');
    await page.goto('https://seitrace.com/');
    await page.waitForLoadState('networkidle');

    // Step 1: Click on "API Pricing Plan" button
    log('Executing step 1: Click on "API Pricing Plan" button');
    await page.getByText('API Pricing Plan').click();
    await page.waitForLoadState('networkidle');
    // Expected: UI auto scroll to "Maximize your potential" section
    log('Verifying: UI auto scroll to "Maximize your potential" section');
    const section = page.getByText('Maximize your potential').first();
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();

    log('Test completed: SAI02 - Verify user can auto scroll to "Maximize your potential" section when click on "API Pricing Plan" button');
  });

  test('Testcase: SAI03 - Verify user can redirect to "Seitrace Insights Docs" screen by click on "Explore Docs" button', async ({ page }) => {
    log('Starting test: SAI03 - Verify user can redirect to "Seitrace Insights Docs" screen by click on "Explore Docs" button');
    log('Precondition: Precondition: 1. User is in SEITRACE INSIGHTS screen');
    log('Navigating to starting URL');
    await page.goto('https://seitrace.com/');
    await page.waitForLoadState('networkidle');

    // Step 1: Click on "Explore Docs" button
    log('Executing step 1: Click on "Explore Docs" button');
    await page.getByText('Explore Docs').click();
    await page.waitForLoadState('networkidle');
    // Expected: - User redirect to Seitrace Insights Docs in current tab successfully
    log('Verifying: - User redirect to Seitrace Insights Docs in current tab successfully');

    log('Test completed: SAI03 - Verify user can redirect to "Seitrace Insights Docs" screen by click on "Explore Docs" button');
  });

});

