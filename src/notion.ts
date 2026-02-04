const NOTION_BASE_URL = 'https://api.notion.com/v1';

type NotionRequestInput = {
  token: string;
  version: string;
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  body?: Record<string, unknown>;
};

type NotionRequestError = Error & { status?: number };

type DataSourceSchemaInput = {
  statusProperty: string;
  prProperty: string;
  statuses: string[];
};

type ListBlockChildrenInput = {
  token: string;
  version: string;
  blockId: string;
  startCursor?: string;
};

type GetDatabaseInput = {
  token: string;
  version: string;
  databaseId: string;
};

type GetDataSourceInput = {
  token: string;
  version: string;
  dataSourceId: string;
};

type QueryDataSourceInput = {
  token: string;
  version: string;
  dataSourceId: string;
  filter?: Record<string, unknown>;
  sorts?: Array<Record<string, unknown>>;
};

type UpdatePageInput = {
  token: string;
  version: string;
  pageId: string;
  properties: Record<string, unknown>;
};

type GetAllBlocksInput = {
  token: string;
  version: string;
  blockId: string;
};

type Block = {
  type: string;
  [key: string]: any;
};

type DataSource = {
  properties?: Record<string, { type?: string; status?: { options?: Array<{ name: string }> } }>;
};

async function notionRequest({ token, version, method, path, body }: NotionRequestInput) {
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
    const error = new Error(text || `Notion API error: ${res.status}`) as NotionRequestError;
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function getDatabase({ token, version, databaseId }: GetDatabaseInput) {
  return notionRequest({ token, version, method: 'GET', path: `/databases/${databaseId}` });
}

export async function getDataSource({ token, version, dataSourceId }: GetDataSourceInput) {
  return notionRequest({ token, version, method: 'GET', path: `/data_sources/${dataSourceId}` });
}

export async function queryDataSource({ token, version, dataSourceId, filter, sorts }: QueryDataSourceInput) {
  return notionRequest({
    token,
    version,
    method: 'POST',
    path: `/data_sources/${dataSourceId}/query`,
    body: { filter, sorts },
  });
}

export async function updatePage({ token, version, pageId, properties }: UpdatePageInput) {
  return notionRequest({
    token,
    version,
    method: 'PATCH',
    path: `/pages/${pageId}`,
    body: { properties },
  });
}

export async function listBlockChildren({ token, version, blockId, startCursor }: ListBlockChildrenInput) {
  const query = startCursor ? `?start_cursor=${startCursor}` : '';
  return notionRequest({
    token,
    version,
    method: 'GET',
    path: `/blocks/${blockId}/children${query}`,
  });
}

export function getTitleFromPage(page: any) {
  const props = page?.properties ?? {};

  // 'prop' is unknown, try to access safely and assert structure
  const titleProp = Object.values(props).find(
    (prop: any) => (
      prop &&
      typeof prop === 'object' &&
      prop.type === 'title' &&
      Array.isArray(prop.title)
    )
  );
  const titleArr = (titleProp && typeof titleProp === 'object' && Array.isArray((titleProp as any).title))
    ? (titleProp as any).title
    : undefined;
  
  if (!titleArr) return 'Untitled';
  return titleArr.map((t: any) => t?.plain_text ?? '').join('') || 'Untitled';
}

export async function getAllBlocks({ token, version, blockId }: GetAllBlocksInput) {
  const blocks: Block[] = [];
  let cursor: string | undefined;
  do {
    const res = await listBlockChildren({ token, version, blockId, startCursor: cursor });
    blocks.push(...(res.results ?? []));
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

export function blocksToPlainText(blocks: Block[]) {
  const lines: string[] = [];
  for (const block of blocks) {
    const content = block?.[block.type];
    const rich = content?.rich_text;
    if (Array.isArray(rich) && rich.length > 0) {
      lines.push(rich.map((t) => t.plain_text).join(''));
    }
  }
  return lines.join('\n').trim();
}

export function validateDataSourceSchema(dataSource: DataSource, { statusProperty, prProperty, statuses }: DataSourceSchemaInput) {
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
