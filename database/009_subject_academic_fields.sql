ALTER TABLE subjects ADD COLUMN teacher text NOT NULL DEFAULT '';
ALTER TABLE subjects ADD COLUMN hours integer NOT NULL DEFAULT 0 CHECK (hours >= 0 AND hours <= 10000);
