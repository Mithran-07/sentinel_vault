import * as openidClient from "openid-client";

export async function createOidcClient(config: {
  issuer: string;
  clientId: string;
  clientSecret: string;
}) {
  const issuer = new URL(config.issuer);
  const clientConfig: openidClient.Configuration = await openidClient.discovery(
    issuer,
    config.clientId,
    config.clientSecret
  );

  return clientConfig;
}
