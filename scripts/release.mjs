// Cuts a GitHub release for the current package.json version:
//   build -> stage dist into flow-v<version>/ -> zip -> gh release create
//
// Usage: npm run release
//
// The tag is `v<version>` from package.json (bump the version there first, e.g.
// `npm version patch`). 0.x versions are published as pre-releases. Requires the
// GitHub CLI (`gh`, authenticated) and the `zip` command.
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  mkdirSync,
  cpSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });
const capture = (cmd, args) =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8" }).trim();

const die = (msg) => {
  console.error(`\n[release] ${msg}`);
  process.exit(1);
};

// ── Preconditions ───────────────────────────────────────────────────────────
const REPO = "bobtherobot/flow";
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const tag = `v${version}`;
const isPrerelease = version.startsWith("0.");

try {
  capture("gh", ["--version"]);
} catch {
  die("GitHub CLI 'gh' not found. Install it and run 'gh auth login'.");
}
try {
  capture("zip", ["-v"]);
} catch {
  die("'zip' command not found. Install zip (e.g. 'apt install zip' / 'brew install zip').");
}
// Refuse to clobber an existing release for this version.
let releaseExists = false;
try {
  capture("gh", ["release", "view", tag, "-R", REPO]);
  releaseExists = true;
} catch {
  // `gh release view` exits non-zero when the release is absent — the good case.
}
if (releaseExists)
  die(`Release ${tag} already exists. Bump the version in package.json first.`);

console.log(`[release] preparing ${tag}${isPrerelease ? " (pre-release)" : ""}\n`);

// ── Build ───────────────────────────────────────────────────────────────────
run("npm", ["run", "build"]);

// ── Stage + zip ───────────────────────────────────────────────────────────────
const work = mkdtempSync(join(tmpdir(), "flow-release-"));
const folder = `flow-${tag}`;
const staged = join(work, folder);
mkdirSync(staged, { recursive: true });
cpSync(join(root, "dist"), staged, { recursive: true }); // includes .htaccess
const zipName = `flow-${tag}-dist.zip`;
run("zip", ["-r", "-q", zipName, folder], { cwd: work });
const zipPath = join(work, zipName);

// ── Release notes ─────────────────────────────────────────────────────────────
const notes = `Prebuilt, self-contained static bundle for **flow ${tag}** — no build tools, backend, or CDN required.

## Run it

1. Download **\`${zipName}\`** below and unzip → \`${folder}/\`.
2. Serve the folder over HTTP(S) from any static server:
   \`\`\`bash
   npx serve ${folder}
   # or
   python3 -m http.server -d ${folder} 8080
   \`\`\`
   > Must be served over HTTP(S). Opening \`index.html\` directly (\`file://\`) will not work.
3. Or upload the folder's contents to your own web host (any subfolder works). See [DEPLOY.md](https://github.com/${REPO}/blob/main/DEPLOY.md).

Configure per-deployment via \`config.json\` (no rebuild). See the [README](https://github.com/${REPO}#readme) for full details.
`;
const notesPath = join(work, "notes.md");
writeFileSync(notesPath, notes);

// ── Publish ───────────────────────────────────────────────────────────────────
const args = [
  "release", "create", tag,
  "-R", REPO,
  "--target", "main",
  "--title", `flow ${tag}`,
  "--notes-file", notesPath,
];
if (isPrerelease) args.push("--prerelease");
args.push(`${zipPath}#flow ${tag} static bundle (unzip and serve)`);
run("gh", args);

rmSync(work, { recursive: true, force: true });
console.log(`\n[release] done → https://github.com/${REPO}/releases/tag/${tag}`);
