import "dotenv/config";
import express from "express";
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

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Vault server listening on :${port}`);
});
