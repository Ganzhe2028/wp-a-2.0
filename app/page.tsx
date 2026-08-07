import { redirect } from "next/navigation";
import { safeReturnTo } from "@/lib/safe-return-to";

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; returnTo?: string }>;
}) {
  const query = await searchParams;
  const returnTo = safeReturnTo(query.returnTo || query.next, "");
  redirect(returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login");
}
