import { createWidgetHealthClient } from "./health-client.js";
if (!window.TikTokPlaygroundPreview)
  window.TikTokWidgetHealth = createWidgetHealthClient();
