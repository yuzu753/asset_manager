import { NextResponse } from "next/server";
import { requireAppPassword } from "@/lib/auth";
import { parseAssetCsv } from "@/lib/csv";
import { importAssets } from "@/lib/database";

export const dynamic = "force-dynamic";

type ImportRequestBody = {
  csv?: unknown;
};

export async function POST(request: Request) {
  try {
    requireAppPassword(request);
    const body = (await request.json()) as ImportRequestBody;
    const csv = typeof body.csv === "string" ? body.csv : "";
    if (!csv.trim()) {
      throw new Error("CSVファイルを選択してください。");
    }

    const imported = parseAssetCsv(csv);
    const result = await importAssets(imported);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "CSVインポートに失敗しました。",
      },
      { status: 400 },
    );
  }
}
