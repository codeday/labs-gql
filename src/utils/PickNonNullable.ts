import { WithNonNullable } from "./WithNonNullable";

export type PickNonNullable<
  T extends object,
  K extends keyof T
> = Pick<WithNonNullable<T, K>, K>;