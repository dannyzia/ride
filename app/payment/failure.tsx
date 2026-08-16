import React from "react";
import PaymentResultScreen from "@/components/PaymentResultScreen";

// W-1: redirect target for a failed/cancelled PortPos checkout
// (`${serverUrl}/payment/failure`). Previously 404'd.
export default function PaymentFailureScreen() {
  return <PaymentResultScreen status="failure" />;
}
