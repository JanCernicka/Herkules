-- Pre databázu vytvorenú pred 2026-10-01 (bez stĺpca film). Spusti raz.
ALTER TABLE prihlasky ADD COLUMN film TEXT;
