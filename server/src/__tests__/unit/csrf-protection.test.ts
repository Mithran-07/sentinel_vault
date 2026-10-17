import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";

// Mock prisma before importing routes so no real database is needed
jest.mock("../../lib/prisma", () => ({
  prisma: {
    user: {
      findUniqueOrThrow: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    session: {
      update: jest.fn(),
    },
  },
}));

jest.mock("../../lib/audit", () => ({
  recordAuditEvent: jest.fn().mockResolvedValue({ id: "mock_audit_id" }),
}));

// Mock jwt helpers
jest.mock("../../lib/jwt", () => {
  const actual = jest.requireActual("../../lib/jwt");
  return {
    ...actual,
    verifyRefreshToken: jest.fn(),
    signAccessToken: jest.fn(() => "mock_new_access_token"),
    signRefreshToken: jest.fn(() => "mock_new_refresh_token"),
    hashToken: jest.fn(() => "mock_token_hash"),
  };
});

import authRoutes from "../../routes/auth";
import { verifyRefreshToken } from "../../lib/jwt";
import { prisma } from "../../lib/prisma";

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use("/api/auth", authRoutes);

describe("Anti-CSRF Protection Unit Tests (/api/auth/refresh)", () => {
  const dummyCookie = "refreshToken=mock_ambient_refresh_token_value";

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: "user-123",
      email: "test@example.com",
    });
    (prisma.refreshToken.create as jest.Mock).mockResolvedValue({});
    (prisma.session.update as jest.Mock).mockResolvedValue({});
  });

  it("1. Missing X-Requested-With header when cookie is present is rejected with HTTP 403", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", dummyCookie)
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Missing required CSRF protection header");
    expect(verifyRefreshToken).not.toHaveBeenCalled();
  });

  it("2. Invalid X-Requested-With header value is rejected with HTTP 403", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", dummyCookie)
      .set("X-Requested-With", "UnauthorizedCustomHeader")
      .send({});

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Missing required CSRF protection header");
    expect(verifyRefreshToken).not.toHaveBeenCalled();
  });

  it("3. Valid X-Requested-With: SentinelVault header is accepted and completes rotation", async () => {
    (verifyRefreshToken as jest.Mock).mockReturnValue({
      sub: "user-123",
      email: "test@example.com",
      tokenId: "token-123",
    });

    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: "token-123",
      tokenHash: "mock_token_hash",
      usedAt: null,
      revoked: false,
      expiresAt: new Date(Date.now() + 86400000),
      session: { id: "sess-123", revokedAt: null },
    });

    (prisma.refreshToken.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", dummyCookie)
      .set("X-Requested-With", "SentinelVault")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("mock_new_access_token");
    expect(res.body.refreshToken).toBeUndefined(); // Token omitted from JSON body
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("4. Valid X-Requested-With: XMLHttpRequest header is accepted and completes rotation", async () => {
    (verifyRefreshToken as jest.Mock).mockReturnValue({
      sub: "user-123",
      email: "test@example.com",
      tokenId: "token-123",
    });

    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: "token-123",
      tokenHash: "mock_token_hash",
      usedAt: null,
      revoked: false,
      expiresAt: new Date(Date.now() + 86400000),
      session: { id: "sess-123", revokedAt: null },
    });

    (prisma.refreshToken.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", dummyCookie)
      .set("X-Requested-With", "XMLHttpRequest")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("mock_new_access_token");
    expect(res.body.refreshToken).toBeUndefined();
  });

  it("5. Non-ambient refresh via request body does not require X-Requested-With header", async () => {
    (verifyRefreshToken as jest.Mock).mockReturnValue({
      sub: "user-123",
      email: "test@example.com",
      tokenId: "token-123",
    });

    (prisma.refreshToken.findUnique as jest.Mock).mockResolvedValue({
      id: "token-123",
      tokenHash: "mock_token_hash",
      usedAt: null,
      revoked: false,
      expiresAt: new Date(Date.now() + 86400000),
      session: { id: "sess-123", revokedAt: null },
    });

    (prisma.refreshToken.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refreshToken: "mock_body_refresh_token" });

    // Should NOT be rejected with 403 CSRF error because token is not in ambient cookie
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBe("mock_new_access_token");
  });

  it("6. Missing refresh token entirely returns HTTP 400 Bad Request", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Missing refresh token");
  });
});
