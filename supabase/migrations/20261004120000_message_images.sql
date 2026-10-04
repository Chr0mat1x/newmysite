-- ---------------------------------------------------------------------------
-- message images
-- ---------------------------------------------------------------------------
-- A private transmission may now carry an image, the same way a satellite can.
-- The image is a URL or data URL string, not a blob — the client picks or pastes
-- it, exactly like the post composer, so no storage bucket is involved.
--
-- `body` was `not null check (length(btrim(body)) > 0)`, which forbids a line
-- that is only an image. The constraint is replaced by "body or image", and
-- `body` gets a default so an image-only insert can omit it.

alter table public.messages add column if not exists image text;

alter table public.messages alter column body set default '';

-- Postgres names an inline check after its column, so the old rule is
-- `messages_body_check`; drop it by name before widening it.
alter table public.messages drop constraint if exists messages_body_check;
alter table public.messages add constraint messages_body_check
  check (length(btrim(body)) > 0 or length(btrim(coalesce(image, ''))) > 0);
