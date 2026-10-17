import { assertIsolatedTestDatabase } from "../../lib/test-prisma";

describe("assertIsolatedTestDatabase preflight guard", () => {
  it("should reject when URL is empty or undefined", () => {
    expect(() => assertIsolatedTestDatabase("")).toThrow("TEST_DATABASE_URL is not set");
  });

  it("should reject when URL is malformed", () => {
    expect(() => assertIsolatedTestDatabase("not-a-valid-url")).toThrow("Malformed TEST_DATABASE_URL");
  });

  it("should reject invalid protocol", () => {
    expect(() =>
      assertIsolatedTestDatabase("mysql://vault:secret@localhost:3306/vault_test_isolated")
    ).toThrow("Invalid protocol 'mysql:'");

    expect(() =>
      assertIsolatedTestDatabase("http://localhost:5432/vault_test_isolated")
    ).toThrow("Invalid protocol 'http:'");
  });

  it("should reject non-local hosts", () => {
    expect(() =>
      assertIsolatedTestDatabase("postgresql://vault:secret@production-db.internal:5432/vault_test_isolated")
    ).toThrow("Host 'production-db.internal' is not an approved local test host");

    expect(() =>
      assertIsolatedTestDatabase("postgresql://vault:secret@192.168.1.100:5432/vault_test_isolated")
    ).toThrow("Host '192.168.1.100' is not an approved local test host");
  });

  it("should reject when database name does not match expected isolated test database name", () => {
    expect(() =>
      assertIsolatedTestDatabase("postgresql://vault:secret@127.0.0.1:5432/vault")
    ).toThrow("Database name 'vault' does not match expected isolated test database 'vault_test_isolated'");

    expect(() =>
      assertIsolatedTestDatabase("postgresql://vault:secret@localhost:5432/vault_production")
    ).toThrow("Database name 'vault_production' does not match expected isolated test database 'vault_test_isolated'");
  });

  it("should reject substring matching tricks (e.g. vault_test_isolated_prod)", () => {
    expect(() =>
      assertIsolatedTestDatabase("postgresql://vault:secret@127.0.0.1:5432/vault_test_isolated_prod")
    ).toThrow("does not match expected isolated test database");
  });

  it("should accept valid isolated test database URLs on 127.0.0.1 and localhost", () => {
    const url1 = assertIsolatedTestDatabase("postgresql://vault:secret@127.0.0.1:5432/vault_test_isolated");
    expect(url1.hostname).toBe("127.0.0.1");
    expect(url1.pathname).toBe("/vault_test_isolated");

    const url2 = assertIsolatedTestDatabase("postgresql://vault:secret@localhost:5432/vault_test_isolated");
    expect(url2.hostname).toBe("localhost");
    expect(url2.pathname).toBe("/vault_test_isolated");

    const url3 = assertIsolatedTestDatabase("postgres://vault:secret@127.0.0.1:5432/vault_test_isolated?sslmode=disable");
    expect(url3.hostname).toBe("127.0.0.1");
    expect(url3.pathname).toBe("/vault_test_isolated");
  });
});
