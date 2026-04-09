import { Client } from "pg";

export class PostgresStore {
  constructor(connectionString = "") {
    this.connectionString = String(connectionString || "").trim();
    this.enabled = Boolean(this.connectionString);
    this.client = null;
    this.initialized = false;
  }

  async init() {
    if (!this.enabled || this.initialized) {
      return;
    }

    this.client = new Client({ connectionString: this.connectionString });
    await this.client.connect();

    await this.client.query(`
      CREATE TABLE IF NOT EXISTS v2_room_messages (
        room_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        envelope JSONB NOT NULL,
        PRIMARY KEY (room_id, message_id)
      );
    `);

    this.initialized = true;
  }

  async saveRoomMessage(roomId, messageId, senderId, createdAt, envelope) {
    if (!this.enabled || !this.client) {
      return;
    }

    await this.client.query(
      `
        INSERT INTO v2_room_messages (room_id, message_id, sender_id, created_at, envelope)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (room_id, message_id)
        DO UPDATE SET sender_id = EXCLUDED.sender_id, created_at = EXCLUDED.created_at, envelope = EXCLUDED.envelope;
      `,
      [roomId, messageId, senderId, Math.round(Number(createdAt) || Date.now()), envelope]
    );
  }

  async deleteRoomMessage(roomId, messageId) {
    if (!this.enabled || !this.client) {
      return;
    }

    await this.client.query(
      `DELETE FROM v2_room_messages WHERE room_id = $1 AND message_id = $2`,
      [roomId, messageId]
    );
  }

  async loadRecentMessages(roomId, limit = 500) {
    if (!this.enabled || !this.client) {
      return [];
    }

    const maxRows = Math.max(1, Math.min(1000, Math.round(Number(limit) || 500)));
    const result = await this.client.query(
      `
        SELECT envelope
        FROM v2_room_messages
        WHERE room_id = $1
        ORDER BY created_at DESC
        LIMIT $2
      `,
      [roomId, maxRows]
    );

    return result.rows
      .map((row) => row?.envelope)
      .filter((item) => item && typeof item === "object")
      .reverse();
  }

  async close() {
    if (!this.client) {
      return;
    }

    await this.client.end();
    this.client = null;
    this.initialized = false;
  }
}
