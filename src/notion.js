const NOTION_BASE_URL = 'https://api.notion.com/v1';

async function notionRequest({ token, version, method, path, body }) {
  const res = await fetch(`${NOTION_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': version,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    const error = new Error(text || `Notion API error: ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function getDatabase({ token, version, databaseId }) {
  return notionRequest({ token, version, method: 'GET', path: `/databases/${databaseId}` });
}

export async function getDataSource({ token, version, dataSourceId }) {
  return notionRequest({ token, version, method: 'GET', path: `/data_sources/${dataSourceId}` });
}

export async function queryDataSource({ token, version, dataSourceId, filter, sorts }) {
  return notionRequest({
    token,
    version,
    method: 'POST',
    path: `/data_sources/${dataSourceId}/query`,
    body: { filter, sorts },
  });
}

export async function updatePage({ token, version, pageId, properties }) {
  return notionRequest({
    token,
    version,
    method: 'PATCH',
    path: `/pages/${pageId}`,
    body: { properties },
  });
}

export async function listBlockChildren({ token, version, blockId, startCursor }) {
  const query = startCursor ? `?start_cursor=${startCursor}` : '';
  return notionRequest({
    token,
    version,
    method: 'GET',
    path: `/blocks/${blockId}/children${query}`,
  });
}

export function getTitleFromPage(page) {
  const props = page?.properties ?? {};
  const titleProp = Object.values(props).find((prop) => prop?.type === 'title');
  if (!titleProp?.title) return 'Untitled';
  return titleProp.title.map((t) => t.plain_text).join('') || 'Untitled';
}

export async function getAllBlocks({ token, version, blockId }) {
  const blocks = [];
  let cursor;
  do {
    const res = await listBlockChildren({ token, version, blockId, startCursor: cursor });
    blocks.push(...(res.results ?? []));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

export function blocksToPlainText(blocks) {
  const lines = [];
  for (const block of blocks) {
    const content = block?.[block.type];
    const rich = content?.rich_text;
    if (Array.isArray(rich) && rich.length > 0) {
      lines.push(rich.map((t) => t.plain_text).join(''));
    }
  }
  return lines.join('\n').trim();
}

export function validateDataSourceSchema(dataSource, { statusProperty, prProperty, statuses }) {
  const props = dataSource?.properties ?? {};
  const statusProp = props[statusProperty];
  const prProp = props[prProperty];

  const issues = [];
  if (!statusProp || statusProp.type !== 'status') {
    issues.push(`Missing status property "${statusProperty}" or wrong type.`);
  } else {
    const optionNames = (statusProp.status?.options ?? []).map((opt) => opt.name);
    for (const status of statuses) {
      if (!optionNames.includes(status)) {
        issues.push(`Status option "${status}" missing from "${statusProperty}".`);
      }
    }
  }

  if (!prProp || prProp.type !== 'url') {
    issues.push(`Missing URL property "${prProperty}" or wrong type.`);
  }

  return issues;
}
