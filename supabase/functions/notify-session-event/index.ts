import { handleSessionNotification } from "./handler.ts";
Deno.serve(req => handleSessionNotification(req));
