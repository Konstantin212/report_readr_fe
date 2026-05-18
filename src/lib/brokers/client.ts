import type { ParsedImport } from "@/lib/domain/types";

export async function parseStatementInWorker(file: File, taxYear: number): Promise<ParsedImport> {
  const bytes = await file.arrayBuffer();
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  return new Promise<ParsedImport>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ ok: boolean; result?: ParsedImport; error?: string }>) => {
      worker.terminate();
      if (e.data.ok && e.data.result) resolve(e.data.result);
      else reject(new Error(e.data.error || "PARSE_FAILED"));
    };
    worker.postMessage({ fileName: file.name, bytes, taxYear }, [bytes]);
  });
}
