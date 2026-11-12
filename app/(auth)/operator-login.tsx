import { useTranslation } from "react-i18next";
import PhoneEntryScreen from "./phone-entry";

/**
 * Operator Login — thin route wrapper (Node launch Stage 4 / Component C).
 *
 * Renders the shared phone-entry flow with mode="operator".
 * Cross-mode behavior:
 * - Multi-role on either screen → login-as chooser (unchanged).
 * - Single-role on the "wrong" screen → valid role home via existing gate.
 * - Operator Login offers the operator registration path to visitors without
 *   an operator role (the "Register as Operator" link routes to operator-register).
 */
export default function OperatorLoginScreen() {
  const { t } = useTranslation();

  return (
    <PhoneEntryScreen mode="operator" />
  );
}