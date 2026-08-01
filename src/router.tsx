import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Warm up the route chunk while the pointer is still on the tab, so the
    // click swaps pages instantly instead of showing the current page again
    // while its JS chunk downloads.
    defaultPreload: "intent",
    defaultPreloadDelay: 40,
    defaultPreloadStaleTime: 30_000,
    // No pending UI for fast transitions — avoids the "flash of the old page".
    defaultPendingMs: 600,
    defaultPendingMinMs: 200,
  });

  return router;
};
