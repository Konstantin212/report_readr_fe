import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth/setup";

export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler(auth);
