import { IResin } from "../filaments/model";

export interface IBottle {
  id: number;
  registered: string;
  first_used?: string;
  last_used?: string;
  resin: IResin;
  remaining_weight?: number;
  used_weight: number;
  location?: string;
  lot_nr?: string;
  comment?: string;
  archived: boolean;
}
