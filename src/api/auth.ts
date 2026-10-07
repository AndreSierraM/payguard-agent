import type { NextFunction, Request, Response } from "express";

export const DEFAULT_DEMO_API_KEY = "payguard-demo-key";

/**
 * Resolve the API key judges / local demo should send as X-API-Key.
 * Defaults to payguard-demo-key so `npm start` works out of the box.
 */
export function resolveApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env.PAYGUARD_API_KEY?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_DEMO_API_KEY;
}

export function requireApiKey(expectedKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("x-api-key") ?? req.header("X-API-Key") ?? "";
    if (!header || header !== expectedKey) {
      res.status(401).json({
        error: "Unauthorized",
        hint: "Send header X-API-Key matching PAYGUARD_API_KEY (default: payguard-demo-key)",
      });
      return;
    }
    next();
  };
}
