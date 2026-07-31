import { redirect } from "next/navigation";
import { verifyStudentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import MeEditForm from "./MeEditForm";
import FavoritesList from "./FavoritesList";
import LogoutButton from "./LogoutButton";

interface PageImage {
  id: string;
  url: string;
  sort: number;
}

interface PagePerson {
  id: string;
  code: string;
  englishName: string | null;
  chineseName: string | null;
  grade: string | null;
  bio: string | null;
  avatarUrl: string | null;
  images: PageImage[];
}

export default async function MePage() {
  const session = await verifyStudentSession();
  if (!session) {
    redirect("/?next=/me");
  }

  const person = await prisma.person.findUnique({
    where: { id: session.personId },
    include: {
      images: {
        where: { hidden: false },
        orderBy: { sort: "asc" },
      },
    },
  });

  if (!person) {
    redirect("/?next=/me");
  }

  const personData: PagePerson = {
    id: person.id,
    code: person.code,
    englishName: person.englishName,
    chineseName: person.chineseName,
    grade: person.grade,
    bio: person.bio,
    avatarUrl: person.avatarUrl,
    images: person.images.map((img) => ({
      id: img.id,
      url: img.url,
      sort: img.sort,
    })),
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-stone-100 py-8 px-4">
      <div className="mx-auto max-w-md">
        <MeEditForm person={personData} />
        <div className="mt-6">
          <FavoritesList />
        </div>
        <LogoutButton />
      </div>
    </div>
  );
}