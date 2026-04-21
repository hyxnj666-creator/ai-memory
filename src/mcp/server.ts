import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools.js";
import { registerResources } from "./resources.js";

export async function startMcpServer(debug = false): Promise<void> {
  const server = new McpServer({
    name: "ai-memory",
    version: "1.5.0",
  });

  registerTools(server, debug);
  registerResources(server, debug);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  if (debug) {
    process.stderr.write("[ai-memory-mcp] Server running on stdio\n");
  }
}
