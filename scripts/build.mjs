import esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const watch = process.argv.includes("--watch");

const node = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: ["node20"],
  sourcemap: true,
  logLevel: "info",
};

await esbuild.build({
  ...node,
  entryPoints: [path.join(root, "src/worker.ts")],
  outfile: path.join(root, "dist/worker.js"),
});

await esbuild.build({
  ...node,
  entryPoints: [path.join(root, "src/manifest.ts")],
  outfile: path.join(root, "dist/manifest.js"),
});

// The host provides React and the SDK UI bridge at runtime.
const ui = {
  entryPoints: [path.join(root, "src/ui/index.tsx")],
  outfile: path.join(root, "dist/ui/index.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  sourcemap: true,
  jsx: "automatic",
  external: ["react", "react-dom", "react/jsx-runtime", "@paperclipai/plugin-sdk/ui"],
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(ui);
  await ctx.watch();
  console.log("Watching UI for changes...");
} else {
  await esbuild.build(ui);
}
