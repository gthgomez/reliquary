import { z } from "zod";

const SCHEMA_VERSION = "1.7.0";
const MAX_ATLAS_EDGE = 4096;
const MAX_ATLAS_BYTES = 32 * 1024 * 1024;
const MAX_JSON_BYTES = 512 * 1024;
const MAX_TOTAL_FRAMES = 1024;
const MEMBERS = ["atlas.png", "provenance.json", "sprite.runtime.json"] as const;
const ALL_MEMBERS = [...MEMBERS, "integrity.json"] as const;
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

const id = z.string().regex(/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const edge = z.number().int().min(1).max(MAX_ATLAS_EDGE);
const MAX_FRAME_MS = 60_000;
const frameDuration = z.number().min(0.001).max(MAX_FRAME_MS);
const offset = z.number().min(-MAX_ATLAS_EDGE).max(MAX_ATLAS_EDGE);
const point = z.tuple([offset, offset]);
const disposition = z.enum(["UNREVIEWED", "ACCEPT", "WARN_CONDITIONAL", "REJECT"]);

const frame = z.strictObject({
  index: z.number().int().nonnegative(),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: edge,
  h: edge,
  duration_ms: frameDuration,
  offset_x: offset,
  offset_y: offset,
});

const animation = z.strictObject({
  state: id,
  loop: z.boolean(),
  fps: z.number().nonnegative(),
  duration_ms: z
    .number()
    .min(0.001)
    .max(MAX_FRAME_MS * MAX_TOTAL_FRAMES),
  review_disposition: disposition,
  logical_pivot: point,
  gameplay_root: point,
  events: z
    .array(
      z.strictObject({
        frame: z.number().int().nonnegative(),
        name: z.string().min(1).max(128),
        payload: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .max(MAX_TOTAL_FRAMES),
  frames: z.array(frame).min(1).max(MAX_TOTAL_FRAMES),
});

const manifestSchema = z.strictObject({
  schema_version: z.literal(SCHEMA_VERSION),
  asset_id: id,
  subject_id: id,
  direction: id,
  runtime_status: z.literal("PREVIEW_ONLY"),
  atlas: z.strictObject({ file: z.literal("atlas.png"), width: edge, height: edge, sha256: hash }),
  cell_dimensions: z.tuple([edge, edge]),
  animations: z.record(id, animation),
});

const provenanceSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  asset_id: id,
  candidate_pack_id: z.string().min(1).max(256),
  runtime_status: z.literal("PREVIEW_ONLY"),
  dispositions: z.record(id, disposition),
  frame_counts: z.record(id, z.number().int().positive()),
});

const integritySchema = z.strictObject({
  schema_version: z.literal(SCHEMA_VERSION),
  files: z.strictObject({
    "atlas.png": hash,
    "provenance.json": hash,
    "sprite.runtime.json": hash,
  }),
  total_files: z.literal(MEMBERS.length),
  package_digest: hash,
});

export type PreviewAnimation = z.infer<typeof animation>;
export type PreviewFrame = z.infer<typeof frame>;
export type PreviewManifest = z.infer<typeof manifestSchema>;
export type ValidatedPreviewPackage = {
  atlas: File;
  digest: string;
  candidateId: string;
  manifest: PreviewManifest;
};

type ErrorCode =
  | "INVALID_FILES"
  | "INVALID_SCHEMA"
  | "UNSUPPORTED_SCHEMA"
  | "INVALID_DIGEST"
  | "STALE_PACKAGE"
  | "HASH_MISMATCH"
  | "INVALID_FRAME"
  | "INVALID_ATLAS";

export class PreviewPackageError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "PreviewPackageError";
  }
}

function parseJson<T>(schema: z.ZodType<T>, bytes: ArrayBuffer, name: string): T {
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new PreviewPackageError("INVALID_SCHEMA", `${name} is not valid UTF-8 JSON.`);
  }
  if (
    typeof raw === "object" &&
    raw !== null &&
    "schema_version" in raw &&
    raw.schema_version !== SCHEMA_VERSION
  ) {
    throw new PreviewPackageError(
      "UNSUPPORTED_SCHEMA",
      `${name} must use AGES schema ${SCHEMA_VERSION}.`,
    );
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new PreviewPackageError(
      "INVALID_SCHEMA",
      `${name} ${issue?.path.join(".") || "root"}: ${issue?.message}`,
    );
  }
  return result.data;
}

async function sha256(bytes: ArrayBuffer | Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateAtlas(bytes: ArrayBuffer, atlas: PreviewManifest["atlas"]): void {
  const header = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 24));
  if (
    header.length < 24 ||
    !pngSignature.every((byte, i) => header[i] === byte) ||
    String.fromCharCode(...header.subarray(12, 16)) !== "IHDR"
  ) {
    throw new PreviewPackageError("INVALID_ATLAS", "Atlas is not a PNG.");
  }
  const view = new DataView(bytes);
  if (
    view.getUint32(8) !== 13 ||
    view.getUint32(16) !== atlas.width ||
    view.getUint32(20) !== atlas.height
  ) {
    throw new PreviewPackageError(
      "INVALID_ATLAS",
      "PNG header dimensions disagree with the manifest.",
    );
  }
}

function validateAnimations(
  manifest: PreviewManifest,
  provenance: z.infer<typeof provenanceSchema>,
): void {
  const { animations, atlas } = manifest;
  const states = Object.keys(animations);
  if (
    states.length === 0 ||
    Object.keys(provenance.frame_counts).length !== states.length ||
    Object.keys(provenance.dispositions).length !== states.length ||
    provenance.asset_id !== manifest.asset_id
  ) {
    throw new PreviewPackageError(
      "INVALID_SCHEMA",
      "Manifest and provenance identify different assets or states.",
    );
  }
  let totalFrames = 0;
  for (const [name, clip] of Object.entries(animations)) {
    totalFrames += clip.frames.length;
    if (
      totalFrames > MAX_TOTAL_FRAMES ||
      name !== clip.state ||
      provenance.frame_counts[name] !== clip.frames.length ||
      provenance.dispositions[name] !== clip.review_disposition ||
      clip.frames.some(
        (rect, i) =>
          rect.index !== i || rect.x + rect.w > atlas.width || rect.y + rect.h > atlas.height,
      ) ||
      clip.events.some((event) => event.frame >= clip.frames.length)
    ) {
      throw new PreviewPackageError(
        "INVALID_FRAME",
        `Animation ${name} has inconsistent frames or events.`,
      );
    }
    const sum = clip.frames.reduce((total, rect) => total + rect.duration_ms, 0);
    // AGES rounds the accumulated duration and each frame independently to three decimal places.
    if (Math.abs(sum - clip.duration_ms) > (clip.frames.length + 1) * 0.0005 + 1e-7) {
      throw new PreviewPackageError(
        "INVALID_FRAME",
        `Animation ${name} duration disagrees with its frame timing.`,
      );
    }
  }
}

/** Validate the four files selected by the user. No path from the package is resolved or fetched. */
export async function validateRuntimePackage(
  files: readonly File[],
  expectedDigest: string,
): Promise<ValidatedPreviewPackage> {
  const pinned = expectedDigest.trim().toLowerCase();
  if (!hash.safeParse(pinned).success) {
    throw new PreviewPackageError(
      "INVALID_DIGEST",
      "Enter the package SHA-256 from the trusted AGES export result.",
    );
  }
  const selected = new Map(files.map((file) => [file.name, file]));
  if (
    files.length !== ALL_MEMBERS.length ||
    !ALL_MEMBERS.every((name) => {
      const file = selected.get(name);
      return (
        file &&
        file.size > 0 &&
        file.size <= (name === "atlas.png" ? MAX_ATLAS_BYTES : MAX_JSON_BYTES)
      );
    })
  ) {
    throw new PreviewPackageError(
      "INVALID_FILES",
      "Select exactly the four AGES runtime files within the file size limits.",
    );
  }
  const read = (name: string) => selected.get(name)!.arrayBuffer();
  const integrity = parseJson(integritySchema, await read("integrity.json"), "integrity.json");
  if (integrity.package_digest !== pinned) {
    throw new PreviewPackageError(
      "STALE_PACKAGE",
      "The selected package does not match the pinned AGES export digest.",
    );
  }
  // AGES 1.7 hashes sorted, two-space indented JSON with no final newline.
  const canonical = Object.fromEntries(MEMBERS.map((name) => [name, integrity.files[name]]));
  if ((await sha256(new TextEncoder().encode(JSON.stringify(canonical, null, 2)))) !== pinned) {
    throw new PreviewPackageError(
      "HASH_MISMATCH",
      "The integrity file does not match its package digest.",
    );
  }
  const [atlasBytes, provenanceBytes, manifestBytes] = await Promise.all(
    MEMBERS.map(async (name) => {
      const bytes = await read(name);
      if ((await sha256(bytes)) !== integrity.files[name]) {
        throw new PreviewPackageError(
          "HASH_MISMATCH",
          `${name} does not match its recorded SHA-256.`,
        );
      }
      return bytes;
    }),
  );
  const manifest = parseJson(manifestSchema, manifestBytes!, "sprite.runtime.json");
  const provenance = parseJson(provenanceSchema, provenanceBytes!, "provenance.json");
  if (manifest.atlas.sha256 !== integrity.files["atlas.png"]) {
    throw new PreviewPackageError(
      "HASH_MISMATCH",
      "Atlas hash differs between manifest and integrity records.",
    );
  }
  validateAtlas(atlasBytes!, manifest.atlas);
  validateAnimations(manifest, provenance);
  return {
    atlas: selected.get("atlas.png")!,
    digest: pinned,
    candidateId: provenance.candidate_pack_id,
    manifest,
  };
}
