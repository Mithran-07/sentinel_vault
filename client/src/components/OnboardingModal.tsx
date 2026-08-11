"use client";

import { useState } from "react";

export function OnboardingModal({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: "Welcome to your Vault",
      description: "Your enterprise-grade password manager is ready. Before you start saving passwords, let's quickly review how your data is protected.",
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      )
    },
    {
      title: "Zero-Knowledge Architecture",
      description: "Everything you save is encrypted locally on your device before it's synced. We never see your master password or your unencrypted data.",
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      )
    },
    {
      title: "Monitor Your Security",
      description: "Use the Health Dashboard to identify weak or reused passwords, and check the Audit Log to review all account activity and login attempts.",
      icon: (
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      )
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 transition-all">
      <div className="w-full max-w-lg rounded-3xl border border-border/50 bg-surface p-1 shadow-2xl overflow-hidden">
        <div className="p-8 sm:p-10">
          <div className="flex justify-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center shadow-lg shadow-accent/20">
              {steps[step].icon}
            </div>
          </div>
          
          <div className="text-center min-h-[120px]">
            <h2 className="text-2xl font-bold tracking-tight text-foreground mb-4">{steps[step].title}</h2>
            <p className="text-foreground/70 leading-relaxed">
              {steps[step].description}
            </p>
          </div>
          
          <div className="flex justify-center gap-2 mt-8 mb-10">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-accent' : 'w-2 bg-border'}`}
              />
            ))}
          </div>
          
          <div className="flex items-center justify-between">
            <button 
              onClick={onComplete}
              className="text-sm font-medium text-foreground/50 hover:text-foreground transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleNext}
              className="rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-hover transition-colors shadow-sm"
            >
              {step === steps.length - 1 ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
