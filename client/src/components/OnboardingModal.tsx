"use client";

import { useState } from "react";
import { Shield, KeyRound, Activity, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function OnboardingModal({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to Sentinel Vault",
      eyebrow: "ARCHITECTURE BRIEFING",
      description: "An enterprise-grade credential security platform engineered with zero-knowledge cryptographic guarantees. Your plaintext secrets are never seen by any server.",
      icon: Shield,
      accent: "text-accent",
    },
    {
      title: "Client-Side Zero-Knowledge",
      eyebrow: "CRYPTOGRAPHIC DESIGN",
      description: "Your Master Key is derived locally in browser memory via Argon2id. Every credential item is encrypted with AES-256-GCM before transport. The database only ever receives opaque ciphertext.",
      icon: KeyRound,
      accent: "text-uv",
    },
    {
      title: "Security & Threat Posture",
      eyebrow: "CONTINUOUS COMPLIANCE",
      description: "Audit every access event with immutable hash-chained logs, configure passkeys and TOTP factors, and monitor password reuse locally without telemetry leakage.",
      icon: Activity,
      accent: "text-lime",
    },
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const StepIcon = steps[step].icon;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-canvas/85 backdrop-blur-md px-4 animate-fade-in"
    >
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-pop animate-pop-in">
        <div className="flex flex-col items-center text-center">
          {/* Icon Badge */}
          <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-4 shadow-[0_0_24px_-4px_rgb(var(--c-accent)/0.3)]">
            <StepIcon size={26} className={steps[step].accent} />
          </div>

          <div className="eyebrow mb-1.5">{steps[step].eyebrow}</div>
          <h2 className="font-display text-lg font-bold text-fg mb-3">
            {steps[step].title}
          </h2>
          <p className="text-xs text-fg-muted leading-relaxed min-h-[64px] max-w-sm">
            {steps[step].description}
          </p>

          {/* Stepper Dots */}
          <div className="flex items-center gap-1.5 my-6">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? "w-6 bg-accent" : "w-1.5 bg-surface-3"
                }`}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="w-full flex items-center justify-between pt-2">
            <button
              onClick={onComplete}
              className="text-xs text-fg-subtle hover:text-fg transition-colors"
            >
              Skip Introduction
            </button>
            <Button onClick={handleNext} variant="primary" size="sm">
              {step === steps.length - 1 ? (
                <>
                  <span>Enter Vault</span>
                  <Check size={14} className="ml-1" />
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ChevronRight size={14} className="ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
