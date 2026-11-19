import { availableProviders, defaultProvider } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ providers: availableProviders(), default: defaultProvider() });
}
