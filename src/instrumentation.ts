/** Listen for Composio's new-mail triggers as soon as the server starts, not only once a tab is open. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startAllListeners } = await import("./lib/live");
  startAllListeners().catch((err) => console.error("[live] startup failed", err));
}
