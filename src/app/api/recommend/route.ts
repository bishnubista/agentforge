import { NextResponse } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { recommend } from "@/lib/recommend";

export const runtime = "nodejs";
export const maxDuration = 20;

const requestSchema = z.object({
  query: z.string().trim().min(2).max(500),
  selectedCardIds: z.array(z.string().trim().min(1)).max(20).default([])
});

export async function POST(request: Request) {
  let body: unknown;
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const routeLogger = logger.child({
    requestId,
    route: "POST /api/recommend"
  });

  try {
    body = await request.json();
  } catch (error) {
    routeLogger.warn("Invalid JSON request body", { error });
    return withRequestId(NextResponse.json({ error: "Invalid JSON body.", requestId }, { status: 400 }), requestId);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.flatten().fieldErrors;
    routeLogger.warn("Invalid recommendation request", { issues });
    return withRequestId(
      NextResponse.json(
        {
          error: "Invalid recommendation request.",
          issues,
          requestId
        },
        { status: 400 }
      ),
      requestId
    );
  }

  try {
    routeLogger.info("Recommendation request accepted", {
      queryLength: parsed.data.query.length,
      selectedCardCount: parsed.data.selectedCardIds.length
    });
    const recommendation = await recommend({ ...parsed.data, requestId });
    return withRequestId(NextResponse.json(recommendation), requestId);
  } catch (error) {
    routeLogger.error("Recommendation request failed", { error });
    return withRequestId(
      NextResponse.json(
        {
          error: "Recommendation failed. Try a hackathon fallback product like Patagonia Nano Puff.",
          requestId
        },
        { status: 500 }
      ),
      requestId
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "moneymaker-recommendation-api"
  });
}

function withRequestId(response: NextResponse, requestId: string) {
  response.headers.set("x-request-id", requestId);
  return response;
}
