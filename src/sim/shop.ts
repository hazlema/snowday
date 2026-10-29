// The garage: spend credits between rounds. Gear and unspent credits last the whole snow day (all 3
// streets), for every kid including the bots; 'New snow day' wipes everyone back to plain (rule 4).
import type { Kit, Role } from "./types";

export type ItemId = "launcher" | "ice" | "rock" | "melter" | "snowman";

export interface Item {
  id: ItemId;
  name: string;
  price: number;
  blurb: string;
}

export const ITEMS: Item[] = [
  { id: "launcher", name: "Snowball launcher", price: 10, blurb: "Hold throw to spray a stream of small snowballs. 15-ball hopper." },
  { id: "ice", name: "Ice snowballs", price: 4, blurb: "Faster throws that shatter any wall they hit." },
  { id: "rock", name: "Rock snowballs", price: 8, blurb: "Smash straight through walls and knock kids back." },
  { id: "melter", name: "Snowball melter", price: 4, blurb: "Walk into rival walls and snowmen to melt them. Touch a chilled teammate to thaw them (once every 6s)." },
  { id: "snowman", name: "Snowman", price: 8, blurb: "Your build button makes a snowman that pelts nearby rivals (instead of a wall)." },
];

export const item = (id: ItemId) => ITEMS.find((i) => i.id === id)!;

export const defaultKit = (): Kit => ({ ball: "plain", launcher: false, melter: false, snowman: false });

export function owns(kit: Kit, id: ItemId): boolean {
  if (id === "ice" || id === "rock") return kit.ball === id;
  return kit[id];
}

/** Ice and rock share the ball slot: buying one swaps out the other. */
export function buy(kit: Kit, id: ItemId): Kit {
  const k = { ...kit };
  if (id === "ice" || id === "rock") k.ball = id;
  else k[id] = true;
  return k;
}

export const canBuy = (kit: Kit, credits: number, id: ItemId) => !owns(kit, id) && credits >= item(id).price;

/** Ice over rock gives back the wall-smashing ball you paid more for: never worth it on its own. */
const sidegrade = (kit: Kit, id: ItemId) => id === "ice" && kit.ball === "rock";

/** Anything left on the shelf you can afford, don't own, and isn't a swap down.
 *  None = the garage leads with 'Your gear is ready'. */
export const worthBuying = (kit: Kit, credits: number) => ITEMS.filter((i) => canBuy(kit, credits, i.id) && !sidegrade(kit, i.id));

// rule 4's wishlists, first affordable wins
const WISHLIST: Record<Role, ItemId[]> = {
  beanie: ["ice", "launcher", "rock"],
  pockets: ["melter", "snowman"], // keeps the blower
  brick: ["melter"], // he never throws
  copycat: ["ice", "launcher"],
};

/** Bots shop for themselves: the first affordable wishlist item, ONE per visit.
 *  Copycat copies the human's last buy (this snow day), else ice -> launcher. */
export function botShop(role: Role, kit: Kit, credits: number, humanLast: ItemId | null = null): { kit: Kit; credits: number; bought: ItemId[] } {
  const list = role === "copycat" && humanLast ? [humanLast, ...WISHLIST.copycat] : WISHLIST[role];
  const bought: ItemId[] = [];
  for (const id of list) {
    if (!canBuy(kit, credits, id) || sidegrade(kit, id)) continue; // gear carries over: never swap rock back to ice
    kit = buy(kit, id);
    credits -= item(id).price;
    bought.push(id);
    break; // one purchase per visit
  }
  return { kit, credits, bought };
}
