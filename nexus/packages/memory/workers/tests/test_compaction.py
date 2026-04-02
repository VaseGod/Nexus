"""
Compaction Daemon Tests
"""

import os
import json
import pytest
from pathlib import Path
from unittest.mock import patch, AsyncMock

# Set test environment before importing module
os.environ["MEMORY_BASE_PATH"] = "/tmp/nexus-test-memory"

from compaction_daemon import (
    operation_add,
    operation_update,
    operation_delete,
    operation_noop,
    operation_deduplicate,
    cosine_similarity,
    slug_to_title,
    extract_frontmatter_value,
    generate_slug,
)


@pytest.fixture(autouse=True)
def setup_test_dirs(tmp_path):
    """Set up test directories for each test."""
    import compaction_daemon

    compaction_daemon.MEMORY_BASE_PATH = tmp_path
    compaction_daemon.TOPICS_DIR = tmp_path / "topics"
    compaction_daemon.COMPACTION_LOG_PATH = tmp_path / "compaction-log.jsonl"
    compaction_daemon.TRANSCRIPTS_DIR = tmp_path / "transcripts"

    compaction_daemon.TOPICS_DIR.mkdir(parents=True, exist_ok=True)
    compaction_daemon.TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)

    yield tmp_path


class TestOperationAdd:
    @pytest.mark.asyncio
    async def test_add_new_topic(self, setup_test_dirs):
        facts = {"new-topic": ["fact one", "fact two"]}
        existing = set()

        results = await operation_add(facts, existing)

        assert len(results) == 1
        assert results[0].operation == "ADD"
        assert results[0].topic_slug == "new-topic"
        assert not results[0].requires_human_review

        # Verify file was created
        topic_file = setup_test_dirs / "topics" / "new-topic.md"
        assert topic_file.exists()
        content = topic_file.read_text()
        assert "fact one" in content
        assert "fact two" in content

    @pytest.mark.asyncio
    async def test_skip_existing_topics(self, setup_test_dirs):
        facts = {"existing-topic": ["some fact"]}
        existing = {"existing-topic"}

        results = await operation_add(facts, existing)
        assert len(results) == 0


class TestOperationUpdate:
    @pytest.mark.asyncio
    async def test_update_with_new_facts(self, setup_test_dirs):
        # Create existing topic
        topic_file = setup_test_dirs / "topics" / "test-topic.md"
        topic_file.write_text(
            "---\nslug: test-topic\nupdated: 2024-01-01T00:00:00Z\n---\n- existing fact\n"
        )

        facts = {"test-topic": ["new fact"]}
        existing = {"test-topic"}

        results = await operation_update(facts, existing)

        assert len(results) == 1
        assert results[0].operation == "UPDATE"

        updated_content = topic_file.read_text()
        assert "new fact" in updated_content

    @pytest.mark.asyncio
    async def test_no_update_for_duplicate_facts(self, setup_test_dirs):
        topic_file = setup_test_dirs / "topics" / "test-topic.md"
        topic_file.write_text(
            "---\nslug: test-topic\nupdated: 2024-01-01T00:00:00Z\n---\n- existing fact\n"
        )

        facts = {"test-topic": ["existing fact"]}
        existing = {"test-topic"}

        results = await operation_update(facts, existing)
        assert len(results) == 0


class TestOperationDelete:
    @pytest.mark.asyncio
    async def test_flag_stale_topics(self, setup_test_dirs):
        topic_file = setup_test_dirs / "topics" / "stale-topic.md"
        topic_file.write_text(
            "---\nslug: stale-topic\nupdated: 2023-01-01T00:00:00+00:00\n---\nOld content\n"
        )

        results = await operation_delete({"stale-topic"})

        assert len(results) == 1
        assert results[0].operation == "DELETE"
        assert results[0].requires_human_review is True


class TestOperationNoop:
    @pytest.mark.asyncio
    async def test_refresh_moderately_old_topics(self, setup_test_dirs):
        from datetime import datetime, timezone, timedelta

        # Create a topic ~45 days old
        old_date = (datetime.now(timezone.utc) - timedelta(days=45)).isoformat()
        topic_file = setup_test_dirs / "topics" / "moderate-topic.md"
        topic_file.write_text(
            f"---\nslug: moderate-topic\nupdated: {old_date}\n---\nContent\n"
        )

        results = await operation_noop({"moderate-topic"})

        assert len(results) == 1
        assert results[0].operation == "NOOP"
        assert results[0].requires_human_review is False


class TestOperationDeduplicate:
    @pytest.mark.asyncio
    @patch("compaction_daemon.get_embeddings")
    async def test_merge_similar_topics(self, mock_embeddings, setup_test_dirs):
        # Create two similar topics
        (setup_test_dirs / "topics" / "topic-a.md").write_text(
            "---\nslug: topic-a\n---\nAuthentication patterns\n"
        )
        (setup_test_dirs / "topics" / "topic-b.md").write_text(
            "---\nslug: topic-b\n---\nAuth patterns and best practices\n"
        )

        # Mock embeddings to return very similar vectors
        mock_embeddings.return_value = [
            [1.0, 0.0, 0.0],
            [0.99, 0.01, 0.0],
        ]

        results = await operation_deduplicate({"topic-a", "topic-b"})

        assert len(results) == 1
        assert results[0].operation == "DEDUPLICATE"


class TestHelpers:
    def test_slug_to_title(self):
        assert slug_to_title("auth-module") == "Auth Module"
        assert slug_to_title("api-v2-design") == "Api V2 Design"

    def test_cosine_similarity(self):
        assert cosine_similarity([1, 0], [1, 0]) == pytest.approx(1.0)
        assert cosine_similarity([1, 0], [0, 1]) == pytest.approx(0.0)
        assert cosine_similarity([1, 0], [-1, 0]) == pytest.approx(-1.0)
        assert cosine_similarity([0, 0], [1, 0]) == pytest.approx(0.0)

    def test_extract_frontmatter_value(self):
        content = '---\nslug: test\nupdated: 2024-01-01\n---\nBody'
        assert extract_frontmatter_value(content, "slug") == "test"
        assert extract_frontmatter_value(content, "updated") == "2024-01-01"
        assert extract_frontmatter_value(content, "missing") is None

    def test_generate_slug(self):
        assert generate_slug("Hello World!") == "hello-world"
        assert generate_slug("   spaces   ") == "spaces"
        assert len(generate_slug("a" * 100)) <= 50
