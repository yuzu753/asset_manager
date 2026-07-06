import { NextResponse } from "next/server";
import { getAuthErrorStatus, requireAppPassword } from "@/lib/auth";
import { getAssets } from "@/lib/database";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    requireAppPassword(request);
    const assets = await getAssets();
    return NextResponse.json(assets);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "資産データの読み込みに失敗しました。",
      },
      { status: getAuthErrorStatus(error) ?? 500 },
    );
  }
}
