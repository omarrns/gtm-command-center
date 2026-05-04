import { after } from "next/server";

export function pokeWorker(type: string): void {
  after(async () => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const invokeSecret = process.env.WORKER_INVOKE_SECRET;

    try {
      const response = await fetch(`${appUrl}/api/worker/claim`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(invokeSecret ? { authorization: `Bearer ${invokeSecret}` } : {}),
        },
        body: JSON.stringify({ types: [type] }),
      });

      if (!response.ok) {
        console.error(
          JSON.stringify({
            level: "error",
            msg: "worker poke failed",
            type,
            status: response.status,
          }),
        );
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          level: "error",
          msg: "worker poke failed",
          type,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  });
}
