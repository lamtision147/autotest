const { MCPServer } = require('mcp-server');

// Create MCP server instance
const mcpServer = new MCPServer({
    port: 8080,
    host: 'localhost',
    static: {
        root: './public',
        options: {
            index: false
        }
    },
    routes: {
        '/': {
            method: 'GET',
            handler: (req, res) => {
                res.sendFile('index.html', { root: './public' });
            }
        }
    }
});

// Start MCP server
mcpServer.start().then(() => {
    console.log('MCP Server is running on http://localhost:8080');
}).catch(err => {
    console.error('Failed to start MCP server:', err);
}); 