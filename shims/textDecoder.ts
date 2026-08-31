/**
 * TextDecoder utf-16le polyfill (pre-graph install).
 *
 * Expo's winter runtime (expo/build/winter/TextDecoder) supports utf-8 only.
 * h3-js (emscripten glue, dist/browser/h3-js.js line 260) constructs
 * `new TextDecoder("utf-16le")` at module scope, which throws
 * "Unknown encoding: utf-16le" on Hermes and crashes the bundle at module-eval
 * (stack: Map.tsx -> lib/h3.ts -> h3-js).
 *
 * This module exports `install()` (no auto side effects so the import is DCE-
 * proof; index.js calls it explicitly, which is the very first require in the
 * app's process — before expo-router/entry, before any route, before h3-js).
 * UTF-16LE bytes map 1:1 to JS string code units, so the manual decode is
 * exact (surrogate pairs included). The native utf-8 path is preserved
 * untouched when the platform decoder is present.
 */

type DecodableInput = ArrayBuffer | ArrayBufferView;
type DecoderLike = {
  decode: (input?: DecodableInput, options?: { stream?: boolean }) => string;
};

const NativeTextDecoder = globalThis.TextDecoder as
  | (new (label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean }) => DecoderLike)
  | undefined;

function supportsUtf16le(Ctor: new (label?: string) => DecoderLike): boolean {
  try {
    new Ctor("utf-16le");
    return true;
  } catch {
    return false;
  }
}

function normalizeLabel(label?: string): string {
  const l = (label ?? "utf-8").toLowerCase();
  if (l === "utf-16" || l === "utf-16le") return "utf-16le";
  return "utf-8";
}

class Utf16leCapableTextDecoder {
  readonly encoding: string;
  private native: DecoderLike | null = null;

  constructor(label?: string, _options?: { fatal?: boolean; ignoreBOM?: boolean }) {
    this.encoding = normalizeLabel(label);
    if (this.encoding === "utf-8" && NativeTextDecoder) {
      this.native = new NativeTextDecoder("utf-8");
    }
  }

  decode(input?: DecodableInput, _options?: { stream?: boolean }): string {
    if (this.native) return this.native.decode(input, _options);
    const asBuf = input as ArrayBufferLike | undefined;
    const bytes =
      input instanceof Uint8Array
        ? input
        : new Uint8Array(asBuf ?? new ArrayBuffer(0));
    let out = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
    }
    return out;
  }
}

export let __TEXT_DECODER_PATCHED__ = false;

export function install(): void {
  if (__TEXT_DECODER_PATCHED__) return;
  if (NativeTextDecoder && !supportsUtf16le(NativeTextDecoder)) {
    (globalThis as unknown as { TextDecoder: unknown }).TextDecoder = Utf16leCapableTextDecoder;
  }
  __TEXT_DECODER_PATCHED__ = true;
}
