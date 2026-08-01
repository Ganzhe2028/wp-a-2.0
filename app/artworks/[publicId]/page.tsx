import { Suspense } from "react";
import { PageLoading } from "@/components/student/AsyncState";
import ArtworkClient from "./ArtworkClient";

export const metadata = { title: "Artwork" };
export default async function ArtworkPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  return <Suspense fallback={<PageLoading label="正在载入作品" />}><ArtworkClient publicId={publicId} /></Suspense>;
}
