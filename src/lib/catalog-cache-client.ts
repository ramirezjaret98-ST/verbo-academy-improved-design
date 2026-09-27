import { supabase } from "@/integrations/supabase/client";
import { createCatalogCache } from "./catalog-cache";

export function authenticatedCatalogCache<T>(name: string) {
  return createCatalogCache<T>(name, {
    subject: async () => {
      const { data } = await supabase.auth.getSession();
      return data.session?.user.id ?? null;
    },
    storage: () => (typeof window === "undefined" ? undefined : window.localStorage),
  });
}
