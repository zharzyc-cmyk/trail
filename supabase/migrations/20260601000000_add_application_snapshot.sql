-- Snapshot the generated resume on each application row so the user can
-- print the original PDF later (the AI's sections HTML carries the
-- visual highlights that markdown alone can't reproduce).
-- Already-existing rows stay NULL; the applications UI shows the
-- 打印 / 保存 PDF button as disabled for those legacy entries.

ALTER TABLE applications
  ADD COLUMN sections JSONB DEFAULT NULL,
  ADD COLUMN name TEXT DEFAULT NULL,
  ADD COLUMN contact_html TEXT DEFAULT NULL,
  ADD COLUMN photo_url TEXT DEFAULT NULL;
