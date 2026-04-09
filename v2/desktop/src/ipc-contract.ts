import type { RuntimeInfo } from "../../protocol/src/contracts";

export interface DesktopV2Api {
  getRuntimeInfo(): Promise<RuntimeInfo>;
  setRuntimeVersion(version: "v1" | "v2"): Promise<{
    ok: boolean;
    changed: boolean;
    restarting: boolean;
    runtimeVersion: "v1" | "v2";
    reason?: string;
  }>;
  minimizeWindow(): Promise<{ ok: true }>;
  closeWindow(): Promise<{ ok: true }>;
}

export type DesktopV2IpcChannel =
  | "v2:app:get-runtime-info"
  | "v2:app:set-runtime-version"
  | "window:minimize"
  | "window:close";
