CREATE UNIQUE INDEX IF NOT EXISTS idx_users_standoff2_id_unique
ON users (standoff2_id)
WHERE standoff2_id IS NOT NULL;

CREATE OR REPLACE FUNCTION prevent_standoff2_id_change()
RETURNS trigger AS $$
BEGIN
  IF OLD.standoff2_id IS NOT NULL
     AND NEW.standoff2_id IS DISTINCT FROM OLD.standoff2_id THEN
    RAISE EXCEPTION 'Standoff 2 ID is immutable once assigned'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_standoff2_id_immutable ON users;
CREATE TRIGGER users_standoff2_id_immutable
BEFORE UPDATE OF standoff2_id ON users
FOR EACH ROW
EXECUTE FUNCTION prevent_standoff2_id_change();
