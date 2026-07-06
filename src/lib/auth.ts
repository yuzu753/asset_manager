export class AppPasswordError extends Error {
  constructor() {
    super("アプリのパスワードが正しくありません。");
  }
}

export function requireAppPassword(request: Request) {
  const expected = process.env.APP_PASSWORD?.trim();
  if (!expected) {
    return;
  }

  const actual = request.headers.get("x-app-password")?.trim();
  if (actual !== expected) {
    throw new AppPasswordError();
  }
}

export function getAuthErrorStatus(error: unknown) {
  return error instanceof AppPasswordError ? 401 : undefined;
}
