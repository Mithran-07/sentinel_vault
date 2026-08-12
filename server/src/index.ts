import "express-async-errors";
import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth";
import sessionRoutes from "./routes/sessions";
import mfaRoutes from "./routes/mfa";
import passkeyRoutes from "./routes/passkeys";
import recoveryRoutes from "./routes/recovery";
import vaultRoutes from "./routes/vault";
import folderRoutes from "./routes/folders";
import auditRoutes from "./routes/audit";
import tagRoutes from "./routes/tags";
import attachmentRoutes from "./routes/attachments";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/auth/sessions", sessionRoutes);
app.use("/api/auth/mfa", mfaRoutes);
app.use("/api/auth/passkeys", passkeyRoutes);
app.use("/api/auth/recovery", recoveryRoutes);
app.use("/api/vault", vaultRoutes);
app.use("/api/vault/items/:itemId/attachments", attachmentRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/tags", tagRoutes);
app.use("/api/audit", auditRoutes);

app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error(err);

  // Prisma unique constraint violation (e.g. duplicate email on register)
  if (typeof err === "object" && err !== null && "code" in err && (err as any).code === "P2002") {
    return res.status(409).json({ error: "A record with this value already exists" });
  }

  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Internal server error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Vault server listening on :${port}`);
});
