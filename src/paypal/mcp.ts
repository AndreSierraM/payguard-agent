/**
 * PayPal MCP endpoint constants.
 *
 * Hackathon rule: use SANDBOX only. Never point clients at production MCP.
 * Docs: https://developer.paypal.com/tools/mcp-server/
 */

/** Sandbox MCP (SSE) — preferred for agent clients that speak SSE. */
export const PAYPAL_MCP_SANDBOX_SSE = "https://mcp.sandbox.paypal.com/sse";

/** Sandbox MCP (streamable HTTP). */
export const PAYPAL_MCP_SANDBOX_HTTP = "https://mcp.sandbox.paypal.com/http";

/** Production MCP — documented for awareness; PayGuard must NOT use these. */
export const PAYPAL_MCP_PROD_SSE = "https://mcp.paypal.com/sse";
export const PAYPAL_MCP_PROD_HTTP = "https://mcp.paypal.com/http";
