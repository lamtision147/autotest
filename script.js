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
    const line = document.createElement('div');
    line.className = 'output-line';
    line.textContent = message;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function generatePlaywrightCode(testCases) {
    // Group testcases by Feature
    const testCasesByFeature = {};
    testCases.forEach(tc => {
        const feature = tc.Feature || 'SEITRACE API INSIGHTS';
        if (!testCasesByFeature[feature]) {
            testCasesByFeature[feature] = [];
        }
        testCasesByFeature[feature].push(tc);
    });
    
    let code = `import { test, expect } from '@playwright/test';\n\n`;
    
    // Generate code for each feature
    Object.entries(testCasesByFeature).forEach(([feature, cases]) => {
        code += `test.describe('${feature}', () => {\n`;
        
        // Process each test case
        cases.forEach(testCase => {
            if (!testCase.ID || !testCase.Title) return;
            
            code += `    test('Testcase: ${testCase.ID} - ${testCase.Title}', async ({ page }) => {\n`;
            
            // Add precondition/description as a comment and console log
            const description = testCase.Description || 'User is in https://seitrace.com/';
            code += `        // Precondition: ${description.split('\n')[0]}\n`;
            code += `        console.log('Precondition: Navigate to Seitrace homepage');\n`;
            code += `        await page.goto('https://seitrace.com/');\n\n`;
            
            // Process test steps and expected results
            const steps = testCase["Test Steps"] ? String(testCase["Test Steps"]).split('\n') : [];
            const stepNos = testCase["Step No."] ? String(testCase["Step No."]).split('\n') : [];
            const expectedResults = testCase["Expected result"] ? String(testCase["Expected result"]).split('\n') : [];
            
            // Create an array to process all steps for this test case
            const processedSteps = [];
            for (let i = 0; i < Math.max(steps.length, stepNos.length); i++) {
                processedSteps.push({
                    stepNo: i < stepNos.length ? stepNos[i] : `${i+1}`,
                    step: i < steps.length ? steps[i] : '',
                    expected: i < expectedResults.length ? expectedResults[i] : ''
                });
            }
            
            // Add each step and verification
            processedSteps.forEach((step, index) => {
                if (!step.step) return;
                
                // Add step comment and console log
                code += `        // Step ${step.stepNo}: ${step.step}\n`;
                code += `        console.log('Step ${step.stepNo}: ${step.step.replace(/'/g, "\\'")}');\n`;
                
                // Handle different action types
                if (step.step.toLowerCase().includes('click on')) {
                    const clickMatch = step.step.match(/click on "([^"]+)"/i);
                    if (clickMatch) {
                        const elementText = clickMatch[1];
                        code += `        await page.waitForSelector('text=${elementText}');\n`;
                        code += `        await page.click('text=${elementText}');\n`;
                    }
                } else if (step.step.toLowerCase().includes('check')) {
                    const checkMatch = step.step.match(/check "([^"]+)"/i);
                    if (checkMatch) {
                        const elementText = checkMatch[1];
                        code += `        const ${elementText.toLowerCase().replace(/[^a-z0-9]/g, '')}Element = await page.locator('text=${elementText}');\n`;
                        code += `        await expect(${elementText.toLowerCase().replace(/[^a-z0-9]/g, '')}Element).toBeVisible();\n`;
                    }
                }
                
                // Add verification if there's an expected result
                if (step.expected) {
                    code += `\n        // Verify Step ${step.stepNo}: ${step.expected}\n`;
                    
                    // URL verification
                    if (step.expected.toLowerCase().includes('url is') || 
                        step.expected.toLowerCase().includes('redirect to')) {
                        const urlMatch = step.expected.match(/(?:url is|redirect to) "([^"]+)"/i);
                        if (urlMatch) {
                            code += `        await expect(page).toHaveURL('${urlMatch[1]}');\n`;
                        }
                    }
                    
                    // Text verification
                    if (step.expected.toLowerCase().includes('display') || 
                        step.expected.toLowerCase().includes('visible') ||
                        step.expected.toLowerCase().includes('see')) {
                        const textMatches = step.expected.match(/"([^"]+)"/g);
                        if (textMatches) {
                            textMatches.forEach(match => {
                                const text = match.replace(/"/g, '');
                                const varName = text.toLowerCase()
                                    .replace(/[^a-z0-9]/g, '')
                                    .substring(0, 15);
                                
                                code += `        const ${varName}Element = await page.locator('text=${text}');\n`;
                                code += `        await expect(${varName}Element).toBeVisible();\n`;
                            });
                        }
                    }
                    
                    // Title verification
                    if (step.expected.toLowerCase().includes('title')) {
                        const titleMatch = step.expected.match(/title is "([^"]+)"/i);
                        if (titleMatch) {
                            code += `        const browserTitle = await page.title();\n`;
                            code += `        await expect(browserTitle).toBe('${titleMatch[1]}');\n`;
                        }
                    }
                    
                    // Viewport verification (for scrolling tests)
                    if (step.expected.toLowerCase().includes('scroll')) {
                        const scrollMatch = step.expected.match(/scroll to "([^"]+)"/i);
                        if (scrollMatch) {
                            const section = scrollMatch[1];
                            code += `        const ${section.toLowerCase().replace(/[^a-z0-9]/g, '')}Section = await page.locator('text=${section}');\n`;
                            code += `        await expect(${section.toLowerCase().replace(/[^a-z0-9]/g, '')}Section).toBeInViewport();\n`;
                        }
                    }
                }
                
                code += '\n';
            });
            
            code += `    });\n\n`;
        });
        
        code += `});\n`;
    });
    
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