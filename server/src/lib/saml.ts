import { SAML, SamlConfig, Profile } from "@node-saml/node-saml";

/**
 * Creates a SAML instance for a specific IdentityProvider config.
 */
export function createSamlProvider(config: {
  entityId: string;
  ssoUrl: string;
  x509Certificate: string;
  callbackUrl: string;
  issuer: string;
}): SAML {
  const samlConfig: SamlConfig = {
    callbackUrl: config.callbackUrl,
    entryPoint: config.ssoUrl,
    issuer: config.issuer, // Our SP entity ID
    idpCert: config.x509Certificate,
    audience: config.issuer, // We expect the audience to be our SP entity ID
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: true,
    // Strict validation
    validateInResponseTo: "never" as any, // We can enforce 'always' if we store request IDs
    disableRequestedAuthnContext: true,
    idpIssuer: config.entityId, // Must match the IdP's entity ID
  };

  return new SAML(samlConfig);
}
