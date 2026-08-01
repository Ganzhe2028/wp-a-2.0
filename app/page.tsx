import { redirect } from "next/navigation";

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; returnTo?: string }>;
}) {
  const query = await searchParams;
  const returnTo = query.returnTo || query.next;
  const safeReturnTo =
    typeof returnTo === "string" &&
    returnTo.startsWith("/") &&
    !returnTo.startsWith("//")
      ? returnTo
      : null;
  redirect(safeReturnTo ? `/login?returnTo=${encodeURIComponent(safeReturnTo)}` : "/login");
}
