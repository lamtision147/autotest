let mcpSessionId = null;
let generatedTestCode = null;

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
    const runButton = document.getElementById('runTestsButton');
    const validationMessage = document.getElementById('validationMessage');
    
    // Clear previous results
    consoleOutput.innerHTML = '';
    testResults.innerHTML = '';
    generatedCode.value = '';
    validationMessage.textContent = '';
    runButton.style.display = 'none';
    
    try {
        // Validate JSON input
        const testCases = JSON.parse(jsonInput);
        
        // Generate Playwright code
        const code = generatePlaywrightCode(testCases);
        generatedCode.value = code;
        generatedTestCode = code;
        
        // Show and setup Run Tests button
        runButton.style.display = 'block';
        runButton.onclick = runGeneratedTests;
        
        // Create test case containers
        testCases.forEach(testCase => {
            if (testCase.ID) {
                const testContainer = createTestCaseElement(testCase.ID);
                testResults.appendChild(testContainer);
            }
        });

        // Start MCP codegen session
        const sessionResponse = await mcpServer.startCodegenSession({
            outputPath: './tests',
            includeComments: true
        });
        mcpSessionId = sessionResponse.sessionId;

        appendConsoleOutput('Test code generated successfully. Click "Run Tests" to execute.');
        
    } catch (error) {
        validationMessage.textContent = `Error: ${error.message}`;
        console.error('Error:', error);
    }
}

function updateTestStatus(testId, status, message) {
    const testContainer = document.getElementById(`test-${testId}`);
    if (testContainer) {
        const statusSpan = testContainer.querySelector('.status');
        const outputDiv = testContainer.querySelector('.test-output');
        
        if (statusSpan) {
            // Don't update status if it's already failed
            if (statusSpan.className.includes('failed') && status !== 'failed') {
                return;
            }
            
            // Update status text and class
            const displayStatus = status.charAt(0).toUpperCase() + status.slice(1);
            statusSpan.textContent = displayStatus;
            statusSpan.className = `status ${status.toLowerCase()}`;
            
            // Add background color to the entire test case based on status
            testContainer.className = `test-case ${status.toLowerCase()}`;
        }
        
        if (outputDiv && message) {
            // Create and append new output line
            const line = document.createElement('div');
            line.className = 'output-line';
            line.textContent = message;
            outputDiv.appendChild(line);
            outputDiv.scrollTop = outputDiv.scrollHeight;
        }
    }
}

function runGeneratedTests() {
  const runButton = document.getElementById('runTestsButton');
  const reportSection = document.getElementById('reportSection');
  const consoleOutput = document.getElementById('consoleOutput');
  
  // Clear previous outputs
  consoleOutput.innerHTML = '';
  
  // Reset all test case statuses to Pending
  document.querySelectorAll('.test-case').forEach(testCase => {
      const statusSpan = testCase.querySelector('.status');
      if (statusSpan) {
          statusSpan.textContent = 'Pending';
          statusSpan.className = 'status pending';
      }
      // Reset test case container class
      testCase.className = 'test-case';
  });
  
  runButton.textContent = 'Running Tests...';
  runButton.disabled = true;
  reportSection.style.display = 'none';

  const eventSource = new EventSource('/run-playwright-test');
  let currentTestId = null;
  
  eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('Received event:', data); // Debug log
      
      // Process the message to extract test information
      const testInfo = processTestMessage(data.message || '');
      
      if (testInfo.testId) {
          // Update test status and output
          updateTestStatus(testInfo.testId, testInfo.status, testInfo.message);
      }
      
      // Check if test execution is complete
      if (testInfo.isComplete) {
          eventSource.close();
          runButton.disabled = false;
          runButton.textContent = 'Run Tests';
          return;
      }
      
      // Always append to console output
      appendConsoleOutput(data.message);
  };
  
  eventSource.onerror = (error) => {
      console.error('EventSource error:', error);
      eventSource.close();
      runButton.disabled = false;
      runButton.textContent = 'Run Tests';
      appendConsoleOutput('Error: Failed to execute tests. Check console for details.');
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
    
    // Check for "Test failed" message
    if (message.includes('Test failed')) {
        const testIdMatch = message.match(/SEITRACE API INSIGHTS › (SAI\d+)/);
        if (testIdMatch) {
            result.testId = testIdMatch[1];
            result.status = 'failed';
            return result;
        }
    }

    // Check for "Test completed successfully" message
    if (message.includes('Test completed successfully')) {
        const testIdMatch = message.match(/SEITRACE API INSIGHTS › (SAI\d+)/);
        if (testIdMatch) {
            result.testId = testIdMatch[1];
            result.status = 'passed';
            return result;
        }
    }

    // Format: [chromium] › tests\generated-test.spec.js:14:9 › SEITRACE API INSIGHTS › SAI02 - Verify user...
    const testMatch = message.match(/› SEITRACE API INSIGHTS › (SAI\d+)/);
    if (testMatch) {
        result.testId = testMatch[1];
        result.status = 'running';
    }

    // Format: 2) [chromium] › ... (indicates a failed test)
    const failureMatch = message.match(/^\s*\d+\)\s+\[chromium\]\s+›.*?›\s+SEITRACE API INSIGHTS\s+›\s+(SAI\d+)/);
    if (failureMatch) {
        result.testId = failureMatch[1];
        result.status = 'failed';
    }

    // Track test failures
    const testFailures = new Map();
    
    // Format: "2 failed" in the summary
    const finalFailedMatch = message.match(/^(\d+)\s+failed/);
    if (finalFailedMatch && !message.includes('›')) {
        // Store the number of failures
        const failureCount = parseInt(finalFailedMatch[1]);
        
        // Find tests that have error messages
        document.querySelectorAll('.test-case').forEach(testCase => {
            const testId = testCase.id.replace('test-', '');
            const outputDiv = testCase.querySelector('.test-output');
            if (outputDiv && outputDiv.textContent.includes('Test failed')) {
                testFailures.set(testId, true);
                updateTestStatus(testId, 'failed', message);
            }
        });
    }

    // Format: "1 passed (31.1s)" in the summary
    const finalPassedMatch = message.match(/(\d+)\s+passed\s+\([\d.]+s\)/);
    if (finalPassedMatch) {
        // Update remaining tests that haven't failed as passed
        document.querySelectorAll('.test-case').forEach(testCase => {
            const testId = testCase.id.replace('test-', '');
            if (!testFailures.has(testId)) {
                updateTestStatus(testId, 'passed', message);
            }
        });
        result.isComplete = true;
    }

    return result;
}

function appendConsoleOutput(message) {
    const consoleOutput = document.getElementById('consoleOutput');
    const line = document.createElement('pre');
    line.className = 'output-line';
    
    // Remove ANSI escape sequences and control characters
    const cleanMessage = message
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // Remove ANSI color codes
        .replace(/\x1b\[([0-9]{1,2}[A-Z])/g, '') // Remove ANSI control sequences
        .replace(/\[([0-9]{1,2}[A-Z])/g, '') // Remove remaining control sequences
        .replace(/\[2K/g, '') // Remove clear line sequences
        .trim();
    
    if (!cleanMessage) return; // Skip empty lines
    
    // Properly encode special characters while preserving formatting
    const encodedMessage = cleanMessage
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    
    line.innerHTML = encodedMessage;
    
    // Add monospace font styling
    line.style.fontFamily = 'Consolas, monospace';
    line.style.whiteSpace = 'pre-wrap';
    line.style.wordBreak = 'break-all';
    line.style.margin = '0';
    line.style.padding = '2px 5px';
    line.style.fontSize = '14px';
    line.style.lineHeight = '1.4';
    
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

async function saveGeneratedCode() {
    const code = document.getElementById('generatedCode').value;
    if (!code) {
        alert('No code to save. Please generate code first.');
        return;
    }
    
    try {
        const response = await fetch('/save-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code })
        });
        
        const result = await response.json();
        if (result.success) {
            alert('Code saved successfully!');
        } else {
            alert(`Failed to save code: ${result.error}`);
        }
    } catch (error) {
        console.error('Error saving code:', error);
        alert(`Error saving code: ${error.message}`);
    }
} 