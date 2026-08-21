import {
  TERMS_OF_SERVICE,
  PRIVACY_POLICY,
  getLegalContent,
  type LegalDocument,
} from "@/lib/legalContent";

/**
 * Build-time guard for the legal-content gate (Plan 11 / legal copy blocker).
 *
 * lib/legalContent.ts currently holds a GENERIC PROFESSIONAL TEMPLATE
 * (@TODO: Replace with approved legal copy). This suite guarantees that no
 * placeholder markers or stale branding can ship inside the rendered legal
 * text, and that the structure (dates, contacts, bilingual sections) stays
 * complete. If Product/Legal-approved copy lands, keep this suite green.
 */

const PLACEHOLDER_MARKERS = [
  "@PLACEHOLDER",
  "PLACEHOLDER",
  "Pending owner review",
  "pending owner review",
  "Lorem ipsum",
  "TODO",
  "TBD",
  "XXX",
  "goride.com",
  "example.com",
];

function collectStrings(doc: LegalDocument): string[] {
  const strings: string[] = [
    doc.title,
    doc.title_bn,
    doc.contact_email,
    doc.contact_address,
  ];
  for (const s of doc.sections) {
    strings.push(s.title, s.title_bn, s.body, s.body_bn);
  }
  return strings;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

describe("legal content build-time guard", () => {
  const docs: [string, LegalDocument][] = [
    ["TERMS_OF_SERVICE", TERMS_OF_SERVICE],
    ["PRIVACY_POLICY", PRIVACY_POLICY],
  ];

  it.each(docs)("%s contains no placeholder markers", (_name, doc) => {
    for (const str of collectStrings(doc)) {
      for (const marker of PLACEHOLDER_MARKERS) {
        expect(str).not.toContain(marker);
      }
    }
  });

  it.each(docs)("%s has valid effective/revision dates", (_name, doc) => {
    expect(doc.effective_date).toMatch(ISO_DATE);
    expect(doc.revision_date).toMatch(ISO_DATE);
    expect(new Date(doc.revision_date).getTime()).toBeGreaterThanOrEqual(
      new Date(doc.effective_date).getTime(),
    );
  });

  it.each(docs)("%s has a valid contact email and address", (_name, doc) => {
    expect(doc.contact_email).toMatch(EMAIL);
    expect(doc.contact_address.length).toBeGreaterThan(3);
  });

  it.each(docs)("%s has complete bilingual sections", (_name, doc) => {
    expect(doc.sections.length).toBeGreaterThanOrEqual(5);
    for (const section of doc.sections) {
      expect(section.title.trim().length).toBeGreaterThan(0);
      expect(section.title_bn.trim().length).toBeGreaterThan(0);
      expect(section.body.trim().length).toBeGreaterThan(20);
      expect(section.body_bn.trim().length).toBeGreaterThan(20);
    }
  });

  it("getLegalContent returns the right document for both roles", () => {
    expect(getLegalContent("terms", "rider")).toBe(TERMS_OF_SERVICE);
    expect(getLegalContent("terms", "driver")).toBe(TERMS_OF_SERVICE);
    expect(getLegalContent("privacy", "rider")).toBe(PRIVACY_POLICY);
    expect(getLegalContent("privacy", "driver")).toBe(PRIVACY_POLICY);
  });
});
