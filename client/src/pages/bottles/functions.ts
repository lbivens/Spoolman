import { IBottle } from "./model";

export async function setBottleArchived(bottle: IBottle, archived: boolean) {
  const apiEndpoint = import.meta.env.VITE_APIURL;
  const init: RequestInit = {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      archived: archived,
    }),
  };
  const request = new Request(apiEndpoint + "/bottle/" + bottle.id);
  await fetch(request, init);
}
