import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
} from "@simplewebauthn/server";
import { challengeManager, StoredPasskeyChallenge } from "./redis";

export const RP_ID = process.env.RP_ID || "localhost";
export const EXPECTED_ORIGIN = process.env.EXPECTED_ORIGIN || "http://localhost:3000";
export const RP_NAME = "ZeroKnowledgeVault";

export async function createPasskeyRegistrationOptions(userId: string, email: string, existingCredentialIds: string[]) {
  const { challenge, challengeId } = await challengeManager.storeChallenge("registration", userId, 300);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: Buffer.from(userId, "utf8"),
    userName: email,
    challenge: Buffer.from(challenge, "base64url"),
    excludeCredentials: existingCredentialIds.map((id) => ({
      id,
      transports: ["internal", "hybrid", "usb", "ble", "nfc"],
    })),
    authenticatorSelection: {
      userVerification: "required", // Mandatory PIN/Biometric verification per enterprise vault security policy
      residentKey: "preferred",
    },
    attestationType: "none",
  });

  return { options, challengeId };
}

export async function verifyPasskeyRegistration(
  challengeId: string,
  response: any,
  userId: string
): Promise<VerifiedRegistrationResponse> {
  const stored: StoredPasskeyChallenge | null = await challengeManager.consumeChallenge(challengeId);

  console.log("---- WEBAUTHN REGISTRATION DIAGNOSTICS ----");
  console.log("Submitted challengeId:", challengeId);
  console.log("Stored challenge:", stored?.challenge);
  if (response?.response?.clientDataJSON) {
    try {
      const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'));
      console.log("Received response challenge:", clientData.challenge);
    } catch (e) {
      console.log("Could not parse clientDataJSON challenge");
    }
  }
  console.log("-------------------------------------------");

  if (!stored) {
    throw new Error("Challenge expired or invalid");
  }

  if (stored.ceremonyType !== "registration" || stored.userId !== userId) {
    throw new Error("Invalid challenge binding or ceremony type");
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: EXPECTED_ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true, // Enforce UV verification check in server attestation payload
  });

  return verification;
}

export async function createPasskeyAuthenticationOptions(userPasskeys?: Array<{ credentialId: string; transports?: string | null }>) {
  const { challenge, challengeId } = await challengeManager.storeChallenge("authentication", undefined, 300);

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    challenge: Buffer.from(challenge, "base64url"),
    allowCredentials: userPasskeys
      ? userPasskeys.map((p) => ({
          id: p.credentialId,
          transports: p.transports ? JSON.parse(p.transports) : undefined,
        }))
      : undefined,
    userVerification: "required", // Mandatory PIN/Biometric verification per enterprise vault security policy
  });

  return { options, challengeId };
}

export async function verifyPasskeyAuthentication(
  challengeId: string,
  response: any,
  userPasskey: { credentialId: string; publicKey: string; signCount: number }
): Promise<VerifiedAuthenticationResponse> {
  const stored: StoredPasskeyChallenge | null = await challengeManager.consumeChallenge(challengeId);

  if (!stored) {
    throw new Error("Challenge expired or invalid");
  }

  if (stored.ceremonyType !== "authentication") {
    throw new Error("Invalid ceremony type for authentication challenge");
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: EXPECTED_ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: userPasskey.credentialId,
      publicKey: Buffer.from(userPasskey.publicKey, "base64url"),
      counter: userPasskey.signCount,
    },
    requireUserVerification: true, // Enforce UV verification check in server assertion payload
  });

  return verification;
}
