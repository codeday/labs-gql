type DeepNonNullable<T> = {
	[P in keyof T]: NonNullable<T[P]>;
};

export type WithNonNullable<
  T extends object,
  K extends keyof T
> = DeepNonNullable<Pick<T, K>> & Omit<T, K>;