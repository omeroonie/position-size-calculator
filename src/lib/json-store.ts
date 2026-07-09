import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT_DATA_DIR = path.join(process.cwd(), "data");
const TMP_DATA_DIR = path.join("/tmp", "position-size-calculator-data");

function getActiveDataDir() {
  return process.env.VERCEL ? TMP_DATA_DIR : ROOT_DATA_DIR;
}

async function ensureSeedFile(fileName: string) {
  const sourcePath = path.join(ROOT_DATA_DIR, fileName);
  const targetPath = path.join(getActiveDataDir(), fileName);

  try {
    await readFile(targetPath, "utf8");
    return;
  } catch {
    await mkdir(path.dirname(targetPath), { recursive: true });
  }

  try {
    const seed = await readFile(sourcePath, "utf8");
    await writeFile(targetPath, seed, "utf8");
  } catch {
    // If there is no seed file, callers will use fallback data.
  }
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  const filePath = path.join(getActiveDataDir(), fileName);

  await ensureSeedFile(fileName);

  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile<T>(fileName: string, data: T): Promise<void> {
  const filePath = path.join(getActiveDataDir(), fileName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}
