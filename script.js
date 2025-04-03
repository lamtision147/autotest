let mcpSessionId = null;
let generatedTestCode = null;

// Track test cases and their status globally
const testStatus = new Map();
let lastTestId = null;
let hasError = false;

// Define MCP server functions
const mcpServer = {
    startCodegenSession: async (options) => {
        const response = await fetch('mcp_playwright_mcp_server_claude_start_codegen_session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(options)
        });
        if (!response.ok) {
            throw new Error('Failed to start test session');
        }
        return await response.json();
    },

    navigate: async (options) => {
        const response = await fetch('mcp_playwright_mcp_server_claude_playwright_navigate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(options)
        });
        if (!response.ok) {
            throw new Error('Failed to navigate');
        }
        return await response.json();
    },

    click: async (options) => {
        const response = await fetch('mcp_playwright_mcp_server_claude_playwright_click', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(options)
        });
        if (!response.ok) {
            throw new Error(`Failed to click element: ${options.selector}`);
        }
        return await response.json();
    },

    endCodegenSession: async (options) => {
        const response = await fetch('mcp_playwright_mcp_server_claude_end_codegen_session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(options)
        });
        if (!response.ok) {
            throw new Error('Failed to end test session');
        }
        return await response.json();
    }
};

function createTestCaseElement(testId) {
    const testCase = document.createElement('div');
    testCase.className = 'test-case-container';
    testCase.id = `test-${testId}`;
    
    testCase.innerHTML = `
        <div class="test-header">
            <span class="test-id">${testId}</span>
            <span class="test-status pending">Pending</span>
        </div>
        <div class="test-content">
            <pre class="test-output"></pre>
        </div>
    `;
    
    return testCase;
}

function updateTestCaseStatus(testId, status, output = '') {
    const testCase = document.getElementById(`test-${testId}`);
    if (!testCase) return;

    const statusElement = testCase.querySelector('.test-status');
    const outputElement = testCase.querySelector('.test-output');

    if (status) {
        statusElement.className = `test-status ${status.toLowerCase()}`;
        statusElement.textContent = status;
    }

    if (output) {
        outputElement.textContent += output + '\n';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const generateButton = document.getElementById('generateButton');
    if (generateButton) {
        generateButton.addEventListener('click', generateAndRunTests);
    }
});

async function generateAndRunTests() {
    const jsonInput = document.getElementById('jsonInput').value;
    const consoleOutput = document.getElementById('consoleOutput');
    const testResults = document.getElementById('testResults');
    const generatedCode = document.getElementById('generatedCode');
    const saveButton = document.getElementById('saveCode');
    const runButton = document.getElementById('runTestsButton');
    const validationMessage = document.getElementById('validationMessage');
    
    // Clear all previous results and messages
    consoleOutput.innerHTML = '';
    testResults.innerHTML = '';
    generatedCode.value = '';
    validationMessage.textContent = '';
    validationMessage.style.display = 'none';
    
    // Reset button states
    saveButton.disabled = true;
    runButton.disabled = true;
    
    try {
        // Validate JSON input
        const testCases = JSON.parse(jsonInput);
        
        // Generate Playwright code
        const code = generatePlaywrightCode(testCases);
        generatedCode.value = code;
        generatedTestCode = code;
        
        // Enable Confirm Code button since code was generated successfully
        saveButton.disabled = false;
        
        // Create test case containers and count unique test IDs
        const processedIds = new Set();
        testCases.forEach(testCase => {
            if (testCase.ID && !processedIds.has(testCase.ID)) {
                const testContainer = createTestCaseElement(testCase.ID);
                testResults.appendChild(testContainer);
                processedIds.add(testCase.ID);
            }
        });

        // Update total tests count
        document.getElementById('totalTests').textContent = processedIds.size;
        document.getElementById('passedTests').textContent = '0';
        document.getElementById('failedTests').textContent = '0';
        document.getElementById('pendingTests').textContent = processedIds.size;

    } catch (error) {
        if (error instanceof SyntaxError) {
            validationMessage.textContent = 'Error: Invalid JSON format. Please check your input.';
        } else {
            validationMessage.textContent = `Error: ${error.message}`;
        }
        validationMessage.style.display = 'block';
        console.error('Error:', error);
        
        // Disable buttons on error
        saveButton.disabled = true;
        runButton.disabled = true;
    }
}

function updateTestStatus(testId, status, message) {
    const testContainer = document.getElementById(`test-${testId}`);
    if (testContainer) {
        const statusElement = testContainer.querySelector('.test-status');
        const outputElement = testContainer.querySelector('.test-output');
        
        if (statusElement) {
            // Don't update status if it's already failed
            if (statusElement.className.includes('failed') && status !== 'failed') {
                return;
            }
            
            // Update status text and class
            const displayStatus = status.charAt(0).toUpperCase() + status.slice(1);
            statusElement.textContent = displayStatus;
            statusElement.className = `test-status ${status.toLowerCase()}`;
            
            // Add background color to the entire test case based on status
            testContainer.className = `test-case-container ${status.toLowerCase()}`;
        }
        
        if (outputElement && message) {
            // Create and append new output line
            const line = document.createElement('div');
            line.className = 'output-line';
            if (status === 'passed') {
                line.classList.add('success');
            } else if (status === 'failed') {
                line.classList.add('error');
            }
            line.textContent = message;
            outputElement.appendChild(line);
            outputElement.scrollTop = outputElement.scrollHeight;
        }
    }
}

function runGeneratedTests() {
    const runButton = document.getElementById('runTestsButton');
    const consoleOutput = document.getElementById('consoleOutput');
    
    // Clear previous outputs
    consoleOutput.innerHTML = '';
    
    // Reset all test case statuses to Running
    document.querySelectorAll('.test-case-container').forEach(testCase => {
        const testId = testCase.id.replace('test-', '');
        updateTestStatus(testId, 'Running', '');
    });
    
    runButton.textContent = 'Running Tests...';
    runButton.disabled = true;

    const eventSource = new EventSource('/run-playwright-test');
    
    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Received event:', data);
        
        // Process the message and update UI
        const result = processTestMessage(data.message || '');
        appendConsoleOutput(data.message);
        
        // Close EventSource when tests are complete
        if (result.isComplete) {
            eventSource.close();
            runButton.disabled = false;
            runButton.textContent = 'Run Tests';
        }
    };
    
    eventSource.onerror = (error) => {
        console.error('EventSource error:', error);
        eventSource.close();
        runButton.disabled = false;
        runButton.textContent = 'Run Tests';
        appendConsoleOutput('Error: Failed to execute tests. Check console for details.');
        
        // Mark all running tests as failed on error
        document.querySelectorAll('.test-status.running').forEach(statusElement => {
            const testCase = statusElement.closest('.test-case-container');
            if (testCase) {
                const testId = testCase.id.replace('test-', '');
                updateTestStatus(testId, 'Failed', 'Test execution failed');
            }
        });
    };
}

function processTestMessage(message) {
    // Initialize result object
    const result = {
        testId: null,
        status: null,
        message: message,
        isComplete: false
    };

    // Function to update stats display
    function updateStats() {
        const containers = document.querySelectorAll('.test-case-container');
        let passed = 0, failed = 0, running = 0, pending = 0;
        
        containers.forEach(container => {
            const status = container.querySelector('.test-status').textContent.toLowerCase();
            switch(status) {
                case 'passed': passed++; break;
                case 'failed': failed++; break;
                case 'running': running++; break;
                case 'pending': pending++; break;
            }
        });

        document.getElementById('passedTests').textContent = passed;
        document.getElementById('failedTests').textContent = failed;
        document.getElementById('runningTests').textContent = running;
        document.getElementById('pendingTests').textContent = pending;
    }

    // Check for test case start
    const testStartMatch = message.match(/\[chromium\] › tests\\generated-test\.spec\.js:\d+:\d+ › SEITRACE API INSIGHTS › Testcase: (SAI\d+)/);
    if (testStartMatch) {
        lastTestId = testStartMatch[1];
        hasError = false;
        result.testId = lastTestId;
        result.status = 'running';
        updateTestStatus(lastTestId, 'running', message);
        updateStats();
    }

    // Check for error after a test case
    if (message.includes('Error:') && lastTestId) {
        hasError = true;
        testStatus.set(lastTestId, 'failed');
        result.testId = lastTestId;
        result.status = 'failed';
        updateTestStatus(lastTestId, 'failed', message);
        updateStats();
    }

    // Check for numbered failure (e.g., "1) [chromium] ›...")
    const numberedFailureMatch = message.match(/^\s*\d+\)\s+\[chromium\]\s+›.*?›\s+SEITRACE API INSIGHTS\s+›\s+Testcase:\s+(SAI\d+)/);
    if (numberedFailureMatch) {
        const testId = numberedFailureMatch[1];
        testStatus.set(testId, 'failed');
        result.testId = testId;
        result.status = 'failed';
        updateTestStatus(testId, 'failed', message);
        updateStats();
    }

    // Check for successful test completion (✓)
    if (message.includes('✓') && lastTestId && !hasError) {
        testStatus.set(lastTestId, 'passed');
        result.testId = lastTestId;
        result.status = 'passed';
        updateTestStatus(lastTestId, 'passed', message);
        updateStats();
    }

    // Process final summary
    if (message.includes('failed') || message.includes('passed')) {
        const failedMatch = message.match(/(\d+)\s+failed/);
        const passedMatch = message.match(/(\d+)\s+passed/);

        if (failedMatch || passedMatch) {
            result.isComplete = true;

            // Update all test cases based on tracked status
            document.querySelectorAll('.test-case-container').forEach(testCase => {
                const testId = testCase.id.replace('test-', '');
                if (testStatus.has(testId)) {
                    updateTestStatus(testId, testStatus.get(testId), message);
                } else {
                    // If test wasn't marked as failed, it passed
                    updateTestStatus(testId, 'passed', message);
                }
            });
            
            // Final stats update
            updateStats();
        }
    }

    return result;
}

function appendConsoleOutput(message) {
    const consoleOutput = document.getElementById('consoleOutput');
    const line = document.createElement('pre');
    line.className = 'output-line';
    
    // Keep ANSI color codes but convert them to CSS colors
    let formattedMessage = message
        .replace(/\[2K/g, '') // Remove clear line sequences
        .replace(/\r/g, '\n') // Convert carriage returns to newlines
        .trim();

    // Skip if message is empty after cleaning
    if (!formattedMessage) return;

    // Convert ANSI colors to spans with CSS classes
    formattedMessage = formattedMessage
        .replace(/\x1b\[32m/g, '<span style="color: #2ecc71;">') // Green
        .replace(/\x1b\[31m/g, '<span style="color: #e74c3c;">') // Red
        .replace(/\x1b\[33m/g, '<span style="color: #f1c40f;">') // Yellow
        .replace(/\x1b\[0m/g, '</span>') // Reset
        .replace(/\x1b\[90m/g, '<span style="color: #95a5a6;">') // Gray
        .replace(/\x1b\[[0-9;]*[mG]/g, '</span>'); // Clean up any remaining codes

    // Preserve special characters while maintaining HTML formatting
    formattedMessage = formattedMessage
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    // Restore color spans
    formattedMessage = formattedMessage
        .replace(/&lt;span style="color: #[0-9a-f]{6};"&gt;/g, match => match.replace(/&lt;|&gt;/g, ''))
        .replace(/&lt;\/span&gt;/g, '</span>');

    line.innerHTML = formattedMessage;
    
    // Style improvements
    Object.assign(line.style, {
        fontFamily: 'Consolas, monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        margin: '0',
        padding: '4px 8px',
        fontSize: '14px',
        lineHeight: '1.5',
        borderBottom: '1px solid #333'
    });
    
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function generatePlaywrightCode(testCases) {
    // Group test cases by Feature and ID
    const groupedTests = {};
    testCases.forEach(testCase => {
        if (testCase.Feature) {
            if (!groupedTests[testCase.Feature]) {
                groupedTests[testCase.Feature] = {};
            }
        }
        if (testCase.ID) {
            if (!groupedTests[Object.keys(groupedTests)[0]][testCase.ID]) {
                groupedTests[Object.keys(groupedTests)[0]][testCase.ID] = [];
            }
            groupedTests[Object.keys(groupedTests)[0]][testCase.ID].push(testCase);
        }
    });

    let code = `import { test, expect } from '@playwright/test';\n\n`;

    // Generate test code for each feature
    for (const feature in groupedTests) {
        code += `test.describe('${feature}', () => {\n`;
        
        // Generate test code for each test case ID
        for (const testId in groupedTests[feature]) {
            const steps = groupedTests[feature][testId];
            const mainStep = steps[0]; // Get the first step for title and description
            
            // Escape quotes in title
            const escapedTitle = (mainStep.Title || "").replace(/"/g, '\\"');
            code += `    test('Testcase: ${testId} - ${escapedTitle}', async ({ page }) => {\n`;
            
            // Extract URL from precondition
            if (mainStep.Description) {
                const preconditionLines = mainStep.Description.split('\n');
                preconditionLines.forEach(line => {
                    if (line.includes('Precondition:') || line.includes('User is in')) {
                        // Look for URL pattern with or without trailing characters
                        const urlMatch = line.match(/(https?:\/\/[^\s,]+[^\s,.])/);
                        if (urlMatch) {
                            code += `        // ${line.trim()}\n`;
                            code += `        console.log('Precondition: Navigate to ${urlMatch[1]}');\n`;
                            code += `        await page.goto('${urlMatch[1]}');\n\n`;
                        }
                    }
                });
            }

            // Generate code for each step
            steps.forEach((step, index) => {
                // Escape quotes in test steps
                const escapedSteps = step['Test Steps'].replace(/"/g, '\\"');
                code += `        // Step ${step['Step No.']}: ${escapedSteps}\n`;
                code += `        console.log('Step ${step['Step No.']}: ${escapedSteps}');\n`;
                
                // Generate step execution code
                const stepText = step['Test Steps'].toLowerCase();
                if (stepText.includes('click')) {
                    const buttonText = step['Test Steps'].match(/"([^"]+)"/)?.[1];
                    if (buttonText) {
                        code += `        await page.waitForSelector('text=${buttonText}');\n`;
                        code += `        await page.click('text=${buttonText}');\n`;
                    }
                }

                // Generate verification code
                if (step['Expected result']) {
                    code += `        // Verify Step ${step['Step No.']}: ${step['Expected result'].split('\n').join(' // ')}\n`;
                    const expectedResults = step['Expected result'].split('\n');
                    
                    expectedResults.forEach(result => {
                        if (result.includes('url is')) {
                            const expectedUrl = result.match(/"([^"]+)"/)?.[1];
                            if (expectedUrl) {
                                code += `        await expect(page).toHaveURL('${expectedUrl}');\n`;
                            }
                        }
                        if (result.includes('Title of browser is')) {
                            const expectedTitle = result.match(/"([^"]+)"/)?.[1];
                            if (expectedTitle) {
                                code += `        const browserTitle = await page.title();\n`;
                                code += `        await expect(browserTitle).toBe('${expectedTitle}');\n`;
                            }
                        }
                        if (result.includes('is displayed') || result.includes('is visible')) {
                            const elementText = result.match(/("([^"]+)")/)?.[1];
                            if (elementText) {
                                const elementVar = `element${index}`;
                                code += `        const ${elementVar} = await page.locator('text=${elementText}');\n`;
                                code += `        await expect(${elementVar}).toBeVisible();\n`;
                            }
                        }
                    });
                }
                code += '\n';
            });

            code += '    });\n\n';
        }
        
        code += '});\n';
    }

    return code;
}

// Adding save code functionality
document.addEventListener('DOMContentLoaded', () => {
    const generateButton = document.getElementById('generateButton');
    if (generateButton) {
        generateButton.addEventListener('click', generateAndRunTests);
    }
    
    const saveCodeButton = document.getElementById('saveCode');
    if (saveCodeButton) {
        saveCodeButton.addEventListener('click', saveGeneratedCode);
    }
});

const style = document.createElement('style');
style.textContent = `
    .toast-container {
        position: fixed;
        top: 0;
        right: 20px;
        z-index: 9999;
    }

    .toast {
        position: absolute;
        right: 0;
        padding: 15px 25px;
        background: #2ecc71;
        color: white;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        font-size: 14px;
        opacity: 0;
        transition: all 0.3s ease-in-out;
        display: flex;
        align-items: center;
        min-width: 200px;
    }

    .toast.show {
        opacity: 1;
    }

    .toast.error {
        background: #e74c3c;
    }

    .test-case-container {
        margin: 10px 0;
        border: 1px solid #e0e0e0;
        border-radius: 4px;
        overflow: hidden;
        background: #fff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }

    .test-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 15px;
        background: #f8f9fa;
        border-bottom: 1px solid #e0e0e0;
    }

    .test-id {
        font-weight: bold;
        font-family: 'Consolas', monospace;
        color: #2c3e50;
    }

    .test-status {
        padding: 4px 8px;
        border-radius: 3px;
        font-weight: 500;
        font-size: 0.9em;
    }

    .test-status.running {
        color: #fff;
        background-color: #f39c12;
    }

    .test-status.passed {
        color: #fff;
        background-color: #2ecc71;
    }

    .test-status.failed {
        color: #fff;
        background-color: #e74c3c;
    }

    .test-status.pending {
        color: #fff;
        background-color: #95a5a6;
    }

    .test-content {
        padding: 10px 15px;
        background: #f8f9fa;
    }

    .test-output {
        margin: 0;
        font-family: 'Consolas', monospace;
        font-size: 13px;
        line-height: 1.5;
        color: #2c3e50;
        white-space: pre-wrap;
        word-break: break-word;
    }

    #consoleOutput {
        background: #1e1e1e;
        color: #d4d4d4;
        padding: 10px;
        border-radius: 4px;
        font-family: 'Consolas', monospace';
        height: 400px;
        overflow-y: auto;
        margin: 10px 0;
        border: 1px solid #333;
    }

    #consoleOutput::-webkit-scrollbar {
        width: 12px;
    }

    #consoleOutput::-webkit-scrollbar-track {
        background: #1e1e1e;
        border-radius: 4px;
    }

    #consoleOutput::-webkit-scrollbar-thumb {
        background: #424242;
        border-radius: 4px;
    }

    #consoleOutput::-webkit-scrollbar-thumb:hover {
        background: #4f4f4f;
    }

    .output-line {
        position: relative;
        padding-left: 8px !important;
    }

    .output-line:hover {
        background: #2a2a2a;
    }

    .output-line.error {
        color: #e74c3c;
        background: rgba(231, 76, 60, 0.1);
    }

    .output-line.success {
        color: #2ecc71;
        background: rgba(46, 204, 113, 0.1);
    }

    .test-case-container.passed {
        background-color: rgba(46, 204, 113, 0.1);
    }
    
    .test-case-container.failed {
        background-color: rgba(231, 76, 60, 0.1);
    }
    
    .test-case-container.running {
        background-color: rgba(243, 156, 18, 0.1);
    }

    .output-line {
        padding: 4px 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .output-line:last-child {
        border-bottom: none;
    }
`;
document.head.appendChild(style);

function showToast(message, type = 'success') {
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    // Create new toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    // Add toast to container
    toastContainer.appendChild(toast);

    // Calculate position based on existing toasts
    const existingToasts = toastContainer.querySelectorAll('.toast');
    const offset = (existingToasts.length - 1) * 60; // 60px spacing between toasts
    toast.style.top = `${20 + offset}px`; // Start at 20px from top

    // Trigger reflow and add show class
    toast.offsetHeight;
    toast.classList.add('show');

    // Remove toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
            // Reposition remaining toasts
            const remainingToasts = toastContainer.querySelectorAll('.toast');
            remainingToasts.forEach((t, index) => {
                t.style.top = `${20 + (index * 60)}px`;
            });
            // Remove container if empty
            if (remainingToasts.length === 0) {
                toastContainer.remove();
            }
        }, 300);
    }, 3000);
}

async function saveGeneratedCode() {
    const code = document.getElementById('generatedCode').value;
    if (!code) {
        showToast('No code to save. Please generate code first.', 'error');
        return;
    }
    
    try {
        // Create tests directory if it doesn't exist
        await fetch('/create-tests-dir', {
            method: 'POST'
        });

        // Save the code
        const response = await fetch('/save-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                code: code,
                filename: 'generated-test.spec.js'
            })
        });
        
        if (response.ok) {
            showToast('Code saved successfully!');
            // Enable Run Tests button after successful save
            document.getElementById('runTestsButton').disabled = false;
        } else {
            const error = await response.text();
            throw new Error(error);
        }
    } catch (error) {
        console.error('Error saving code:', error);
        showToast(`Error saving code: ${error.message}`, 'error');
        document.getElementById('runTestsButton').disabled = true;
    }
} 