import LegalDocumentScreen from "@/components/LegalDocumentScreen";
import { useTranslation } from "react-i18next";

export default function DriverPrivacyPolicy() {
  const { t } = useTranslation();  return <LegalDocumentScreen type="privacy" role="driver" />;
}
