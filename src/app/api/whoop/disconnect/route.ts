import { NextResponse } from "next/server";
import { deleteTokens } from "@/lib/whoop/client";

export async function POST() {
  try {
    await deleteTokens();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Disconnect error:", err);
    return NextResponse.json(
      { success: false, error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}
