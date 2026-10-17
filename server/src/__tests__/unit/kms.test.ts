import {
  LocalDevKmsProvider,
  AwsKmsProvider,
  KmsConfigurationError,
  setKmsProviderForTesting,
  getKmsProvider,
} from "../../lib/kms";
import { resetEnvConfigForTesting } from "../../config/env";

describe("Batch C: KMS Provider Abstraction & Dev Safety Tests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DATABASE_URL: "postgresql://vault:vault@127.0.0.1:5432/vault?schema=public",
      JWT_ACCESS_SECRET: "access_secret_32_characters_long_for_test",
      JWT_REFRESH_SECRET: "refresh_secret_32_characters_long_for_test",
      MFA_ENCRYPTION_SECRET: "mfa_secret_32_characters_long_for_test!",
    };
    resetEnvConfigForTesting();
    setKmsProviderForTesting(null);
  });

  afterAll(() => {
    process.env = originalEnv;
    resetEnvConfigForTesting();
    setKmsProviderForTesting(null);
  });

  it("1. LocalDevKmsProvider encrypts and decrypts secret with providerId binding", async () => {
    process.env.NODE_ENV = "development";
    const provider = new LocalDevKmsProvider("dev_kms_key_for_local_testing_only_32bytes!");
    const plaintext = "super_secret_oidc_client_secret_xyz123";
    const providerId = "provider-google-oauth-1";

    const ciphertext = await provider.encrypt(providerId, plaintext);
    expect(ciphertext.startsWith("localdev:v1:")).toBe(true);

    const decrypted = await provider.decrypt(providerId, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it("2. LocalDevKmsProvider rejects wrong providerId (AAD mismatch)", async () => {
    process.env.NODE_ENV = "development";
    const provider = new LocalDevKmsProvider("dev_kms_key_for_local_testing_only_32bytes!");
    const plaintext = "secret_value";
    const ciphertext = await provider.encrypt("provider-1", plaintext);

    await expect(provider.decrypt("provider-2", ciphertext)).rejects.toThrow(
      /integrity tag mismatch or invalid provider ID/i
    );
  });

  it("3. LocalDevKmsProvider rejects tampered ciphertext", async () => {
    process.env.NODE_ENV = "development";
    const provider = new LocalDevKmsProvider("dev_kms_key_for_local_testing_only_32bytes!");
    const ciphertext = await provider.encrypt("provider-1", "secret_value");

    const parts = ciphertext.split(":");
    // Tamper with data part
    const tamperedData = parts[4].slice(0, -2) + (parts[4].slice(-2) === "aa" ? "bb" : "aa");
    const tamperedCiphertext = `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}:${tamperedData}`;

    await expect(provider.decrypt("provider-1", tamperedCiphertext)).rejects.toThrow(
      /integrity tag mismatch/i
    );
  });

  it("4. LocalDevKmsProvider rejects tampered auth tag", async () => {
    process.env.NODE_ENV = "development";
    const provider = new LocalDevKmsProvider("dev_kms_key_for_local_testing_only_32bytes!");
    const ciphertext = await provider.encrypt("provider-1", "secret_value");

    const parts = ciphertext.split(":");
    // Tamper with tag
    const tamperedTag = parts[3].slice(0, -2) + (parts[3].slice(-2) === "00" ? "11" : "00");
    const tamperedCiphertext = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedTag}:${parts[4]}`;

    await expect(provider.decrypt("provider-1", tamperedCiphertext)).rejects.toThrow(
      /integrity tag mismatch/i
    );
  });

  it("5. LocalDevKmsProvider rejects AWS production ciphertext", async () => {
    process.env.NODE_ENV = "development";
    const provider = new LocalDevKmsProvider("dev_kms_key_for_local_testing_only_32bytes!");
    const awsCiphertextBase64 = Buffer.from("dummy_aws_kms_binary_blob").toString("base64");

    await expect(provider.decrypt("provider-1", awsCiphertextBase64)).rejects.toThrow(
      /cannot decrypt production AWS KMS ciphertext/i
    );
  });

  it("6. LocalDevKmsProvider is strictly forbidden in production mode", () => {
    process.env.NODE_ENV = "production";
    expect(() => new LocalDevKmsProvider("dev_kms_key_for_local_testing_only_32bytes!")).toThrow(
      /strictly forbidden in production mode/i
    );
  });

  it("7. AwsKmsProvider rejects local dev ciphertext", async () => {
    expect(() => new AwsKmsProvider("us-east-1", "alias/my-key")).not.toThrow();
    const awsProvider = new AwsKmsProvider("us-east-1", "alias/my-key");

    await expect(
      awsProvider.decrypt("provider-1", "localdev:v1:00:11:22")
    ).rejects.toThrow(/cannot decrypt local development ciphertext/i);
  });

  it("8. AwsKmsProvider throws when AWS configuration is missing", () => {
    delete process.env.AWS_REGION;
    delete process.env.AWS_KMS_KEY_ID;

    expect(() => new AwsKmsProvider()).toThrow(KmsConfigurationError);
  });

  it("9. getKmsProvider in production fails closed without AWS KMS configuration", () => {
    process.env.NODE_ENV = "production";
    delete process.env.AWS_REGION;
    delete process.env.AWS_KMS_KEY_ID;

    expect(() => getKmsProvider()).toThrow(KmsConfigurationError);
  });

  it("10. getKmsProvider in development returns LocalDevKmsProvider when AWS is unset", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.AWS_REGION;
    delete process.env.AWS_KMS_KEY_ID;

    const provider = getKmsProvider();
    expect(provider.name).toBe("local-dev-kms");

    const encrypted = await provider.encrypt("test-provider", "secret");
    expect(encrypted.startsWith("localdev:v1:")).toBe(true);
  });
});
