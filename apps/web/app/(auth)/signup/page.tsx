import { SignUpForm } from "@/components/account/AuthForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Create your Zowall account" };

/**
 * No redirect for someone already signed in. Creating an account signs you in, and
 * the page re-renders right after, so a redirect here would send you to the
 * dashboard before you had seen the API key, which is shown exactly once.
 */
export default async function SignUp({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  return <SignUpForm {...(role ? { initialRole: role } : {})} />;
}
