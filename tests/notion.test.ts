import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  blocksToPlainText,
  getAllBlocks,
  getTitleFromPage,
  listBlockChildren,
  queryDataSource,
  updatePage,
  validateDataSourceSchema,
} from '../src/notion.ts';

const fetchMock = vi.fn();

vi.stubGlobal('fetch', fetchMock);

afterEach(() => {
  fetchMock.mockReset();
});

describe('notion API helpers', () => {
  it('queryDataSource posts to the correct endpoint', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await queryDataSource({
      token: 'token',
      version: '2025-09-03',
      dataSourceId: 'ds_1',
      filter: { status: { equals: 'In progress' } },
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.notion.com/v1/data_sources/ds_1/query',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          'Notion-Version': '2025-09-03',
        }),
      })
    );
  });

  it('updatePage patches the page with properties', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'page_1' }),
    });

    await updatePage({
      token: 'token',
      version: '2025-09-03',
      pageId: 'page_1',
      properties: { Status: { status: { name: 'Done' } } },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.notion.com/v1/pages/page_1',
      expect.objectContaining({
        method: 'PATCH',
      })
    );
  });

  it('listBlockChildren appends start_cursor when provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    });

    await listBlockChildren({
      token: 'token',
      version: '2025-09-03',
      blockId: 'block_1',
      startCursor: 'cursor_1',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.notion.com/v1/blocks/block_1/children?start_cursor=cursor_1',
      expect.any(Object)
    );
  });

  it('getAllBlocks paginates until has_more is false', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: 'b1', type: 'paragraph', paragraph: { rich_text: [] } }],
          has_more: true,
          next_cursor: 'cursor_2',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: 'b2', type: 'paragraph', paragraph: { rich_text: [] } }],
          has_more: false,
          next_cursor: null,
        }),
      });

    const blocks = await getAllBlocks({
      token: 'token',
      version: '2025-09-03',
      blockId: 'block_1',
    });

    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.id)).toEqual(['b1', 'b2']);
  });
});

describe('notion data helpers', () => {
  it('getTitleFromPage extracts the title or returns Untitled', () => {
    const title = getTitleFromPage({
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Hello' }] },
      },
    });

    expect(title).toBe('Hello');
    expect(getTitleFromPage({ properties: {} })).toBe('Untitled');
  });

  it('blocksToPlainText joins rich text content', () => {
    const text = blocksToPlainText([
      { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Line 1' }] } },
      { type: 'paragraph', paragraph: { rich_text: [{ plain_text: 'Line 2' }] } },
    ]);

    expect(text).toBe('Line 1\nLine 2');
  });

  it('validateDataSourceSchema returns issues for missing props', () => {
    const issues = validateDataSourceSchema(
      { properties: {} },
      { statusProperty: 'Status', prProperty: 'PR', statuses: ['Done'] }
    );

    expect(issues).toEqual([
      'Missing status property "Status" or wrong type.',
      'Missing URL property "PR" or wrong type.',
    ]);
  });

  it('validateDataSourceSchema checks status options', () => {
    const issues = validateDataSourceSchema(
      {
        properties: {
          Status: {
            type: 'status',
            status: { options: [{ name: 'In progress' }] },
          },
          PR: { type: 'url' },
        },
      },
      { statusProperty: 'Status', prProperty: 'PR', statuses: ['In progress', 'Done'] }
    );

    expect(issues).toEqual(['Status option "Done" missing from "Status".']);
  });
});
