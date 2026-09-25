import { getSupportAppConfig } from "@/lib/server/support-apps";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const appId = searchParams.get("appId") ?? request.headers.get("x-hashpass-app-id");
  const config = getSupportAppConfig(appId);

  if (!config) {
    return Response.json({ message: "Unknown or missing appId" }, { status: 404 });
  }

  return Response.json(
    {
      appId: config.appId,
      locale: config.locale,
      position: config.position,
      greeting: config.greeting,
      theme: config.theme,
    },
    { status: 200, headers: { "Cache-Control": "public, max-age=60" } },
  );
}
