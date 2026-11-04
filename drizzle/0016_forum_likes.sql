-- Likes on forum posts: one per member and post, a second click takes it back.
CREATE TABLE forum_likes (
	post_id text NOT NULL REFERENCES forum_posts(id) ON DELETE CASCADE,
	user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
	created_at text NOT NULL,
	PRIMARY KEY (post_id, user_id)
);
CREATE INDEX idx_forum_likes_user ON forum_likes(user_id);
