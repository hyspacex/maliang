import type { MaliangRendererBridge } from "../../preload/index";

declare global {
  interface Window {
    maliang?: MaliangRendererBridge;
  }
}

export {};
