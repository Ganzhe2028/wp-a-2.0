import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyStudentSession } from "@/lib/auth";
import Day1Editor from "./Day1Editor";
import { settingEnabled } from "@/lib/event-settings";

export default async function Day1Page() {
  const session = await verifyStudentSession();
  if (!session) redirect("/?next=/day1");
  if (!(await settingEnabled("day1Open"))) redirect("/home");
  const person = await prisma.person.findUnique({ where: { id: session.personId }, select: { code: true, avatarUrl: true, day1SubmittedAt: true, images: { where: { hidden: false }, orderBy: { sort: "asc" }, select: { id: true, url: true, sort: true } } } });
  if (!person) redirect("/");
  return <Day1Editor person={person} />;
}
