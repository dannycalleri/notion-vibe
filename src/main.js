// move-card.mjs

import 'dotenv/config'

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_VERSION = "2025-09-03";

async function moveCard({ pageId, statusPropertyName = "Status", statusName }) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      "Content-Type": "application/json",
      "Notion-Version": NOTION_VERSION,
    },
    body: JSON.stringify({
      properties: {
        [statusPropertyName]: {
          status: { name: statusName },
        },
      },
    }),
  });

  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// usage: NOTION_TOKEN=... node move-card.mjs <pageId> "In Progress"
const [pageId, statusName] = process.argv.slice(2);
moveCard({ pageId, statusName })
  .then(() => console.log("ok"))
  .catch((e) => (console.error(e), process.exit(1)));
