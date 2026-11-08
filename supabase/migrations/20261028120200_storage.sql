-- STILLFORM · image storage
--
-- One public bucket, "media", for product and editorial photographs. Files are
-- readable by URL (so the storefront and CDN can serve them) but only
-- administrators can list, upload, replace or delete them. Uploads are limited
-- to web image formats and 10 MB. The dashboard names every upload with a
-- random id, so unpublished photographs are not guessable.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media: admins read" on storage.objects;
create policy "media: admins read" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_admin());

drop policy if exists "media: admins upload" on storage.objects;
create policy "media: admins upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_admin());

drop policy if exists "media: admins replace" on storage.objects;
create policy "media: admins replace" on storage.objects for update to authenticated
  using (bucket_id = 'media' and public.is_admin())
  with check (bucket_id = 'media' and public.is_admin());

drop policy if exists "media: admins delete" on storage.objects;
create policy "media: admins delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and public.is_admin());
