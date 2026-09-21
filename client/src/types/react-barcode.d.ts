declare module "react-barcode" {
  import { ComponentType } from "react";
  const Barcode: ComponentType<{
    value: string;
    format?: string;
    width?: number;
    height?: number;
    displayValue?: boolean;
    margin?: number;
    fontSize?: number;
    background?: string;
    lineColor?: string;
  }>;
  export default Barcode;
}
