/// <reference lib="webworker" />
import { parseBrokerStatement } from "./index";

self.onmessage = async (event: MessageEvent<{ fileName: string; bytes: ArrayBuffer; taxYear: number }>) => {
  try {
    const result = parseBrokerStatement(event.data);
    self.postMessage({ ok: true, result });
  } catch (err) {
    self.postMessage({ ok: false, error: (err as Error).message });
  }
};
