import { Hono } from "hono";
import { cors } from "hono/cors";

import { authApp } from "./auth";
import { stripeApp } from "./stripe";
import { backupApp } from "./backup";

export type Env = {
  APP_URL: string;
  BACKUPS: R2Bucket;
  ACCOUNTS: KVNamespace;
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"]
}));

app.get("/", (c) => c.text("PDV de Bolso API - v1"));

app.route("/auth", authApp);
app.route("/stripe", stripeApp);
app.route("/backup", backupApp);

export default app;
