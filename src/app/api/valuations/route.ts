import { NextResponse } from "next/server";
import { normaliseDate } from "@/lib/assets";
import { getAuthErrorStatus, requireAppPassword } from "@/lib/auth";
import { upsertValuation } from "@/lib/database";

export const dynamic = "force-dynamic";

type ValuationRequestBody = {
  date?: unknown;
  productId?: unknown;
  amount?: unknown;
  note?: unknown;
};

export async function PUT(request: Request) {
  try {
    requireAppPassword(request);
    const body = (await request.json()) as ValuationRequestBody;
    const rawDate = typeof body.date === "string" ? body.date : "";
    const date = normaliseDate(rawDate);
    const productId =
      typeof body.productId === "string" ? body.productId : "";
    const amount =
      typeof body.amount === "number"
        ? body.amount
        : Number(String(body.amount ?? "").replace(/,/g, ""));

    if (!date) {
      throw new Error("日付は YYYY/MM/DD 形式で入力してください。");
    }
    if (!productId) {
      throw new Error("金融商品を選択してください。");
    }
    if (!Number.isFinite(amount)) {
      throw new Error("評価額を数値で入力してください。");
    }

    const valuation = await upsertValuation({
      date,
      productId,
      amount,
      note: typeof body.note === "string" ? body.note : "",
    });

    return NextResponse.json(valuation);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "評価額の保存に失敗しました。",
      },
      { status: getAuthErrorStatus(error) ?? 400 },
    );
  }
}
