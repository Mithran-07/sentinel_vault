"use client";

import Link from "next/link";

const FEATURES = [
  { title: "SSO (SAML / OIDC)", detail: "Google Workspace, Entra ID, Okta login for org members." },
  { title: "SCIM provisioning", detail: "Auto-create/deprovision accounts from the HR system." },
  { title: "RBAC / ABAC", detail: "Roles, groups, and attribute-based policies over collections." },
  { title: "Collections & sharing", detail: "Share credential groups (e.g. 'Production AWS') without exposing individual passwords." },
  { title: "SIEM export", detail: "Stream audit events to Splunk / Sentinel / Datadog via JSON/CEF/Syslog." },
  { title: "Just-in-time access", detail: "Time-boxed credential checkout with manager approval." },
];

export default function EnterprisePage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-8">
      <Link href="/vault" className="text-sm text-slate-400 hover:text-slate-200">
        &larr; Back to vault
      </Link>
      <h1 className="mt-4 text-xl font-semibold">Enterprise roadmap</h1>
      <p className="mt-1 text-sm text-slate-500">
        Phase 4 of the build plan. Not implemented in this demo — shown here as the intended surface area
        once the core vault (Phases 0–3) is stable.
      </p>
      <ul className="mt-6 space-y-3">
        {FEATURES.map((f) => (
          <li key={f.title} className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{f.title}</span>
              <span className="rounded-full border border-amber-700 px-2 py-0.5 text-xs text-amber-400">Planned</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">{f.detail}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
