import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

describe("PWA manifest", () => {
  const m = manifest();

  it("is installable (standalone, name, start_url)", () => {
    expect(m.display).toBe("standalone");
    expect(m.name).toBeTruthy();
    expect(m.start_url).toBe("/");
  });

  it("declares 192 and 512 icons plus a maskable variant", () => {
    const icons = m.icons ?? [];
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("references icon files that exist in /public", () => {
    for (const icon of m.icons ?? []) {
      const rel = `../public${icon.src}`;
      const path = fileURLToPath(new URL(rel, import.meta.url));
      expect(existsSync(path), `missing ${icon.src}`).toBe(true);
    }
  });
});
