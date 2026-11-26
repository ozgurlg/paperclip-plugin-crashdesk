// Serves the plugin UI with example data, without a running Paperclip:
//   npm run preview            then open the printed address
//   ?widget  the dashboard widget · ?fresh  first run · ?empty  no errors
import esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "preview");

const ctx = await esbuild.context({
  entryPoints: [path.join(dir, "entry.tsx")],
  outfile: path.join(dir, "preview.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  alias: { "@paperclipai/plugin-sdk/ui": path.join(dir, "mock-sdk.tsx") },
  logLevel: "warning",
});
await ctx.rebuild();
const { port } = await ctx.serve({ servedir: dir, port: Number(process.env.PORT) || 4173 });
console.log(`Crashdesk preview: http://127.0.0.1:${port}/`);
