import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const source = path.join(process.cwd(), "node_modules/browser-image-compression/dist/browser-image-compression.js");
const directory = path.join(process.cwd(), "public/vendor");
const destination = path.join(directory, "browser-image-compression.js");

await mkdir(directory, { recursive: true });
await copyFile(source, destination);
