import { auth } from "@rexops/auth";
import { Elysia } from "elysia";

export const authRoutes = new Elysia().all("/api/auth/*", ({ request }) => auth.handler(request));
