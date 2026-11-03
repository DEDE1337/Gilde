-- Registrations announced in Discord: the officers decide with a reaction under that message.
CREATE TABLE IF NOT EXISTS register_approvals (
	user_id text PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	channel_id text NOT NULL,
	message_id text NOT NULL,
	created_at text NOT NULL,
	decided_at text
);
