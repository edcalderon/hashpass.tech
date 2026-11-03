export const getWelcomeCaptionLayout = (width: number, height: number) => ({
  bottom: Math.round(height * 0.115),
  horizontalInset: Math.round(width * 0.07),
  maxWidth: Math.round(width * 0.86),
  fontSize: Math.max(22, Math.round(width * 0.014)),
});
