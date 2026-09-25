-- Run as postgres after the migration:
-- docker exec -i hydra_postgres_db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < database/tests/guardian_notifications.sql
-- Fixture accounts, schools and messages are rolled back; no student receives a test message.
BEGIN;
CREATE TEMP TABLE notification_actors (kind text, role text, id uuid DEFAULT gen_random_uuid());
INSERT INTO notification_actors (kind, role) VALUES
  ('parent_a', 'parent'), ('parent_b', 'parent'),
  ('teacher_school', 'teacher'), ('teacher_link', 'teacher'),
  ('unrelated_parent', 'parent'), ('unrelated_teacher', 'teacher'),
  ('child', 'student'), ('other_child', 'student');
CREATE TEMP TABLE notification_schools AS SELECT gen_random_uuid() AS id;
INSERT INTO public.schools (id, name) SELECT id, 'Notification test school' FROM notification_schools;
INSERT INTO auth.users (id, email, raw_user_meta_data)
SELECT id, id::text || '@notification-test.invalid',
       jsonb_build_object('role', role, 'full_name', 'Notification test', 'username', id::text)
FROM notification_actors;
INSERT INTO public.student_profiles (id, school_id)
SELECT id, CASE WHEN kind = 'child' THEN (SELECT id FROM notification_schools) END
FROM notification_actors WHERE role = 'student';
INSERT INTO public.teacher_profiles (id, school_id)
SELECT id, CASE WHEN kind = 'teacher_school' THEN (SELECT id FROM notification_schools) END
FROM notification_actors WHERE role = 'teacher';
INSERT INTO public.parent_children (parent_id, child_id)
SELECT id, (SELECT id FROM notification_actors WHERE kind = 'child')
FROM notification_actors WHERE kind IN ('parent_a', 'parent_b');
INSERT INTO public.teacher_students (teacher_id, student_id)
SELECT id, (SELECT id FROM notification_actors WHERE kind = 'child')
FROM notification_actors WHERE kind = 'teacher_link';
GRANT SELECT ON notification_actors TO authenticated;

SET LOCAL ROLE authenticated;
DO $$
DECLARE
  actor record;
  notification_kind text;
  child uuid := (SELECT id FROM notification_actors WHERE kind = 'child');
  other_child uuid := (SELECT id FROM notification_actors WHERE kind = 'other_child');
  parent uuid := (SELECT id FROM notification_actors WHERE kind = 'parent_a');
  message_row public.child_notifications;
  affected integer;
BEGIN
  FOR actor IN SELECT * FROM notification_actors WHERE kind IN ('parent_a', 'parent_b', 'teacher_school', 'teacher_link') LOOP
    FOREACH notification_kind IN ARRAY ARRAY['reminder', 'feedback'] LOOP
      PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor.id, 'role', 'authenticated')::text, true);
      INSERT INTO public.child_notifications (child_id, sender_parent_id, title, message, type)
      VALUES (child, actor.id, 'Notification test', 'Test message', notification_kind)
      RETURNING * INTO message_row;
      IF message_row.child_id <> child OR message_row.sender_parent_id <> actor.id OR message_row.is_read THEN
        RAISE EXCEPTION 'Wrong recipient, sender or unread state for %', actor.kind;
      END IF;

      BEGIN
        INSERT INTO public.child_notifications (child_id, sender_parent_id, title, message)
        VALUES (other_child, actor.id, 'Invalid recipient', 'Must be denied');
        RAISE EXCEPTION 'Unrelated recipient accepted for %', actor.kind;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;
      BEGIN
        INSERT INTO public.child_notifications (child_id, sender_parent_id, title, message)
        VALUES (child, other_child, 'Forged sender', 'Must be denied');
        RAISE EXCEPTION 'Forged sender accepted for %', actor.kind;
      EXCEPTION WHEN insufficient_privilege THEN NULL;
      END;

      PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', other_child, 'role', 'authenticated')::text, true);
      IF EXISTS (SELECT 1 FROM public.child_notifications WHERE id = message_row.id) THEN
        RAISE EXCEPTION 'Notification leaked to another student';
      END IF;

      PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', child, 'role', 'authenticated')::text, true);
      IF NOT EXISTS (SELECT 1 FROM public.child_notifications WHERE id = message_row.id AND NOT is_read) THEN
        RAISE EXCEPTION 'Recipient cannot read the new notification';
      END IF;
      UPDATE public.child_notifications SET is_read = true WHERE id = message_row.id;
      GET DIAGNOSTICS affected = ROW_COUNT;
      IF affected <> 1 THEN RAISE EXCEPTION 'Recipient cannot mark notification as read'; END IF;
      RAISE NOTICE 'PASS: % % sent, visible to recipient and marked read; unrelated recipient and forged sender blocked', actor.kind, notification_kind;
    END LOOP;
  END LOOP;

  FOR actor IN SELECT * FROM notification_actors WHERE kind IN ('unrelated_parent', 'unrelated_teacher', 'child') LOOP
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', actor.id, 'role', 'authenticated')::text, true);
    BEGIN
      INSERT INTO public.child_notifications (child_id, sender_parent_id, title, message)
      VALUES (child, actor.id, 'Invalid sender', 'Must be denied');
      RAISE EXCEPTION 'Unauthorized sender accepted: %', actor.kind;
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE NOTICE 'PASS: % cannot send to this student', actor.kind;
  END LOOP;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', parent, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO public.child_notifications (child_id, sender_parent_id, title, message)
    VALUES (parent, parent, 'Not a student', 'Must be denied');
    RAISE EXCEPTION 'Non-student recipient accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$$;
ROLLBACK;
