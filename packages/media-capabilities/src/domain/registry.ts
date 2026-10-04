/**
 * Canonical capability registry (lock P3, spec/capability-model.md §3).
 *
 * Pure in-memory index over git-tracked descriptor files — the single owner
 * of accepted capability state. File loading happens through the app-layer
 * DescriptorSource port; this class never performs IO. The revision counter
 * mirrors the ProviderRegistryView pattern of @zcode/provider.
 */
import { capabilityDescriptorSchema } from "./schema.js";
import type {
  CapabilityDescriptor,
  CapabilityDomain,
  CapabilityRegistryView,
  RegistryLoadError,
  RegistryLoadResult,
} from "./types.js";

export type RawDescriptorSource = readonly { readonly source: string; readonly data: unknown }[];

function freezeView(revision: number, capabilities: readonly CapabilityDescriptor[]): CapabilityRegistryView {
  return Object.freeze({ revision, capabilities: Object.freeze([...capabilities]) });
}

export class CapabilityRegistry {
  #view: CapabilityRegistryView;
  #byId = new Map<string, CapabilityDescriptor>();
  #byDomain = new Map<CapabilityDomain, CapabilityDescriptor[]>();
  #revision = 0;

  constructor(initial: readonly CapabilityDescriptor[] = []) {
    for (const descriptor of initial) this.#accept(descriptor);
    this.#view = freezeView(this.#revision, [...this.#byId.values()]);
  }

  #accept(descriptor: CapabilityDescriptor): void {
    if (this.#byId.has(descriptor.id)) {
      throw new Error(`duplicate capability id: ${descriptor.id}`);
    }
    this.#byId.set(descriptor.id, descriptor);
    const bucket = this.#byDomain.get(descriptor.domain) ?? [];
    bucket.push(descriptor);
    this.#byDomain.set(descriptor.domain, bucket);
    this.#revision += 1;
  }

  /** Single write path: validate + accept one descriptor, bump revision. */
  register(raw: unknown, source = "inline"): { ok: true; descriptor: CapabilityDescriptor } | { ok: false; error: RegistryLoadError } {
    const parsed = capabilityDescriptorSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: { source, message: `descriptor validation failed: ${parsed.error.message}` },
      };
    }
    const descriptor = parsed.data;
    if (this.#byId.has(descriptor.id)) {
      return {
        ok: false,
        error: { source, message: `duplicate capability id: ${descriptor.id}` },
      };
    }
    this.#accept(descriptor);
    this.#view = freezeView(this.#revision, [...this.#byId.values()]);
    return { ok: true, descriptor };
  }

  /** Bulk load — one revision bump, per-source errors reported, never thrown. */
  load(rawSources: RawDescriptorSource): RegistryLoadResult {
    const errors: RegistryLoadError[] = [];
    let loaded = 0;
    for (const { source, data } of rawSources) {
      const result = this.register(data, source);
      if (result.ok) loaded += 1;
      else errors.push(result.error);
    }
    return { ok: errors.length === 0, loaded, errors: Object.freeze(errors) };
  }

  getView(): CapabilityRegistryView {
    return this.#view;
  }

  getCapability(id: string): CapabilityDescriptor | undefined {
    return this.#byId.get(id);
  }

  listCapabilities(): readonly CapabilityDescriptor[] {
    return this.#view.capabilities;
  }

  listByDomain(domain: CapabilityDomain): readonly CapabilityDescriptor[] {
    return this.#byDomain.get(domain) ?? [];
  }
}
