# Example.com Website with Playwright Tests

This project contains a simple example website and automated tests using Playwright with MCP server.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npx playwright install
```

## Running the Tests

To run the tests:
```bash
npm test
```

This will:
1. Start the MCP server on port 8080
2. Run the Playwright tests
3. Show the test results

## Project Structure

- `public/` - Contains the website files
- `tests/` - Contains the Playwright test files
- `mcp-server.js` - MCP server configuration
- `playwright.config.js` - Playwright configuration

## MCP Server Configuration

The MCP server is configured to:
- Run on port 8080
- Serve static files from the public directory
- Handle routes for the example website 