export const mergeOAuthFragmentParams = (
  hashParams: URLSearchParams,
  overrides: Record<string, string> = {}
): Record<string, string> => {
  const fragmentParams = Object.fromEntries(hashParams.entries());

  return {
    ...fragmentParams,
    ...overrides,
  };
};
