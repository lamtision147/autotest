import { test, expect } from '@playwright/test';

test.describe('SEITRACE API INSIGHTS', () => {
    test('Testcase: SAI01 - Verify user can redirect to \"Seitrace Insights\" screen by click on \"Seitrace Insights\" button on header', async ({ page }) => {
        // 1. User is in https://seitrace.com/
        console.log('Precondition: Navigate to https://seitrace.com/');
        await page.goto('https://seitrace.com/');

        // Step 1: Click on \"Resources\" button on header
        console.log('Step 1: Click on \"Resources\" button on header');
        await page.waitForSelector('text=Resources');
        await page.click('text=Resources');
        // Verify Step 1: Resources is displayed as dropdownlist and have "Seitrace Insights" button
        const element0 = await page.locator('text="Seitrace Insights"');
        await expect(element0).toBeVisible();

        // Step 2: Click on \"Seitrace Insights\" button
        console.log('Step 2: Click on \"Seitrace Insights\" button');
        await page.waitForSelector('text=Seitrace Insights');
        await page.click('text=Seitrace Insights');
        // Verify Step 2: - User redirect to SEITRACE INSIGHTS screen successfully // - url is "https://seitrace.com/insights" // - Title of browser is "Sei Nwtwork APIs (Insights) | Seitrace"
        await expect(page).toHaveURL('https://seitrace.com/insights');
        const browserTitle = await page.title();
        await expect(browserTitle).toBe('Sei Nwtwork APIs (Insights) | Seitrace');

    });

    test('Testcase: SAI02 - Verify user can auto scroll to \"Maximize your potential\" section when click on \"API Pricing Plan\" button', async ({ page }) => {
        // 1. User is in SEITRACE INSIGHTS screen https://seitrace.com/insights?/
        console.log('Precondition: Navigate to https://seitrace.com/insights?/');
        await page.goto('https://seitrace.com/insights?/');

        // Step 1: Click on \"API Pricing Plan\" button
        console.log('Step 1: Click on \"API Pricing Plan\" button');
        await page.waitForSelector('text=API Pricing Plan');
        await page.click('text=API Pricing Plan');
        // Verify Step 1: UI auto scroll to "Maximize your potential" section

    });

    test('Testcase: SAI03 - Verify user can redirect to \"Seitrace Insights Docs\" screen by click on \"Explore Docs\" button', async ({ page }) => {
        // 1. User is in SEITRACE INSIGHTS screen https://seitrace.com/insights?/
        console.log('Precondition: Navigate to https://seitrace.com/insights?/');
        await page.goto('https://seitrace.com/insights?/');

        // Step 1: Click on \"Explore Docs\" button
        console.log('Step 1: Click on \"Explore Docs\" button');
        await page.waitForSelector('text=Explore Docs');
        await page.click('text=Explore Docs');
        // Verify Step 1: - User redirect to Seitrace Insights Docs in current tab successfully // - url is "https://seitrace.com/insights-docs?chain=pacific-1/#plan" // - Title of browser is "Sei Network APIs (Insights) Documents | Seitrace"
        await expect(page).toHaveURL('https://seitrace.com/insights-docs?chain=pacific-1/#plan');
        const browserTitle = await page.title();
        await expect(browserTitle).toBe('Sei Network APIs (Insights) Documents | Seitrace');

    });

});
