-- Book Club PDFs may be up to 20 MiB. The shared materials bucket only permits
-- admin uploads; the general Materials form keeps its separate 8 MiB cap.
update storage.buckets
set file_size_limit = 20 * 1024 * 1024
where id = 'materials' and file_size_limit = 10 * 1024 * 1024;
