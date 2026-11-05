import { appConfig } from "@/lib/config";

export const temporaryEvidenceTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function validateTemporaryEvidence(file: File): string | null {
  if (file.size === 0) return "Select an evidence file.";
  if (file.size > appConfig.maxCaptureFileBytes) return "The evidence file is larger than 10 MB.";
  if (!temporaryEvidenceTypes.has(file.type)) return "Use a JPG, PNG, WebP or PDF evidence file.";
  return null;
}
