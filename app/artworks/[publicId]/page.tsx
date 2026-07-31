import { notFound } from "next/navigation";
import { decideArtworkVisibility } from "@/lib/domain/artwork-access";

interface PageProps {
  params: Promise<{ publicId: string }>;
}

export default async function ArtworkPage({ params }: PageProps) {
  const { publicId } = await params;
  const decision = decideArtworkVisibility("artwork", publicId);

  if (!decision.visible) notFound();
}
