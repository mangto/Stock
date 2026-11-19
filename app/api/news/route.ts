import { getNews } from "@/lib/news";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await getNews();
  return Response.json(data);
}
