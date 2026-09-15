// Shared network-safety helper.
//
// supabase-js has no built-in timeout on any of its calls. Several places in
// this app used to `await` a Supabase call with nothing bounding how long
// that could take and nothing catching a rejection — a hung request (a flaky
// connection, a momentary backend hiccup) or a thrown error left whatever was
// waiting on it stuck forever: the login button spinning with no way to
// retry, the app-shell skeleton on screen forever after a refresh, or a
// students/teachers list silently frozen on stale/mock data with no error
// shown anywhere (2026-09-15 login-hang + stuck-skeleton + stale-roster fix).
//
// `withTimeout` bounds any promise so callers can always move on — resolve,
// or handle a clear timeout error — instead of hanging indefinitely.
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
