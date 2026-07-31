import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyStudentSession } from "@/lib/auth";
import { parseDay3Answers } from "@/lib/flow";
import Day3Editor from "./Day3Editor";
import { settingEnabled } from "@/lib/event-settings";

export default async function Day3Page() {
  const session = await verifyStudentSession();
  if (!session) redirect("/?next=/day3");
  if (!(await settingEnabled("day3Open"))) redirect("/home");
  const [person, allowEdit] = await Promise.all([
    prisma.person.findUnique({ where: { id: session.personId }, select: { day3Answers: true, day3SubmittedAt: true } }),
    settingEnabled("allowEdit", false),
  ]);
  if (!person) redirect("/");
  return <Day3Editor initialAnswers={parseDay3Answers(person.day3Answers)} submitted={Boolean(person.day3SubmittedAt)} allowEdit={allowEdit} />;
}
