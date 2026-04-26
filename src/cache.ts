"use server";

import { revalidatePath } from "next/cache";

export async function reloadPage(path: string = "/") {
  revalidatePath(path, "page");
}
