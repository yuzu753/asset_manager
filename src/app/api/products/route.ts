import { NextResponse } from "next/server";
import { DEFAULT_CATEGORY, DEFAULT_CURRENCY } from "@/lib/assets";
import { getAuthErrorStatus, requireAppPassword } from "@/lib/auth";
import { upsertProduct } from "@/lib/database";

export const dynamic = "force-dynamic";

type ProductRequestBody = {
  productId?: unknown;
  name?: unknown;
  category?: unknown;
  currency?: unknown;
  active?: unknown;
};

export async function POST(request: Request) {
  try {
    requireAppPassword(request);
    const body = (await request.json()) as ProductRequestBody;
    const product = await upsertProduct({
      productId:
        typeof body.productId === "string" ? body.productId : undefined,
      name: typeof body.name === "string" ? body.name : "",
      category:
        typeof body.category === "string" ? body.category : DEFAULT_CATEGORY,
      currency:
        typeof body.currency === "string" ? body.currency : DEFAULT_CURRENCY,
      active: typeof body.active === "boolean" ? body.active : true,
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "金融商品の保存に失敗しました。",
      },
      { status: getAuthErrorStatus(error) ?? 400 },
    );
  }
}
