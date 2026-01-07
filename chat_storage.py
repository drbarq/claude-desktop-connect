#!/usr/bin/env python3
"""
Local Chat Storage

SQLite-based storage for conversations, mimicking Claude Desktop's functionality
but keeping everything local and using Bedrock as the backend.
"""

import sqlite3
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional
from dataclasses import dataclass, asdict


# Default storage location
DEFAULT_DB_PATH = Path.home() / ".config" / "claude-bedrock" / "chats.db"


@dataclass
class Message:
    """A single message in a conversation."""
    id: str
    conversation_id: str
    role: str  # "user" or "assistant"
    content: str
    created_at: str
    metadata: Optional[dict] = None

    def to_api_format(self) -> dict:
        """Convert to Anthropic API message format."""
        return {"role": self.role, "content": self.content}


@dataclass
class Conversation:
    """A conversation with multiple messages."""
    id: str
    title: str
    created_at: str
    updated_at: str
    model: str
    system_prompt: Optional[str] = None
    metadata: Optional[dict] = None


class ChatStorage:
    """SQLite-based chat storage."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or DEFAULT_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        """Initialize the database schema."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    model TEXT NOT NULL,
                    system_prompt TEXT,
                    metadata TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    metadata TEXT,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
                        ON DELETE CASCADE
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_conversation
                ON messages(conversation_id)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_conversations_updated
                ON conversations(updated_at DESC)
            """)
            conn.commit()

    def create_conversation(
        self,
        title: str = "New Chat",
        model: str = "opus",
        system_prompt: Optional[str] = None
    ) -> Conversation:
        """Create a new conversation."""
        now = datetime.utcnow().isoformat()
        conv = Conversation(
            id=str(uuid.uuid4()),
            title=title,
            created_at=now,
            updated_at=now,
            model=model,
            system_prompt=system_prompt
        )

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT INTO conversations
                   (id, title, created_at, updated_at, model, system_prompt, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (conv.id, conv.title, conv.created_at, conv.updated_at,
                 conv.model, conv.system_prompt, json.dumps(conv.metadata))
            )
            conn.commit()

        return conv

    def get_conversation(self, conversation_id: str) -> Optional[Conversation]:
        """Get a conversation by ID."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM conversations WHERE id = ?",
                (conversation_id,)
            ).fetchone()

            if row:
                return Conversation(
                    id=row["id"],
                    title=row["title"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    model=row["model"],
                    system_prompt=row["system_prompt"],
                    metadata=json.loads(row["metadata"]) if row["metadata"] else None
                )
        return None

    def list_conversations(self, limit: int = 50) -> list[Conversation]:
        """List recent conversations."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT * FROM conversations
                   ORDER BY updated_at DESC LIMIT ?""",
                (limit,)
            ).fetchall()

            return [
                Conversation(
                    id=row["id"],
                    title=row["title"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    model=row["model"],
                    system_prompt=row["system_prompt"],
                    metadata=json.loads(row["metadata"]) if row["metadata"] else None
                )
                for row in rows
            ]

    def update_conversation(
        self,
        conversation_id: str,
        title: Optional[str] = None,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None
    ):
        """Update conversation metadata."""
        updates = []
        params = []

        if title is not None:
            updates.append("title = ?")
            params.append(title)
        if model is not None:
            updates.append("model = ?")
            params.append(model)
        if system_prompt is not None:
            updates.append("system_prompt = ?")
            params.append(system_prompt)

        if updates:
            updates.append("updated_at = ?")
            params.append(datetime.utcnow().isoformat())
            params.append(conversation_id)

            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    f"UPDATE conversations SET {', '.join(updates)} WHERE id = ?",
                    params
                )
                conn.commit()

    def delete_conversation(self, conversation_id: str):
        """Delete a conversation and all its messages."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
            conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
            conn.commit()

    def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        metadata: Optional[dict] = None
    ) -> Message:
        """Add a message to a conversation."""
        now = datetime.utcnow().isoformat()
        msg = Message(
            id=str(uuid.uuid4()),
            conversation_id=conversation_id,
            role=role,
            content=content,
            created_at=now,
            metadata=metadata
        )

        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """INSERT INTO messages
                   (id, conversation_id, role, content, created_at, metadata)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (msg.id, msg.conversation_id, msg.role, msg.content,
                 msg.created_at, json.dumps(msg.metadata))
            )
            # Update conversation's updated_at
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (now, conversation_id)
            )
            conn.commit()

        return msg

    def get_messages(self, conversation_id: str) -> list[Message]:
        """Get all messages in a conversation."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT * FROM messages
                   WHERE conversation_id = ?
                   ORDER BY created_at ASC""",
                (conversation_id,)
            ).fetchall()

            return [
                Message(
                    id=row["id"],
                    conversation_id=row["conversation_id"],
                    role=row["role"],
                    content=row["content"],
                    created_at=row["created_at"],
                    metadata=json.loads(row["metadata"]) if row["metadata"] else None
                )
                for row in rows
            ]

    def get_messages_for_api(self, conversation_id: str) -> list[dict]:
        """Get messages in Anthropic API format."""
        messages = self.get_messages(conversation_id)
        return [msg.to_api_format() for msg in messages]

    def generate_title_from_message(self, content: str) -> str:
        """Generate a conversation title from the first message."""
        # Take first 50 chars, cut at word boundary
        if len(content) <= 50:
            return content
        truncated = content[:50]
        last_space = truncated.rfind(" ")
        if last_space > 20:
            truncated = truncated[:last_space]
        return truncated + "..."

    def search_conversations(self, query: str, limit: int = 20) -> list[Conversation]:
        """Search conversations by title or message content."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """SELECT DISTINCT c.* FROM conversations c
                   LEFT JOIN messages m ON c.id = m.conversation_id
                   WHERE c.title LIKE ? OR m.content LIKE ?
                   ORDER BY c.updated_at DESC LIMIT ?""",
                (f"%{query}%", f"%{query}%", limit)
            ).fetchall()

            return [
                Conversation(
                    id=row["id"],
                    title=row["title"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    model=row["model"],
                    system_prompt=row["system_prompt"],
                    metadata=json.loads(row["metadata"]) if row["metadata"] else None
                )
                for row in rows
            ]

    def export_conversation(self, conversation_id: str) -> dict:
        """Export a conversation to JSON format."""
        conv = self.get_conversation(conversation_id)
        if not conv:
            return {}

        messages = self.get_messages(conversation_id)

        return {
            "conversation": asdict(conv),
            "messages": [asdict(msg) for msg in messages]
        }

    def import_conversation(self, data: dict) -> Optional[str]:
        """Import a conversation from JSON format."""
        try:
            conv_data = data["conversation"]
            messages_data = data["messages"]

            # Create new IDs
            new_conv_id = str(uuid.uuid4())
            now = datetime.utcnow().isoformat()

            with sqlite3.connect(self.db_path) as conn:
                conn.execute(
                    """INSERT INTO conversations
                       (id, title, created_at, updated_at, model, system_prompt, metadata)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (new_conv_id, conv_data["title"], now, now,
                     conv_data.get("model", "opus"),
                     conv_data.get("system_prompt"),
                     json.dumps(conv_data.get("metadata")))
                )

                for msg in messages_data:
                    conn.execute(
                        """INSERT INTO messages
                           (id, conversation_id, role, content, created_at, metadata)
                           VALUES (?, ?, ?, ?, ?, ?)""",
                        (str(uuid.uuid4()), new_conv_id, msg["role"],
                         msg["content"], now, json.dumps(msg.get("metadata")))
                    )

                conn.commit()

            return new_conv_id
        except Exception as e:
            print(f"Import error: {e}")
            return None


# Convenience functions
_default_storage: Optional[ChatStorage] = None


def get_storage() -> ChatStorage:
    """Get the default chat storage instance."""
    global _default_storage
    if _default_storage is None:
        _default_storage = ChatStorage()
    return _default_storage
