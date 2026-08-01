import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider, useAuth as useAuthCtx } from "@/lib/auth";
import { Toaster } from "@/components/ui/sonner";
import { ContactVerbotModal } from "@/components/verbo/ContactVerbotModal";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  NotFoundScreen,
  GeneralErrorScreen,
  UnsupportedDeviceScreen,
} from "@/components/verbo/error-screens";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lumina — Modern Learning Platform" },
      { name: "description", content: "A flexible learning platform for live sessions, structured curriculum, and measurable progress." },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700;800&family=Fraunces:opsz,wght@9..144,400;9..144,600&display=swap" },
      { rel: "stylesheet", href: "https://api.fontshare.com/v2/css?f[]=open-sauce-sans@300,400,500,600,700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundScreen,
  errorComponent: RootErrorBoundary,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DeviceGate>
          <PasswordChangeGate>
            <Outlet />
          </PasswordChangeGate>
        </DeviceGate>
        <ContactVerbotModal />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}

function PasswordChangeGate({ children }: { children: React.ReactNode }) {
  const { user } = useAuthCtx();
  const router = useRouter();
  const path = router.state.location.pathname;
  const allowed = path === "/change-password" || path === "/login" || path === "/";
  if (user?.must_change_password && !allowed) {
    return <RedirectToChangePassword />;
  }
  return <>{children}</>;
}

function RedirectToChangePassword() {
  const router = useRouter();
  React.useEffect(() => {
    router.navigate({ to: "/change-password" });
  }, [router]);
  return null;
}

/** Global error boundary for the whole app. */
function RootErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return <GeneralErrorScreen onRefresh={() => { router.invalidate(); reset(); }} />;
}

/** Blocks phone-sized viewports (<768px) for every role, login included. */
function DeviceGate({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  if (isMobile) return <UnsupportedDeviceScreen />;
  return <>{children}</>;
}
