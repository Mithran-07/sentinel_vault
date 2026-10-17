import "express-async-errors";
import "dotenv/config";
import { getEnvConfig } from "./config/env";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

// Validate mandatory environment variables before mounting routes
const env = getEnvConfig();

import authRoutes from "./routes/auth";
import sessionRoutes from "./routes/sessions";
import mfaRoutes from "./routes/mfa";
import passkeyRoutes from "./routes/passkeys";
import recoveryRoutes from "./routes/recovery";
import vaultRoutes from "./routes/vault";
import folderRoutes from "./routes/folders";
import walletRoutes from "./routes/wallets";
import auditRoutes from "./routes/audit";
import tagRoutes from "./routes/tags";
import attachmentRoutes from "./routes/attachments";
import orgRoutes from "./routes/orgs";
import ssoRoutes, { ssoAuthRouter } from "./routes/sso";
import adminRoutes from "./routes/admin";
import { shareRouter } from "./routes/share";
import { errorHandler } from "./middleware/errorHandler";
import { logger } from "./lib/logger";

const app = express();

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    frameguard: { action: "deny" },
    hidePoweredBy: true,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/auth/sso", ssoAuthRouter);
app.use("/api/auth/sessions", sessionRoutes);
app.use("/api/auth/mfa", mfaRoutes);
app.use("/api/auth/passkeys", passkeyRoutes);
app.use("/api/auth/recovery", recoveryRoutes);
app.use("/api/vault", vaultRoutes);
app.use("/api/vault/items/:itemId/attachments", attachmentRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/wallets", walletRoutes);
app.use("/api/share", shareRouter);
app.use("/api/tags", tagRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/orgs", orgRoutes);
app.use("/api/orgs", ssoRoutes);
app.use("/api/admin", adminRoutes);

// Centralized production-hardened error handler
app.use(errorHandler);

const port = env.PORT;
app.listen(port, () => {
  logger.info(`Vault server listening on :${port}`);
});
