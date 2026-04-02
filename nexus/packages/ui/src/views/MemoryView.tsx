import { useState } from 'react';

interface MemoryEntry {
  slug: string;
  summary: string;
  lastUpdated: string;
}

export default function MemoryView(): JSX.Element {
  const [searchQuery, setSearchQuery] = useState('');
  const [entries] = useState<MemoryEntry[]>([
    { slug: 'auth-module', summary: 'Authentication module patterns and best practices', lastUpdated: '2024-03-15T10:30:00Z' },
    { slug: 'api-conventions', summary: 'REST API naming and response format standards', lastUpdated: '2024-03-14T14:20:00Z' },
    { slug: 'deployment-pipeline', summary: 'CI/CD pipeline configuration for production', lastUpdated: '2024-03-13T09:15:00Z' },
    { slug: 'error-handling', summary: 'Error handling patterns across the codebase', lastUpdated: '2024-03-12T16:45:00Z' },
  ]);

  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  const filteredEntries = entries.filter(
    (e) =>
      e.slug.includes(searchQuery.toLowerCase()) ||
      e.summary.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Memory Index</h2>
        <p className="text-sm text-nexus-muted mt-1">Browse MEMORY.md index and topic files</p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search topics..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 bg-nexus-bg border border-nexus-border rounded-lg
                     text-nexus-text placeholder-nexus-muted focus:border-nexus-accent
                     focus:outline-none focus:ring-1 focus:ring-nexus-accent transition-colors"
          id="memory-search"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Index */}
        <div className="space-y-2">
          {filteredEntries.map((entry) => (
            <button
              key={entry.slug}
              onClick={() => setSelectedTopic(entry.slug)}
              className={`card w-full text-left transition-all ${
                selectedTopic === entry.slug
                  ? 'border-nexus-accent bg-nexus-accent/5'
                  : 'hover:border-nexus-accent/30'
              }`}
            >
              <div className="font-mono text-sm text-nexus-accent-bright">{entry.slug}</div>
              <div className="text-xs text-nexus-muted mt-1">{entry.summary}</div>
              <div className="text-xs text-nexus-border mt-2">
                Updated {new Date(entry.lastUpdated).toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>

        {/* Topic viewer */}
        <div className="card min-h-[300px]">
          {selectedTopic ? (
            <>
              <h3 className="text-sm font-semibold text-nexus-accent-bright mb-3">
                /{selectedTopic}.md
              </h3>
              <pre className="text-xs text-nexus-muted whitespace-pre-wrap leading-relaxed">
{`---
slug: ${selectedTopic}
title: "${selectedTopic.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}"
tags: [documentation, patterns]
updated: ${new Date().toISOString()}
---

# ${selectedTopic.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}

Topic content loaded from memory store.
This view shows the rendered topic file content.`}
              </pre>
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-nexus-muted text-sm">
              Select a topic to view
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
