"use client";

import Link from "next/link";
import { Camera, ChevronDown, FilePenLine, Sparkles } from "lucide-react";

import { ChatGptPcnImport } from "@/components/chatgpt-pcn-import";
import { PcnCaptureForm } from "@/components/pcn-capture-form";

type Issuer = { id: string; name: string; type: string };

export function CaptureWorkflows({ issuers }: { issuers: Issuer[] }) {
  return <div className="capture-workflows">
    <details className="capture-step capture-step-primary" name="capture-method" open>
      <summary><span className="capture-step-icon"><Sparkles aria-hidden="true" /></span><span className="capture-step-copy"><span className="capture-step-kicker">1 · Recommended</span><strong>Import from ChatGPT</strong><span>Paste structured details, review, then save.</span></span><ChevronDown aria-hidden="true" className="capture-step-chevron" /></summary>
      <div className="capture-step-body"><ChatGptPcnImport issuers={issuers} /></div>
    </details>
    <details className="capture-step" name="capture-method">
      <summary><span className="capture-step-icon"><Camera aria-hidden="true" /></span><span className="capture-step-copy"><span className="capture-step-kicker">2 · Optional</span><strong>Extract from photograph</strong><span>Use the camera or upload a document for direct extraction.</span></span><ChevronDown aria-hidden="true" className="capture-step-chevron" /></summary>
      <div className="capture-step-body"><PcnCaptureForm issuers={issuers} /></div>
    </details>
    <details className="capture-step" name="capture-method">
      <summary><span className="capture-step-icon"><FilePenLine aria-hidden="true" /></span><span className="capture-step-copy"><span className="capture-step-kicker">3 · Fallback</span><strong>Enter manually</strong><span>Create a case without document extraction.</span></span><ChevronDown aria-hidden="true" className="capture-step-chevron" /></summary>
      <div className="capture-step-body"><p className="capture-manual-note">Use the existing manual form to enter and review the PCN details.</p><Link className="capture-manual-link" href="/pcns/new">Open manual PCN form</Link></div>
    </details>
  </div>;
}
