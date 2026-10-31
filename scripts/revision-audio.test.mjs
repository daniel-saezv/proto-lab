import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { contentHash, revisionLobbyAudio } from "./revision-audio.mjs";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "audio-rev-"));
  mkdirSync(join(dir, "protos", "audio"), { recursive: true });
  mkdirSync(join(dir, "assets"), { recursive: true });
  const bytes = Buffer.from("pista-de-prueba");
  writeFileSync(join(dir, "protos", "audio", "luanda.m4a"), bytes);
  writeFileSync(
    join(dir, "assets", "index-AbCdEf12.js"),
    'const src="/protos/audio/luanda.m4a";\n//# sourceMappingURL=index-AbCdEf12.js.map\n',
  );
  writeFileSync(join(dir, "assets", "index-AbCdEf12.js.map"), '{"file":"index-AbCdEf12.js"}\n');
  writeFileSync(join(dir, "index.html"), '<script type="module" src="/assets/index-AbCdEf12.js"></script>\n');
  writeFileSync(join(dir, "sw.js"), "placeholder");
  return { dir, bytes };
}

describe("revisión de audio del lobby", () => {
  it("publica la pista con hash y mueve el bundle para invalidar /assets", () => {
    const { dir, bytes } = fixture();
    const hash = contentHash(bytes);
    const result = revisionLobbyAudio(dir);

    expect(result.revisions).toEqual([
      { from: "/protos/audio/luanda.m4a", to: `/protos/audio/luanda.${hash}.m4a` },
    ]);
    expect(readFileSync(join(dir, "protos", "audio", `luanda.${hash}.m4a`))).toEqual(bytes);
    expect(readFileSync(join(dir, "protos", "audio", "luanda.m4a"))).toEqual(bytes);

    const html = readFileSync(join(dir, "index.html"), "utf8");
    const match = html.match(/src="(\/assets\/audio-rev-[0-9a-f]{8}\.js)"/);
    expect(match).toBeTruthy();
    const bundle = readFileSync(join(dir, match[1].slice(1)), "utf8");
    expect(bundle).toContain(`/protos/audio/luanda.${hash}.m4a`);
    expect(bundle).not.toContain('"/protos/audio/luanda.m4a"');
    expect(bundle).toContain("sourceMappingURL=index-AbCdEf12.js.map");
    const map = readFileSync(join(dir, "assets", "index-AbCdEf12.js.map"), "utf8");
    expect(map).toContain(match[1].slice("/assets/".length));

    const sw = readFileSync(join(dir, "sw.js"), "utf8");
    expect(sw).toContain(match[1]);
    expect(sw).not.toContain("luanda");
    expect(sw).not.toContain("placeholder");
  });

  it("se puede ejecutar otra vez sin duplicar el hash", () => {
    const { dir, bytes } = fixture();
    revisionLobbyAudio(dir);
    const again = revisionLobbyAudio(dir);
    expect(again.already).toBe(true);
    const hashed = `luanda.${contentHash(bytes)}.${contentHash(bytes)}.m4a`;
    expect(readFileSync(join(dir, "index.html"), "utf8")).not.toContain(hashed);
  });
});
