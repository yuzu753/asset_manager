export function requireAppPassword(request: Request) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return;
  }

  const actual = request.headers.get("x-app-password");
  if (actual !== expected) {
    throw new Error("アプリのパスワードが正しくありません。");
  }
}
