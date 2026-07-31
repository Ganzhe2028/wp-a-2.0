import { notFound } from "next/navigation";
import { decideArtworkVisibility } from "@/lib/domain/artwork-access";

interface PageProps {
  params: Promise<{ code: string }>;
}

export default async function LegacyPackagePage({ params }: PageProps) {
  const { code } = await params;
  const decision = decideArtworkVisibility("legacy-package", code);

  if (!decision.visible) notFound();
}
