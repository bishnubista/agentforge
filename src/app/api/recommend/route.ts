import { NextResponse } from "next/server";
import { z } from "zod";
import { recommend } from "@/lib/recommend";

export const runtime = "nodejs";
export const maxDuration = 20;

const requestSchema = z.object({
  query: z.string().trim().min(2).max(500),
  selectedCardIds: z.array(z.string().trim().min(1)).max(20).default([])
});

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid recommendation request.",
        issues: parsed.error.flatten().fieldErrors
      },
      { status: 400 }
    );
  }

  try {
    const recommendation = await recommend(parsed.data);
    return NextResponse.json(recommendation);
  } catch {
    return NextResponse.json(
      {
        error: "Recommendation failed. Try a hackathon fallback product like Patagonia Nano Puff."
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "moneymaker-recommendation-api"
  });
}
