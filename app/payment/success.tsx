import React from "react";
import PaymentResultScreen from "@/components/PaymentResultScreen";

// W-1: redirect target for every payment flow after a successful PortPos
// checkout (`${serverUrl}/payment/success`). Previously 404'd.
export default function PaymentSuccessScreen() {
  return <PaymentResultScreen status="success" />;
}
