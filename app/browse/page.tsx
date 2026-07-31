import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyStudentSession } from "@/lib/auth";
import BrowseClient from "./BrowseClient";
import { settingEnabled } from "@/lib/event-settings";

export default async function BrowsePage({ searchParams }: { searchParams: Promise<{ gate?: string }> }) {
  const session = await verifyStudentSession();
  if (!session) redirect("/?next=/browse");
  if (!(await settingEnabled("navEnabled"))) redirect("/home");
  const [me, people, nameSetting] = await Promise.all([
    prisma.person.findUnique({ where: { id: session.personId }, select: { day1SubmittedAt: true, day3SubmittedAt: true } }),
    prisma.person.findMany({ where: { id: { not: session.personId }, hidden: false, OR: [{ day1SubmittedAt: { not: null } }, { day3SubmittedAt: { not: null } }] }, orderBy: [{ role: "desc" }, { groupName: "asc" }, { createdAt: "asc" }], select: { code: true, chineseName: true, englishName: true, role: true, groupName: true, day1SubmittedAt: true, day3SubmittedAt: true } }),
    prisma.systemSetting.findUnique({ where: { key: "showNames" }, select: { value: true } }),
  ]);
  if (!me) redirect("/");
  const { gate } = await searchParams;
  return <BrowseClient people={people.map((person) => ({ ...person, day1: Boolean(person.day1SubmittedAt), day3: Boolean(person.day3SubmittedAt) }))} day1Unlocked={Boolean(me.day1SubmittedAt)} day3Unlocked={Boolean(me.day3SubmittedAt)} showNames={nameSetting?.value === "true"} forceGate={gate === "1"} />;
}
