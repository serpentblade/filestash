// Full-page navigation; a seam so tests can observe it (jsdom cannot navigate).
export function redirect(url: string): void {
  location.href = url
}
