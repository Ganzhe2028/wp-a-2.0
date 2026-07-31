import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { decideArtworkVisibility } from "@/lib/domain/artwork-access";

interface PageProps {
  params: Promise<{ code: string }>;
}

export function generateMetadata(): Metadata {
  return { title: "页面不存在" };
}

export default async function LegacyLocationPage({ params }: PageProps) {
  const { code } = await params;
  const decision = decideArtworkVisibility("legacy-location", code);

  if (!decision.visible) notFound();
}
