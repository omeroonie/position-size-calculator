import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { list, put } from "@vercel/blob";

const ROOT_DATA_DIR = path.join(process.cwd(), "data");
const TMP_DATA_DIR = path.join("/tmp", "position-size-calculator-data");
const BLOB_PREFIX = "position-size-calculator/";

function canUseBlobStorage() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

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

async function readJsonFromBlob<T>(fileName: string): Promise<T | undefined> {
  try {
    const { blobs } = await list({
      prefix: `${BLOB_PREFIX}${fileName}`,
      limit: 100,
    });

    if (blobs.length === 0) {
      return undefined;
    }

    const latestBlob = blobs
      .slice()
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())[0];

    const response = await fetch(latestBlob.url, {
      cache: "no-store",
    });

    if (!response.ok) {
      return undefined;
    }

    const raw = await response.text();

    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

async function writeJsonToBlob<T>(fileName: string, data: T): Promise<void> {
  await put(`${BLOB_PREFIX}${fileName}`, JSON.stringify(data, null, 2), {
    access: "public",
    addRandomSuffix: true,
    contentType: "application/json",
  });
}

async function readJsonFromFile<T>(fileName: string, fallback: T): Promise<T> {
  const filePath = path.join(getActiveDataDir(), fileName);

  await ensureSeedFile(fileName);

  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonToFile<T>(fileName: string, data: T): Promise<void> {
  const filePath = path.join(getActiveDataDir(), fileName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

export async function readJsonFile<T>(fileName: string, fallback: T): Promise<T> {
  if (canUseBlobStorage()) {
    const blobData = await readJsonFromBlob<T>(fileName);

    if (blobData !== undefined) {
      return blobData;
    }
  }

  return readJsonFromFile(fileName, fallback);
}

export async function writeJsonFile<T>(fileName: string, data: T): Promise<void> {
  if (canUseBlobStorage()) {
    try {
      await writeJsonToBlob(fileName, data);
      return;
    } catch {
      // Fall back to file writes when Blob is unavailable in the current environment.
    }
  }

  await writeJsonToFile(fileName, data);
}
