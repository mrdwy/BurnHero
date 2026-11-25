CREATE TABLE IF NOT EXISTS teams(id uuid PRIMARY KEY, name text NOT NULL, code text UNIQUE NOT NULL, capacity smallint NOT NULL CHECK(capacity BETWEEN 4 AND 8));
CREATE TABLE IF NOT EXISTS players(id uuid PRIMARY KEY, login text UNIQUE NOT NULL, password text NOT NULL, name text NOT NULL, team uuid REFERENCES teams, consent timestamptz);
CREATE TABLE IF NOT EXISTS posts(id uuid PRIMARY KEY, player uuid NOT NULL REFERENCES players ON DELETE CASCADE, team uuid NOT NULL REFERENCES teams, day date NOT NULL, data jsonb NOT NULL, shares text[] NOT NULL DEFAULT '{}', damage float NOT NULL, UNIQUE(player,day));
CREATE INDEX IF NOT EXISTS feed_idx ON posts(team,day DESC);
CREATE TABLE IF NOT EXISTS media(id uuid PRIMARY KEY, player uuid NOT NULL REFERENCES players ON DELETE CASCADE, day date NOT NULL, slot text NOT NULL, UNIQUE(player,day,slot));
CREATE TABLE IF NOT EXISTS likes(post uuid REFERENCES posts ON DELETE CASCADE, player uuid REFERENCES players ON DELETE CASCADE, PRIMARY KEY(post,player));
CREATE TABLE IF NOT EXISTS comments(id uuid PRIMARY KEY, post uuid NOT NULL REFERENCES posts ON DELETE CASCADE, player uuid NOT NULL REFERENCES players ON DELETE CASCADE, body text NOT NULL, at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS weeks(team uuid REFERENCES teams, week date, hp integer NOT NULL, settled boolean DEFAULT false, PRIMARY KEY(team,week));
CREATE TABLE IF NOT EXISTS payouts(team uuid,week date,player uuid REFERENCES players ON DELETE CASCADE, coins integer NOT NULL, PRIMARY KEY(team,week,player),FOREIGN KEY(team,week) REFERENCES weeks);
