import { requireOwner } from "@/lib/session";
import { getInstagramConnection } from "@/lib/instagram/server";
import { InstagramConnection } from "./instagram-connection";

export async function InstagramConnectionServer() {
  await requireOwner();
  return <InstagramConnection initial={await getInstagramConnection()} />;
}
