/**
 * App-layer ports for the capability registry (architecture-governance:
 * app decides side effects through ports; adapters execute them).
 */
import type { RawDescriptorSource } from "../domain/registry.js";

/** Loads raw descriptor JSON records (files, network, editor-plane feeds). */
export interface DescriptorSource {
  load(): Promise<RawDescriptorSource>;
}

/** Registry service: composes sources → validated registry (single write path). */
export interface RegistryBootstrapper {
  bootstrap(sources: readonly DescriptorSource[]): Promise<import("../contract.js").RegistryLoadResult>;
}
