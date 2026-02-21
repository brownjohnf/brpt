import type { MdviewApi } from "./index";

declare global {
  interface Window {
    mdview: MdviewApi;
  }
}
