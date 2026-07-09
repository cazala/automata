/**
 * Detects if the device is mobile based on user agent and screen size.
 */
export function isMobileDevice(): boolean {
  const userAgent =
    navigator.userAgent || navigator.vendor || (window as unknown as { opera?: string }).opera || "";
  const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
  const isSmallScreen = window.innerWidth <= 768 || window.innerHeight <= 768;
  return mobileRegex.test(userAgent) || (isSmallScreen && "ontouchstart" in window);
}

export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && !!(navigator as Navigator).gpu;
}
