-- Migration for Phase 4.9 SSO Security Boundaries

-- CreateTable
CREATE TABLE "IdentityProvider" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "entityId" TEXT,
    "ssoUrl" TEXT,
    "x509Certificate" TEXT,
    "clientId" TEXT,
    "clientSecretCiphertext" TEXT,
    "issuer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IdentityProvider_organizationId_key" ON "IdentityProvider"("organizationId");

-- AddForeignKey
ALTER TABLE "IdentityProvider" ADD CONSTRAINT "IdentityProvider_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "SsoIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SsoTransaction" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "pkceVerifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SamlAssertionReplay" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "assertionId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SamlAssertionReplay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdpAttributeMapping" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "idpAttribute" TEXT NOT NULL,
    "appAttribute" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdpAttributeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SsoIdentity_providerId_subject_key" ON "SsoIdentity"("providerId", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "SsoTransaction_state_key" ON "SsoTransaction"("state");

-- CreateIndex
CREATE UNIQUE INDEX "SamlAssertionReplay_providerId_assertionId_key" ON "SamlAssertionReplay"("providerId", "assertionId");

-- CreateIndex
CREATE UNIQUE INDEX "IdpAttributeMapping_providerId_idpAttribute_appAttribute_key" ON "IdpAttributeMapping"("providerId", "idpAttribute", "appAttribute");

-- AddForeignKey
ALTER TABLE "SsoIdentity" ADD CONSTRAINT "SsoIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoIdentity" ADD CONSTRAINT "SsoIdentity_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoTransaction" ADD CONSTRAINT "SsoTransaction_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamlAssertionReplay" ADD CONSTRAINT "SamlAssertionReplay_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdpAttributeMapping" ADD CONSTRAINT "IdpAttributeMapping_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "IdentityProvider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

