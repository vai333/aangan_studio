// Client-safe (no server-only imports): deep links into the HubSpot UI.
// Portals sit on regional hosts (app.hubspot.com, app-na2.hubspot.com, app-eu1.hubspot.com…).
export const hubspotUrl = (portal: string, kind: "contact" | "deal", id: string, uiDomain?: string | null) =>
  `https://${uiDomain || "app.hubspot.com"}/contacts/${portal}/record/${kind === "contact" ? "0-1" : "0-3"}/${id}`;
