/**
 * editor-adapters adapters layer — Node.js port implementations.
 *
 * The ONLY place in this package that touches node:child_process / node:fs /
 * node:crypto. Everything above (app/domain) sees ports only.
 */

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, constants as fsConstants, copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  ArtifactStorePort,
  BinaryProbe,
  EditorAdapterContext,
  FsPort,
  ProcessPort,
  ProcessResult,
  PutArtifactMeta,
  SpawnedProcess,
  StoredArtifact,
} from "../app/ports.js";
import type { ArtifactDescriptor } from "@gen/timeline";

export class NodeProcessPort implements ProcessPort {
  /**
   * Child env for spawn: when a cwd is set, PWD must match it — children
   * that resolve relative paths against the inherited $PWD (Blender 4.3.2
   * resolves a relative --python path against $PWD, not getcwd()) would
   * otherwise read the parent's working directory.
   */
  private spawnEnv(cwd?: string): NodeJS.ProcessEnv {
    return cwd === undefined ? process.env : { ...process.env, PWD: cwd };
  }

  async run(command: string, args: readonly string[], options?: { cwd?: string; timeoutMs?: number }): Promise<ProcessResult> {
    const started = Date.now();
    return new Promise<ProcessResult>((resolve) => {
      const child = spawn(command, args, { cwd: options?.cwd, env: this.spawnEnv(options?.cwd), stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      const timer =
        options?.timeoutMs === undefined
          ? undefined
          : setTimeout(() => {
              child.kill("SIGKILL");
            }, options.timeoutMs);
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        if (timer !== undefined) clearTimeout(timer);
        resolve({ command, args, exitCode: -1, stdout, stderr: `${stderr}${String(error)}`, durationMs: Date.now() - started });
      });
      child.on("close", (code) => {
        if (timer !== undefined) clearTimeout(timer);
        resolve({ command, args, exitCode: code ?? -1, stdout, stderr, durationMs: Date.now() - started });
      });
    });
  }

  async start(command: string, args: readonly string[], options?: { cwd?: string }): Promise<SpawnedProcess> {
    const started = Date.now();
    const child = spawn(command, args, { cwd: options?.cwd, env: this.spawnEnv(options?.cwd), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let exited = false;
    let exitCode: number | null = null;
    const completion = new Promise<ProcessResult>((resolve) => {
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("error", (error) => {
        exited = true;
        exitCode = -1;
        resolve({ command, args, exitCode: -1, stdout, stderr: `${stderr}${String(error)}`, durationMs: Date.now() - started });
      });
      child.on("close", (code) => {
        exited = true;
        exitCode = code ?? -1;
        resolve({ command, args, exitCode: code ?? -1, stdout, stderr, durationMs: Date.now() - started });
      });
    });
    return {
      get hasExited() {
        return exited;
      },
      get exitCode() {
        return exitCode;
      },
      kill: () => {
        child.kill("SIGTERM");
      },
      completion,
    };
  }
}

export class NodeFsPort implements FsPort {
  async readFile(filePath: string): Promise<string> {
    return readFile(filePath, "utf8");
  }

  async readBinary(filePath: string): Promise<Uint8Array> {
    const buffer = await readFile(filePath);
    return new Uint8Array(buffer);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }

  async mkdirp(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  async exists(target: string): Promise<boolean> {
    try {
      await stat(target);
      return true;
    } catch {
      return false;
    }
  }

  async listDir(dir: string): Promise<readonly string[]> {
    try {
      return await readdir(dir);
    } catch {
      return [];
    }
  }

  join(...parts: readonly string[]): string {
    return path.join(...parts);
  }
}

/**
 * Binary probe: env override first (GEN_EDITOR_<NAME>_BIN — names documented
 * in README, values never in the repo, lock P8), then a PATH scan.
 */
export class NodeBinaryProbe implements BinaryProbe {
  private readonly cache = new Map<string, string | undefined>();

  async resolveBinary(name: string): Promise<string | undefined> {
    const cached = this.cache.get(name);
    if (cached !== undefined) return cached;
    const envName = `GEN_EDITOR_${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_BIN`;
    const override = process.env[envName];
    if (override !== undefined && override.length > 0) {
      this.cache.set(name, override);
      return override;
    }
    const pathDirs = (process.env.PATH ?? "").split(path.delimiter).filter((dir) => dir.length > 0);
    for (const dir of pathDirs) {
      const candidate = path.join(dir, name);
      try {
        await access(candidate, fsConstants.X_OK);
        this.cache.set(name, candidate);
        return candidate;
      } catch {
        continue;
      }
    }
    this.cache.set(name, undefined);
    return undefined;
  }

  async hasBinary(name: string): Promise<boolean> {
    return (await this.resolveBinary(name)) !== undefined;
  }
}

/** Content-addressed working store: blobs/<sha256> + index/<artifactId>.json. */
export class LocalArtifactStore implements ArtifactStorePort {
  constructor(private readonly root: string) {}

  async put(content: string, mediaType: string, meta: PutArtifactMeta): Promise<ArtifactDescriptor> {
    return this.putBinary(new TextEncoder().encode(content), mediaType, meta);
  }

  async putBinary(content: Uint8Array, mediaType: string, meta: PutArtifactMeta): Promise<ArtifactDescriptor> {
    const hex = createHash("sha256").update(content).digest("hex");
    const artifactId = `art.${hex.slice(0, 32)}`;
    const blobPath = path.join(this.root, "blobs", hex);
    await mkdir(path.dirname(blobPath), { recursive: true });
    await writeFile(blobPath, content);
    const descriptor: ArtifactDescriptor = {
      artifactId,
      contentAddress: `sha256:${hex}`,
      mediaType,
      producedBy: meta.producedBy,
      derivedFrom: meta.derivedFrom,
      timelineRef: meta.timelineRef,
      metadata: meta.metadata,
      storage: { storeRef: blobPath, sizeBytes: content.byteLength },
    };
    const indexPath = path.join(this.root, "index", `${artifactId}.json`);
    await mkdir(path.dirname(indexPath), { recursive: true });
    await writeFile(indexPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
    return descriptor;
  }

  async get(artifactId: string): Promise<StoredArtifact | undefined> {
    try {
      const raw = await readFile(path.join(this.root, "index", `${artifactId}.json`), "utf8");
      const descriptor = JSON.parse(raw) as ArtifactDescriptor;
      const content = await readFile(path.join(this.root, "blobs", descriptor.contentAddress.slice("sha256:".length)), "utf8");
      return { descriptor, content };
    } catch {
      return undefined;
    }
  }

  async materialize(artifactId: string, targetDir: string, preferredExtension?: string): Promise<string | undefined> {
    try {
      const raw = await readFile(path.join(this.root, "index", `${artifactId}.json`), "utf8");
      const descriptor = JSON.parse(raw) as ArtifactDescriptor;
      const source = path.join(this.root, "blobs", descriptor.contentAddress.slice("sha256:".length));
      const target = path.join(targetDir, `${artifactId}.${preferredExtension ?? "bin"}`);
      await mkdir(targetDir, { recursive: true });
      await copyFile(source, target);
      return target;
    } catch {
      return undefined;
    }
  }
}

/** Default production wiring of the adapter context over Node ports. */
export function createNodeAdapterContext(workingRoot: string): EditorAdapterContext {
  return {
    process: new NodeProcessPort(),
    fs: new NodeFsPort(),
    artifacts: new LocalArtifactStore(path.join(workingRoot, "artifact-store")),
    binaries: new NodeBinaryProbe(),
    workingRoot: path.join(workingRoot, "projects"),
  };
}
