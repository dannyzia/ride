import LegalDocumentScreen from "@/components/LegalDocumentScreen";
import { useTranslation } from "react-i18next";

export default function DriverTerms() {
  const { t } = useTranslation();  return <LegalDocumentScreen type="terms" role="driver" />;
}
