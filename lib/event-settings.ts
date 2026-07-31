import { prisma } from "@/lib/prisma";

export async function settingEnabled(key: string, defaultValue = true) {
  const setting = await prisma.systemSetting.findUnique({ where: { key }, select: { value: true } });
  return setting ? setting.value === "true" : defaultValue;
}