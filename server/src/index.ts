import "express-async-errors";
import "dotenv/config";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import authRoutes from "./routes/auth";
import vaultRoutes from "./routes/vault";
import folderRoutes from "./routes/folders";
import auditRoutes from "./routes/audit";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:3000" }));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/vault", vaultRoutes);
app.use("/api/folders", folderRoutes);
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
