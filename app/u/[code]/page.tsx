import { redirect } from "next/navigation";

/**
 * Legacy predictable profile URLs are retired. Formal works use the opaque
 * `/artworks/{publicId}` route; without an explicit legacy mapping a code must
 * never be guessed into a formal identity.
 */
export default function LegacyProfilePage() {
  redirect("/browse");
}
