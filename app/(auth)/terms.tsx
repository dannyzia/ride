import LegalDocumentScreen from "@/components/LegalDocumentScreen";

/**
 * C1-1 (STAGE C1-FIX): public pre-auth Terms of Service — linked from the
 * phone-entry T&C checkbox gate. Renders LegalDocumentScreen from
 * lib/legalContent.ts (no new copy per Copy Truth); role is display-only
 * here since the account does not exist yet.
 */
export default function TermsScreen() {
  return <LegalDocumentScreen type="terms" role="rider" />;
}
