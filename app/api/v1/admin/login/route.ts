import { handleFormalLogin } from "@/lib/server/login-handler";

export async function POST(request: Request) {
  return handleFormalLogin(request, "ADMIN");
}
