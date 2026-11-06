import type { Metadata } from "next";

import "./checkout.css";

export const metadata: Metadata = {
  title: "Zowall checkout",
  description: "Pay an invoice the gate has checked against its purchase order and receipt.",
  robots: { index: false },
};

/** The checkout is a standalone page: no navigation, no workspace, nothing to leave through. */
export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <div className="co">{children}</div>;
}
