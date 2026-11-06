import Link from "next/link";

import { CheckoutView } from "@/components/checkout/CheckoutView";
import { Wordmark } from "@/components/Logo";
import { buildView, getSession } from "@/lib/checkout";

export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = getSession(id);

  if (!session) {
    return (
      <div className="co-missing">
        <Wordmark size={22} />
        <h1>This checkout does not exist</h1>
        <p>The link may be incomplete, or the merchant may need to create a new one.</p>
        <Link href="/" className="co-link">
          zowall
        </Link>
      </div>
    );
  }

  return <CheckoutView initial={await buildView(session)} />;
}
