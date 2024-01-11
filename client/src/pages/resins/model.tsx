import { IVendor } from "../vendors/model";

export interface IResin {
  id: number;
  registered: string;
  name?: string;
  vendor?: IVendor;
  material?: string;
  price?: number;
  density: number;
  diameter: number;
  weight?: number;
  bottle_weight?: number;
  article_number?: string;
  comment?: string;
  settings_cure_temp?: number;
  settings_cure_time?: number;
  settings_wash_time?: number;
  color_hex?: string;
}
