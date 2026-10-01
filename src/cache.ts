"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { buildApiCacheTag } from "./request/cache";

type TagInput = string | string[];

function values(input: TagInput): string[] {
  return Array.isArray(input) ? input : [input];
}

function revalidateTagCompat(tag: string, staleWhileRevalidate: boolean): void {
  // Next 15 exposes revalidateTag(tag). Next 16 adds the recommended "max"
  // profile. Extra JavaScript arguments are ignored by Next 15, so this keeps
  // one package surface compatible with both supported majors.
  const compatible = revalidateTag as unknown as (
    tag: string,
    profile?: "max",
  ) => void;

  if (staleWhileRevalidate) {
    compatible(tag, "max");
    return;
  }
  compatible(tag);
}

/** Revalidate one or more custom cache tags using stale-while-revalidate. */
export async function revalidateCache(tags: TagInput) {
  for (const tag of values(tags)) revalidateTagCompat(tag, true);
}

/** Expire one or more custom cache tags so the next read must refresh them. */
export async function expireCache(tags: TagInput) {
  for (const tag of values(tags)) revalidateTagCompat(tag, false);
}

/** Expire every cached query variant for one or more API endpoint paths. */
export async function revalidateApiCache(paths: TagInput) {
  for (const path of values(paths)) {
    revalidateTagCompat(buildApiCacheTag(path), false);
  }
}

export async function reloadPage(path: string = "/") {
  revalidatePath(path, "page");
}
