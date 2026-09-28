import { withUser } from "@/lib/session";
import { clientState } from "@/lib/state";

export const dynamic = "force-dynamic";

export const GET = withUser(async (ctx) => Response.json(await clientState(ctx)));
