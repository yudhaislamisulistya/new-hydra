BEGIN;

-- sender_parent_id is the existing sender profile ID for both parents and
-- teachers. Keep the field and existing notification history compatible.
DROP POLICY IF EXISTS notifications_insert_guardian ON public.child_notifications;
CREATE POLICY notifications_insert_guardian
ON public.child_notifications FOR INSERT TO authenticated
WITH CHECK (
  sender_parent_id = auth.uid()
  AND public.current_user_role() IN ('parent', 'teacher')
  AND public.can_access_student(child_id)
  AND EXISTS (SELECT 1 FROM public.student_profiles student WHERE student.id = child_id)
);

COMMIT;
NOTIFY pgrst, 'reload schema';
