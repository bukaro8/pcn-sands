export type EvidenceRelationship = "VERIFIED_NEARBY" | "POSSIBLE_MATCH" | "UNVERIFIED";
export type TimeRelationship = "WITHIN_STATED_WINDOW" | "OUTSIDE_STATED_WINDOW" | "UNKNOWN";
export type DeliveryTimeKind = "SCHEDULED_WINDOW" | "CONFIRMED_TIME" | "UNSPECIFIED";

export type DeliveryEvidenceAnalysis = {
  location: { status: EvidenceRelationship; label: string; detail: string };
  time: { status: TimeRelationship; label: string; detail: string };
  missingFacts: string[];
};

function postcode(value: string | null | undefined) {
  const text = value?.toUpperCase() ?? "";
  const full = text.match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/);
  if (full) return { full: `${full[1]} ${full[2]}`, district: full[1] };
  const district = text.match(/(?:^|[^A-Z0-9])([A-Z]{1,2}\d[A-Z\d]?)(?=$|[^A-Z0-9])/);
  return { full: null, district: district?.[1] ?? null };
}

function normalizedAddress(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/\b[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}\b/gi, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function minutes(value: string | null | undefined): number | null {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

export function extractContraventionTime(notes: string | null | undefined): string | null {
  return notes?.match(/(?:^|\n)Contravention time:\s*(([01]\d|2[0-3]):[0-5]\d)(?:\n|$)/)?.[1] ?? null;
}

export function analyzeDeliveryEvidence(input: {
  pcnLocation: string | null | undefined;
  pcnTime: string | null | undefined;
  deliveryAddress: string | null | undefined;
  deliveryTime: string | null | undefined;
  deliveryTimeEnd: string | null | undefined;
  deliveryTimeKind: string | null | undefined;
}): DeliveryEvidenceAnalysis {
  const missingFacts: string[] = [];
  const pcnAddress = normalizedAddress(input.pcnLocation);
  const deliveryAddress = normalizedAddress(input.deliveryAddress);
  const pcnPostcode = postcode(input.pcnLocation);
  const deliveryPostcode = postcode(input.deliveryAddress);

  let location: DeliveryEvidenceAnalysis["location"];
  if (!pcnAddress || !deliveryAddress) {
    location = { status: "UNVERIFIED", label: "Unverified", detail: "Both the PCN location and delivery address are needed for comparison." };
    missingFacts.push("Confirm the complete PCN location and delivery address.");
  } else if (pcnAddress === deliveryAddress) {
    location = { status: "VERIFIED_NEARBY", label: "Verified nearby", detail: "The reviewed address text matches the PCN location. No distance has been inferred." };
  } else if (pcnPostcode.district && pcnPostcode.district === deliveryPostcode.district) {
    const clue = pcnPostcode.full && pcnPostcode.full === deliveryPostcode.full ? `full postcode ${pcnPostcode.full}` : `postcode district ${pcnPostcode.district}`;
    location = { status: "POSSIBLE_MATCH", label: "Possible match", detail: `The locations share ${clue}, but postcode matching alone does not verify proximity.` };
    missingFacts.push("Confirm that the delivery address was genuinely close to the PCN location before asserting proximity.");
  } else {
    location = { status: "UNVERIFIED", label: "Unverified", detail: "No reliable address or postcode relationship was established." };
    missingFacts.push("Confirm whether the delivery address is related to the PCN location.");
  }

  const pcnTime = minutes(input.pcnTime);
  const start = minutes(input.deliveryTime);
  const end = minutes(input.deliveryTimeEnd);
  const kind = input.deliveryTimeKind as DeliveryTimeKind | null;
  let time: DeliveryEvidenceAnalysis["time"];
  if (pcnTime === null || start === null) {
    time = { status: "UNKNOWN", label: "Unknown", detail: "The PCN time and a reviewed invoice time are both needed for comparison." };
    missingFacts.push("Confirm the PCN time and the invoice's stated delivery time or window.");
  } else if (end !== null && end >= start) {
    const within = pcnTime >= start && pcnTime <= end;
    time = within
      ? { status: "WITHIN_STATED_WINDOW", label: "Within stated window", detail: `The PCN time ${input.pcnTime} falls within ${input.deliveryTime}–${input.deliveryTimeEnd}. This is ${kind === "CONFIRMED_TIME" ? "recorded evidence" : "a scheduled window, not confirmation that delivery occurred"}.` }
      : { status: "OUTSIDE_STATED_WINDOW", label: "Outside stated window", detail: `The PCN time ${input.pcnTime} falls outside ${input.deliveryTime}–${input.deliveryTimeEnd}.` };
    if (within && kind !== "CONFIRMED_TIME") missingFacts.push("Confirm whether the scheduled delivery window reflects the actual delivery activity.");
  } else if (pcnTime === start) {
    time = { status: "WITHIN_STATED_WINDOW", label: "Within stated window", detail: `The PCN time matches the invoice time ${input.deliveryTime}. ${kind === "CONFIRMED_TIME" ? "The invoice marks this as a confirmed time." : "The invoice does not confirm that this was the actual delivery time."}` };
    if (kind !== "CONFIRMED_TIME") missingFacts.push("Confirm whether the invoice time records an actual delivery or only a schedule.");
  } else {
    time = { status: "UNKNOWN", label: "Unknown", detail: "A single invoice time does not define a comparison window." };
    missingFacts.push("Confirm whether the invoice time is an actual delivery time or provide the complete scheduled window.");
  }

  return { location, time, missingFacts: [...new Set(missingFacts)] };
}
