import { handlePresence, type PresenceEnv } from "../_lib/presence-handler";

export const onRequest: PagesFunction<PresenceEnv> = (context) => {
  return handlePresence(context.request, context.env);
};
