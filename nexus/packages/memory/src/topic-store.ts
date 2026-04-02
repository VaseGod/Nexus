// ============================================================================
// Layer 2 — TopicStore: individual topic file management + RAG retrieval
// ============================================================================

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Result, ok, err } from 'neverthrow';
import type { MemoryTopic } from '@nexus/core';
import { createLogger } from '@nexus/core';

const logger = createLogger({ service: 'topic-store' });

interface EmbeddingService {
  embed(text: string): Promise<number[]>;
  search(query: string, topK: number): Promise<Array<{ slug: string; score: number }>>;
}

export class TopicStore {
  private readonly topicsDir: string;
  private readonly embeddingServiceUrl: string;

  constructor(basePath: string, embeddingServiceUrl: string = 'http://localhost:8001') {
    this.topicsDir = join(basePath, 'topics');
    this.embeddingServiceUrl = embeddingServiceUrl;
  }

  public async initialize(): Promise<Result<void, Error>> {
    try {
      await mkdir(this.topicsDir, { recursive: true });
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Failed to initialize topic store: ${message}`));
    }
  }

  public async fetchTopic(slug: string): Promise<Result<MemoryTopic, Error>> {
    try {
      const filePath = this.topicFilePath(slug);
      const raw = await readFile(filePath, 'utf-8');
      const topic = this.parseTopicFile(slug, raw);
      return ok(topic);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return err(new Error(`Topic not found: ${slug}`));
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Failed to fetch topic: ${message}`));
    }
  }

  public async upsertTopic(slug: string, content: string): Promise<Result<MemoryTopic, Error>> {
    try {
      await mkdir(this.topicsDir, { recursive: true });
      const filePath = this.topicFilePath(slug);

      let existingTopic: MemoryTopic | undefined;
      try {
        const raw = await readFile(filePath, 'utf-8');
        existingTopic = this.parseTopicFile(slug, raw);
      } catch {
        // File doesn't exist, creating new topic
      }

      const now = new Date().toISOString();
      const topic: MemoryTopic = {
        slug,
        title: this.slugToTitle(slug),
        content,
        tags: this.extractTags(content),
        createdAt: existingTopic?.createdAt ?? now,
        updatedAt: now,
        version: (existingTopic?.version ?? 0) + 1,
      };

      const markdown = this.serializeTopicFile(topic);
      await writeFile(filePath, markdown, 'utf-8');

      // Update embeddings asynchronously
      this.updateEmbedding(slug, content).catch((error) => {
        logger.warn({ slug, error }, 'Failed to update embedding');
      });

      logger.info({ slug, version: topic.version }, 'Topic upserted');
      return ok(topic);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Failed to upsert topic: ${message}`));
    }
  }

  public async searchSimilar(
    query: string,
    topK: number = 5,
  ): Promise<Result<MemoryTopic[], Error>> {
    try {
      const response = await fetch(`${this.embeddingServiceUrl}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, top_k: topK }),
      });

      if (!response.ok) {
        throw new Error(`Embedding service error: ${response.status}`);
      }

      const results = (await response.json()) as Array<{ slug: string; score: number }>;

      const topics: MemoryTopic[] = [];
      for (const result of results) {
        const topicResult = await this.fetchTopic(result.slug);
        if (topicResult.isOk()) {
          topics.push(topicResult.value);
        }
      }

      return ok(topics);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn({ query, error: message }, 'Semantic search failed, falling back to grep');
      return this.grepSearch(query, topK);
    }
  }

  public async listTopics(): Promise<Result<string[], Error>> {
    try {
      const files = await readdir(this.topicsDir);
      return ok(
        files
          .filter((f) => f.endsWith('.md'))
          .map((f) => f.replace('.md', '')),
      );
    } catch {
      return ok([]);
    }
  }

  public async deleteTopic(slug: string): Promise<Result<void, Error>> {
    try {
      await unlink(this.topicFilePath(slug));
      logger.info({ slug }, 'Topic deleted');
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Failed to delete topic: ${message}`));
    }
  }

  // ---- Internal helpers ----

  private topicFilePath(slug: string): string {
    return join(this.topicsDir, `${slug}.md`);
  }

  private slugToTitle(slug: string): string {
    return slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private extractTags(content: string): string[] {
    const tagRegex = /#(\w+)/g;
    const tags: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(content)) !== null) {
      if (match[1]) {
        tags.push(match[1]);
      }
    }
    return [...new Set(tags)];
  }

  private serializeTopicFile(topic: MemoryTopic): string {
    return [
      '---',
      `slug: ${topic.slug}`,
      `title: "${topic.title}"`,
      `tags: [${topic.tags.join(', ')}]`,
      `created: ${topic.createdAt}`,
      `updated: ${topic.updatedAt}`,
      `version: ${topic.version}`,
      '---',
      '',
      topic.content,
      '',
    ].join('\n');
  }

  private parseTopicFile(slug: string, raw: string): MemoryTopic {
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      return {
        slug,
        title: this.slugToTitle(slug),
        content: raw,
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
      };
    }

    const frontmatter = frontmatterMatch[1]!;
    const content = frontmatterMatch[2]!.trim();

    const getValue = (key: string): string => {
      const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
      return match?.[1]?.replace(/^["']|["']$/g, '') ?? '';
    };

    const tagsStr = getValue('tags');
    const tags = tagsStr
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    return {
      slug,
      title: getValue('title') || this.slugToTitle(slug),
      content,
      tags,
      createdAt: getValue('created') || new Date().toISOString(),
      updatedAt: getValue('updated') || new Date().toISOString(),
      version: parseInt(getValue('version') || '1', 10),
    };
  }

  private async updateEmbedding(slug: string, content: string): Promise<void> {
    await fetch(`${this.embeddingServiceUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, content }),
    });
  }

  private async grepSearch(query: string, topK: number): Promise<Result<MemoryTopic[], Error>> {
    try {
      const slugsResult = await this.listTopics();
      if (slugsResult.isErr()) return err(slugsResult.error);

      const queryLower = query.toLowerCase();
      const matches: MemoryTopic[] = [];

      for (const slug of slugsResult.value) {
        const topicResult = await this.fetchTopic(slug);
        if (topicResult.isOk()) {
          const topic = topicResult.value;
          if (
            topic.content.toLowerCase().includes(queryLower) ||
            topic.title.toLowerCase().includes(queryLower)
          ) {
            matches.push(topic);
            if (matches.length >= topK) break;
          }
        }
      }

      return ok(matches);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new Error(`Grep search failed: ${message}`));
    }
  }
}
