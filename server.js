const express = require('express');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs').promises;
const { spawn, exec } = require('child_process');
const { join } = require('path');
const net = require('net');

const app = express();
const port = 3000;
let reportProcess = null;
let playwrightProcess = null;

// Function to check if a port is in use
function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer()
            .once('error', () => resolve(true))
            .once('listening', () => {
                server.close();
                resolve(false);
            })
            .listen(port);
    });
}

// Function to find an available port
async function findAvailablePort(startPort) {
    let port = startPort;
    while (await isPortInUse(port)) {
        port++;
    }
    return port;
}

// Function to kill process on a specific port (Windows and Unix compatible)
function killProcessOnPort(port) {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            exec(`netstat -ano | findstr :${port}`, (error, stdout) => {
                if (stdout) {
                    const lines = stdout.split('\n');
                    const line = lines.find(l => l.includes(':' + port));
                    if (line) {
                        const pid = line.split(/\s+/).pop();
                        exec(`taskkill /F /PID ${pid}`, () => resolve());
                        return;
                    }
                }
                resolve();
            });
        } else {
            exec(`lsof -i :${port} -t`, (error, stdout) => {
                if (stdout) {
                    const pid = stdout.trim();
                    exec(`kill -9 ${pid}`, () => resolve());
                    return;
                }
                resolve();
            });
        }
    });
}

// Clean up function for report server
function cleanupReportServer() {
    if (reportProcess) {
        reportProcess.kill();
        reportProcess = null;
    }
}

// Handle process termination
process.on('SIGINT', () => {
    cleanupReportServer();
    process.exit();
});

process.on('SIGTERM', () => {
    cleanupReportServer();
    process.exit();
});

// Middleware
app.use(express.json());
app.use(express.static('.'));
app.use('/test-report', express.static('playwright-report'));

// Routes
app.post('/terminate-test', (req, res) => {
    if (playwrightProcess) {
        if (process.platform === 'win32') {
            exec(`taskkill /pid ${playwrightProcess.pid} /T /F`, (error) => {
                if (error) {
                    console.error('Error killing process:', error);
                }
            });
        } else {
            process.kill(-playwrightProcess.pid);
        }
    }
    res.sendStatus(200);
});

app.post('/save-test', async (req, res) => {
    try {
        const { code } = req.body;
        
        // Create tests directory if it doesn't exist
        await fsPromises.mkdir('tests', { recursive: true });
        
        // Save the test file
        await fsPromises.writeFile(join('tests', 'generated-test.spec.js'), code);
        
        // Create or update playwright.config.js if it doesn't exist
        const configContent = `
// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['html'], ['line']],
  use: {
    baseURL: 'https://seitrace.com',
    trace: 'on',
    screenshot: 'on',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});`;
        await fsPromises.writeFile('playwright.config.js', configContent);

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/save-code', (req, res) => {
    const { code } = req.body;
    if (!code) {
        return res.status(400).json({ error: 'No code provided' });
    }

    const testFilePath = path.join(__dirname, 'tests', 'generated-test.spec.js');
    
    try {
        // Ensure the tests directory exists
        if (!fs.existsSync(path.join(__dirname, 'tests'))) {
            fs.mkdirSync(path.join(__dirname, 'tests'));
        }

        // Write the code to the file
        fs.writeFileSync(testFilePath, code, 'utf8');
        res.json({ success: true, message: 'Code saved successfully' });
    } catch (error) {
        console.error('Error saving code:', error);
        res.status(500).json({ error: 'Failed to save code' });
    }
});

app.post('/execute-tests', async (req, res) => {
    try {
        const { code, filename } = req.body;
        
        // Create tests directory if it doesn't exist
        await fsPromises.mkdir('tests', { recursive: true });
        
        // Save the test file
        const testFilePath = path.join(__dirname, filename || 'tests/generated-test.spec.js');
        await fsPromises.writeFile(testFilePath, code);
        
        // Execute the test using Playwright's CLI
        const { stdout, stderr } = await new Promise((resolve, reject) => {
            let stdoutData = '';
            let stderrData = '';
            
            // Use spawn with windowsHide option and detached false
            const options = {
                env: { ...process.env, FORCE_COLOR: '0' },
                shell: true
            };

            // On Windows, use different command structure
            let command;
            if (process.platform === 'win32') {
                command = `"${process.env.APPDATA}\\npm\\npx.cmd" playwright test ${testFilePath}`;
            } else {
                command = `npx playwright test ${testFilePath}`;
            }

            const childProcess = exec(command, options, (error) => {
                if (error && error.code !== 1) { // Playwright returns 1 if tests fail, which is normal
                    reject(error);
                } else {
                    resolve({ stdout: stdoutData, stderr: stderrData });
                }
            });
            
            childProcess.stdout.on('data', (data) => {
                stdoutData += data.toString();
            });
            
            childProcess.stderr.on('data', (data) => {
                stderrData += data.toString();
            });
        });
        
        // Parse test results
        const output = stdout + stderr;
        const results = parsePlaywrightOutput(output);
        
        res.json({
            success: true,
            output: output,
            results: results,
            error: results.length === 0 ? 'Failed to execute tests' : null
        });
    } catch (error) {
        console.error('Error executing tests:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            output: error.stderr || error.message
        });
    }
});

// Function to parse Playwright output and extract test results
function parsePlaywrightOutput(output) {
    const results = [];
    const lines = output.split('\n');
    
    // Extract test IDs and results from output
    let currentTest = null;
    
    for (const line of lines) {
        // Match the test title, format: "test-name" or "test-id - test-name"
        const testMatch = line.match(/^\s*(\w+\s+-\s+.+?)\s+\(.*?\)/);
        if (testMatch) {
            const title = testMatch[1];
            const idMatch = title.match(/^(\w+\d+)\s+-/);
            const id = idMatch ? idMatch[1] : null;
            
            if (id) {
                currentTest = { id, passed: false, error: null };
                results.push(currentTest);
            }
        }
        
        // Check if the current test passed
        if (currentTest && line.includes('✓')) {
            currentTest.passed = true;
        }
        
        // Check if the current test failed and extract error message
        if (currentTest && line.includes('✘')) {
            currentTest.passed = false;
            // Try to extract the error message
            const errorMatch = line.match(/✘\s+(.*?)$/);
            if (errorMatch) {
                currentTest.error = errorMatch[1];
            } else {
                currentTest.error = 'Test failed';
            }
        }
    }
    
    // If no tests were found but output indicates errors, return empty array
    // The client will mark all tests as failed
    return results;
}

app.get('/run-playwright-test', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Clean up any existing report server
    cleanupReportServer();

    // Use spawn with windowsHide option and detached false
    const options = {
        env: { ...process.env, FORCE_COLOR: '0' },
        shell: false,
        windowsHide: true,
        detached: false
    };

    // On Windows, use different command structure
    let command, args;
    if (process.platform === 'win32') {
        command = process.env.APPDATA + '\\npm\\npx.cmd';
        args = ['playwright', 'test', '--config=playwright.config.js', 'tests/generated-test.spec.js'];
    } else {
        command = 'npx';
        args = ['playwright', 'test', '--config=playwright.config.js', 'tests/generated-test.spec.js'];
    }

    playwrightProcess = spawn(command, args, options);
    
    let buffer = '';
    let currentTestId = null;
    let hasFailedTests = false;

    function processOutput(data) {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
            // Try to identify test case ID
            const testIdMatch = line.match(/SEITRACE API INSIGHTS\s+(\w+\d+)/);
            if (testIdMatch) {
                currentTestId = testIdMatch[1];
                // Determine test status
                if (line.includes('failed')) {
                    hasFailedTests = true;
                    res.write(`data: ${JSON.stringify({
                        type: 'test-status',
                        testId: currentTestId,
                        status: 'failed',
                        message: line
                    })}\n\n`);
                } else if (line.includes('passed')) {
                    res.write(`data: ${JSON.stringify({
                        type: 'test-status',
                        testId: currentTestId,
                        status: 'passed',
                        message: line
                    })}\n\n`);
                } else {
                    res.write(`data: ${JSON.stringify({
                        type: 'test-status',
                        testId: currentTestId,
                        status: 'running',
                        message: line
                    })}\n\n`);
                }
            } else if (line.trim()) {
                // Send regular output with current test ID if available
                res.write(`data: ${JSON.stringify({
                    type: 'test-output',
                    testId: currentTestId,
                    message: line
                })}\n\n`);
            }
        });
    }

    playwrightProcess.stdout.on('data', (data) => {
        buffer += data.toString();
        processOutput(data);
    });

    playwrightProcess.stderr.on('data', (data) => {
        buffer += data.toString();
        processOutput(data);
    });

    playwrightProcess.on('close', async (code) => {
        // Process any remaining buffer
        if (buffer.trim()) {
            processOutput(buffer);
        }

        try {
            // Kill any process on port 9323
            await killProcessOnPort(9323);
            
            // Find available port starting from 9323
            const reportPort = await findAvailablePort(9323);

            // Start the report server with windowsHide
            const reportOptions = {
                env: { ...process.env, PORT: reportPort.toString() },
                shell: false,
                windowsHide: true,
                detached: false
            };

            // Use the same command structure for report server
            if (process.platform === 'win32') {
                command = process.env.APPDATA + '\\npm\\npx.cmd';
                args = ['playwright', 'show-report', 'playwright-report'];
            } else {
                command = 'npx';
                args = ['playwright', 'show-report', 'playwright-report'];
            }

            reportProcess = spawn(command, args, reportOptions);

            reportProcess.stdout.on('data', (data) => {
                const message = data.toString();
                if (message.includes('started')) {
                    res.write(`data: ${JSON.stringify({
                        type: 'report',
                        url: `http://localhost:${reportPort}`
                    })}\n\n`);
                }
            });

            // Handle report server errors
            reportProcess.on('error', (error) => {
                console.error('Report server error:', error);
                res.write(`data: ${JSON.stringify({
                    type: 'console',
                    message: `[Error] Failed to start report server: ${error.message}`
                })}\n\n`);
            });

        } catch (error) {
            console.error('Error starting report server:', error);
            res.write(`data: ${JSON.stringify({
                type: 'console',
                message: `[Error] Failed to start report server: ${error.message}`
            })}\n\n`);
        }

        res.write(`data: ${JSON.stringify({
            type: 'complete',
            exitCode: code,
            hasFailedTests
        })}\n\n`);
        res.end();
    });

    // Handle client disconnect
    req.on('close', () => {
        if (playwrightProcess) {
            if (process.platform === 'win32') {
                exec(`taskkill /pid ${playwrightProcess.pid} /T /F`);
            } else {
                process.kill(-playwrightProcess.pid);
            }
        }
        cleanupReportServer();
    });
});

// Start server
app.listen(port, () => {
    console.log(`Test generator server running at http://localhost:${port}`);
}); 
