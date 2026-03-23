import { initTRPC } from "@trpc/server";
import { z } from "zod";
import { umamiProxyService } from "./UmamiProxyService.js";

const t = initTRPC.create();

export const umamiRouter = t.router({
  getConfig: t.procedure
    .input(
      z.object({
        websiteId: z.string().optional(),
      }).optional()
    )
    .output(
      z.object({
        websiteId: z.string(),
        apiPath: z.string(),
        scriptPath: z.string(),
        proxyPath: z.string(),
      })
    )
    .query(({ input }) => {
      return umamiProxyService.getConfig(input?.websiteId);
    }),

  getHealth: t.procedure
    .output(
      z.object({
        upstreamReachable: z.boolean(),
        upstreamLatencyMs: z.number().nullable(),
        rateLimitRemaining: z.number(),
        managedWebsites: z.array(z.string()),
      })
    )
    .query(() => {
      return umamiProxyService.getHealth();
    }),
});

export type UmamiRouter = typeof umamiRouter;
