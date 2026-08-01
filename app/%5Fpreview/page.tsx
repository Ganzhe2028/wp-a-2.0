import { notFound } from "next/navigation";
import PreviewLauncher from "./PreviewLauncher";

export const metadata = { title: "UI Preview" };
export const dynamic = "force-dynamic";

export default async function UiPreviewPage({ searchParams }: { searchParams: Promise<{ exit?: string }> }) {
  if (process.env.NODE_ENV !== "development") notFound();
  const query = await searchParams;
  return <PreviewLauncher exit={query.exit === "1"} />;
}
