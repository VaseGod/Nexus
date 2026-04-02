// ============================================================================
// Memory Tests — compaction operations, MemoryIndex, TranscriptLog
// ============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MemoryIndex } from '../src/memory-index.js';
import { TopicStore } from '../src/topic-store.js';
import { TranscriptLog } from '../src/transcript-log.js';

let testDir: string;

beforeEach(async () => {
  testDir = await mkdtemp(join(tmpdir(), 'nexus-memory-test-'));
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

// ============================================================================
// MemoryIndex Tests
// ============================================================================

describe('MemoryIndex', () => {
  it('should create new index when none exists', async () => {
    const index = new MemoryIndex(testDir);
    const result = await index.load();

    expect(result.isOk()).toBe(true);
    expect(index.getIndexAsArray()).toHaveLength(0);
  });

  it('should add and persist topics', async () => {
    const index = new MemoryIndex(testDir);
    await index.load();

    const addResult = await index.addTopic('auth-module', '/topics/auth-module.md', 'Authentication patterns');
    expect(addResult.isOk()).toBe(true);

    // Verify persistence
    const index2 = new MemoryIndex(testDir);
    await index2.load();
    expect(index2.getIndexAsArray()).toHaveLength(1);
    expect(index2.getIndex().get('auth-module')?.summary).toBe('Authentication patterns');
  });

  it('should prevent duplicate slugs', async () => {
    const index = new MemoryIndex(testDir);
    await index.load();

    await index.addTopic('test', '/test.md', 'Test topic');
    const result = await index.addTopic('test', '/test2.md', 'Duplicate');

    expect(result.isErr()).toBe(true);
  });

  it('should update topic summaries', async () => {
    const index = new MemoryIndex(testDir);
    await index.load();

    await index.addTopic('test', '/test.md', 'Original');
    const result = await index.updateSummary('test', 'Updated summary');

    expect(result.isOk()).toBe(true);
    expect(index.getIndex().get('test')?.summary).toBe('Updated summary');
  });

  it('should remove topics', async () => {
    const index = new MemoryIndex(testDir);
    await index.load();

    await index.addTopic('test', '/test.md', 'To be removed');
    const result = await index.removeTopic('test');

    expect(result.isOk()).toBe(true);
    expect(index.getIndexAsArray()).toHaveLength(0);
  });
});

// ============================================================================
// TopicStore Tests
// ============================================================================

describe('TopicStore', () => {
  it('should create and fetch topics', async () => {
    const store = new TopicStore(testDir);
    await store.initialize();

    const upsertResult = await store.upsertTopic('api-design', 'REST API design patterns and conventions');
    expect(upsertResult.isOk()).toBe(true);

    const fetchResult = await store.fetchTopic('api-design');
    expect(fetchResult.isOk()).toBe(true);

    if (fetchResult.isOk()) {
      expect(fetchResult.value.slug).toBe('api-design');
      expect(fetchResult.value.content).toContain('REST API');
      expect(fetchResult.value.version).toBe(1);
    }
  });

  it('should increment version on update', async () => {
    const store = new TopicStore(testDir);
    await store.initialize();

    await store.upsertTopic('test', 'Version 1');
    await store.upsertTopic('test', 'Version 2');

    const result = await store.fetchTopic('test');
    if (result.isOk()) {
      expect(result.value.version).toBe(2);
    }
  });

  it('should return error for missing topic', async () => {
    const store = new TopicStore(testDir);
    await store.initialize();

    const result = await store.fetchTopic('nonexistent');
    expect(result.isErr()).toBe(true);
  });

  it('should list all topics', async () => {
    const store = new TopicStore(testDir);
    await store.initialize();

    await store.upsertTopic('topic-a', 'Content A');
    await store.upsertTopic('topic-b', 'Content B');
    await store.upsertTopic('topic-c', 'Content C');

    const result = await store.listTopics();
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(3);
    }
  });
});

// ============================================================================
// TranscriptLog Tests
// ============================================================================

describe('TranscriptLog', () => {
  it('should append and read entries', async () => {
    const log = new TranscriptLog(testDir);
    await log.initialize();

    await log.append('ses-1', {
      ts: new Date().toISOString(),
      role: 'user',
      content: 'Hello, please review my code',
    });

    await log.append('ses-1', {
      ts: new Date().toISOString(),
      role: 'assistant',
      content: 'I will review your code now.',
      toolCalls: [{ name: 'read_file', arguments: { path: 'main.ts' } }],
    });

    const result = await log.getSessionTranscript('ses-1');
    expect(result.isOk()).toBe(true);

    if (result.isOk()) {
      expect(result.value).toHaveLength(2);
      expect(result.value[0]?.role).toBe('user');
      expect(result.value[1]?.toolCalls).toHaveLength(1);
    }
  });

  it('should grep across transcripts', async () => {
    const log = new TranscriptLog(testDir);
    await log.initialize();

    await log.append('ses-1', { ts: new Date().toISOString(), role: 'user', content: 'Fix the authentication bug' });
    await log.append('ses-1', { ts: new Date().toISOString(), role: 'assistant', content: 'Looking at the auth module' });
    await log.append('ses-2', { ts: new Date().toISOString(), role: 'user', content: 'Deploy to production' });

    const result = await log.grepTranscripts('auth');
    expect(result.isOk()).toBe(true);

    if (result.isOk()) {
      expect(result.value).toHaveLength(2);
    }
  });

  it('should return empty for non-existent session', async () => {
    const log = new TranscriptLog(testDir);
    await log.initialize();

    const result = await log.getSessionTranscript('nonexistent');
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toHaveLength(0);
    }
  });
});
