-- ============================================================
-- Migration 015: RPC for updating reading progress
-- ============================================================
-- The user_library RLS allows buyers to SELECT their own rows,
-- but does NOT allow UPDATE (only admin/staff can modify).
-- That blocks the Continue Reading save from migration 014.
--
-- This RPC runs with SECURITY DEFINER so it bypasses RLS, but
-- ONLY updates last_page + last_read_at, only for books the
-- buyer actually owns (access_status = 'active'). They cannot
-- escalate access_status, change book_id, or modify other rows.
-- ============================================================

create or replace function public.update_reading_progress(
  p_book_id uuid,
  p_last_page integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  -- Reject obviously bad input
  if p_last_page is null or p_last_page < 1 then
    return false;
  end if;

  v_profile_id := public.current_profile_id();
  if v_profile_id is null then
    return false;
  end if;

  -- Only updates rows the user actually owns with active access.
  -- Safe: cannot affect access_status, book_id, user_id, or other users' rows.
  update public.user_library
  set
    last_page = p_last_page,
    last_read_at = now()
  where
    user_id = v_profile_id
    and book_id = p_book_id
    and access_status = 'active';

  return found;
end;
$$;

-- Lock down: only authenticated users (buyers) can call this
revoke all on function public.update_reading_progress(uuid, integer) from public;
grant execute on function public.update_reading_progress(uuid, integer) to authenticated;

notify pgrst, 'reload schema';
