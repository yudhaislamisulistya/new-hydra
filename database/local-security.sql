CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT role::text FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'::public.user_role
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_student(student_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    student_uuid = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.parent_children
      WHERE parent_id = auth.uid() AND child_id = student_uuid
    )
    OR (
      public.current_user_role() = 'teacher'
      AND EXISTS (
        SELECT 1
        FROM public.teacher_profiles teacher
        JOIN public.student_profiles student ON student.school_id = teacher.school_id
        WHERE teacher.id = auth.uid() AND student.id = student_uuid
      )
    )
    OR (
      public.current_user_role() = 'teacher'
      AND EXISTS (
        SELECT 1 FROM public.teacher_students
        WHERE teacher_id = auth.uid() AND student_id = student_uuid
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.link_child_by_code(student_code_input text)
RETURNS public.parent_children
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  child_uuid uuid;
  linked_row public.parent_children;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'parent' THEN
    RAISE EXCEPTION 'Only parent accounts can link a child' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO child_uuid
  FROM public.student_profiles
  WHERE upper(student_code) = upper(trim(student_code_input));

  IF child_uuid IS NULL THEN
    RAISE EXCEPTION 'Student code was not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.parent_children (parent_id, child_id)
  VALUES (auth.uid(), child_uuid)
  RETURNING * INTO linked_row;

  RETURN linked_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(user_id_input uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;

  IF user_id_input = auth.uid() THEN
    RAISE EXCEPTION 'The active administrator cannot delete itself' USING ERRCODE = '42501';
  END IF;

  DELETE FROM auth.users WHERE id = user_id_input;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User was not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_leaderboard()
RETURNS TABLE (
  id uuid,
  name text,
  survey_count bigint,
  hydration_count bigint,
  checkin_count bigint,
  checkin_xp bigint,
  total_xp bigint,
  rank bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH survey_totals AS (
    SELECT respondent_id AS student_id, count(*)::bigint AS survey_count
    FROM public.survey_responses
    GROUP BY respondent_id
  ), hydration_totals AS (
    SELECT student_id, count(*)::bigint AS hydration_count
    FROM public.hydration_logs
    GROUP BY student_id
  ), checkin_totals AS (
    SELECT student_id,
           count(*)::bigint AS checkin_count,
           coalesce(sum(xp_earned), 0)::bigint AS checkin_xp
    FROM public.daily_checkins
    GROUP BY student_id
  ), scores AS (
    SELECT student.id,
           coalesce(profile.full_name, 'Siswa') AS name,
           coalesce(survey.survey_count, 0)::bigint AS survey_count,
           coalesce(hydration.hydration_count, 0)::bigint AS hydration_count,
           coalesce(checkin.checkin_count, 0)::bigint AS checkin_count,
           coalesce(checkin.checkin_xp, 0)::bigint AS checkin_xp,
           (
             coalesce(survey.survey_count, 0) * 100
             + coalesce(hydration.hydration_count, 0) * 10
             + coalesce(checkin.checkin_xp, 0)
           )::bigint AS total_xp
    FROM public.student_profiles student
    JOIN public.profiles profile ON profile.id = student.id
    LEFT JOIN survey_totals survey ON survey.student_id = student.id
    LEFT JOIN hydration_totals hydration ON hydration.student_id = student.id
    LEFT JOIN checkin_totals checkin ON checkin.student_id = student.id
  )
  SELECT scores.*,
         row_number() OVER (ORDER BY total_xp DESC, name ASC, id ASC)::bigint AS rank
  FROM scores
  ORDER BY rank
$$;

REVOKE ALL ON FUNCTION public.current_user_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_access_student(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_child_by_code(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_leaderboard() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_student(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_child_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_leaderboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, full_name, email, username)
  VALUES (
    NEW.id,
    CASE
      WHEN coalesce(NEW.raw_user_meta_data->>'role', 'student') IN ('student', 'parent', 'teacher')
        THEN (NEW.raw_user_meta_data->>'role')::public.user_role
      ELSE 'student'::public.user_role
    END,
    nullif(trim(coalesce(NEW.raw_user_meta_data->>'full_name', '')), ''),
    NEW.email,
    coalesce(
      nullif(lower(regexp_replace(coalesce(NEW.raw_user_meta_data->>'username', ''), '\s+', '', 'g')), ''),
      split_part(coalesce(NEW.email, concat('user_', substr(NEW.id::text, 1, 8))), '@', 1)
    )
  )
  ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      username = EXCLUDED.username;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can change a user role' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_role ON public.profiles;
CREATE TRIGGER protect_profile_role
BEFORE UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

CREATE OR REPLACE FUNCTION public.protect_student_study_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.study_group IS DISTINCT FROM OLD.study_group AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can change a student study group' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_student_study_group ON public.student_profiles;
CREATE TRIGGER protect_student_study_group
BEFORE UPDATE OF study_group ON public.student_profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_student_study_group();

CREATE OR REPLACE FUNCTION public.protect_teacher_school()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.school_id IS DISTINCT FROM OLD.school_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only administrators can change a teacher school' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_teacher_school ON public.teacher_profiles;
CREATE TRIGGER protect_teacher_school
BEFORE UPDATE OF school_id ON public.teacher_profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_teacher_school();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$
DECLARE
  policy_row record;
  table_name text;
BEGIN
  FOR policy_row IN
    SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', policy_row.policyname, policy_row.tablename);
  END LOOP;

  FOR table_name IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY admin_all ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
      table_name
    );
  END LOOP;
END
$$;

CREATE POLICY profiles_read_accessible
ON public.profiles FOR SELECT TO authenticated
USING (id = auth.uid() OR public.can_access_student(id));

CREATE POLICY profiles_update_self
ON public.profiles FOR UPDATE TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY schools_read_public
ON public.schools FOR SELECT TO anon
USING (is_active);

CREATE POLICY schools_read_authenticated
ON public.schools FOR SELECT TO authenticated
USING (true);

CREATE POLICY student_profiles_read_accessible
ON public.student_profiles FOR SELECT TO authenticated
USING (public.can_access_student(id));

CREATE POLICY student_profiles_insert_self
ON public.student_profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() AND public.current_user_role() = 'student');

CREATE POLICY student_profiles_update_self
ON public.student_profiles FOR UPDATE TO authenticated
USING (id = auth.uid() AND public.current_user_role() = 'student')
WITH CHECK (id = auth.uid() AND public.current_user_role() = 'student');

CREATE POLICY parent_profiles_read_self
ON public.parent_profiles FOR SELECT TO authenticated
USING (id = auth.uid());

CREATE POLICY parent_profiles_insert_self
ON public.parent_profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() AND public.current_user_role() = 'parent');

CREATE POLICY parent_profiles_update_self
ON public.parent_profiles FOR UPDATE TO authenticated
USING (id = auth.uid() AND public.current_user_role() = 'parent')
WITH CHECK (id = auth.uid() AND public.current_user_role() = 'parent');

CREATE POLICY teacher_profiles_read_self
ON public.teacher_profiles FOR SELECT TO authenticated
USING (id = auth.uid());

CREATE POLICY teacher_profiles_insert_self
ON public.teacher_profiles FOR INSERT TO authenticated
WITH CHECK (id = auth.uid() AND public.current_user_role() = 'teacher');

CREATE POLICY teacher_profiles_update_self
ON public.teacher_profiles FOR UPDATE TO authenticated
USING (id = auth.uid() AND public.current_user_role() = 'teacher')
WITH CHECK (id = auth.uid() AND public.current_user_role() = 'teacher');

CREATE POLICY parent_children_read_related
ON public.parent_children FOR SELECT TO authenticated
USING (parent_id = auth.uid() OR child_id = auth.uid());

CREATE POLICY parent_children_insert_parent
ON public.parent_children FOR INSERT TO authenticated
WITH CHECK (parent_id = auth.uid() AND public.current_user_role() = 'parent');

CREATE POLICY parent_children_delete_parent
ON public.parent_children FOR DELETE TO authenticated
USING (parent_id = auth.uid());

CREATE POLICY hydration_logs_read_accessible
ON public.hydration_logs FOR SELECT TO authenticated
USING (public.can_access_student(student_id));

CREATE POLICY hydration_logs_insert_self
ON public.hydration_logs FOR INSERT TO authenticated
WITH CHECK (student_id = auth.uid());

CREATE POLICY hydration_logs_update_self
ON public.hydration_logs FOR UPDATE TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

CREATE POLICY hydration_logs_delete_self
ON public.hydration_logs FOR DELETE TO authenticated
USING (student_id = auth.uid());

CREATE POLICY daily_checkins_read_accessible
ON public.daily_checkins FOR SELECT TO authenticated
USING (public.can_access_student(student_id));

CREATE POLICY daily_checkins_insert_self
ON public.daily_checkins FOR INSERT TO authenticated
WITH CHECK (student_id = auth.uid());

CREATE POLICY daily_checkins_update_self
ON public.daily_checkins FOR UPDATE TO authenticated
USING (student_id = auth.uid())
WITH CHECK (student_id = auth.uid());

CREATE POLICY daily_checkins_delete_self
ON public.daily_checkins FOR DELETE TO authenticated
USING (student_id = auth.uid());

CREATE POLICY notifications_read_related
ON public.child_notifications FOR SELECT TO authenticated
USING (child_id = auth.uid() OR sender_parent_id = auth.uid());

CREATE POLICY notifications_insert_guardian
ON public.child_notifications FOR INSERT TO authenticated
WITH CHECK (
  sender_parent_id = auth.uid()
  AND public.current_user_role() = 'parent'
  AND public.can_access_student(child_id)
);

CREATE POLICY notifications_update_child
ON public.child_notifications FOR UPDATE TO authenticated
USING (child_id = auth.uid())
WITH CHECK (child_id = auth.uid());

CREATE POLICY notifications_delete_related
ON public.child_notifications FOR DELETE TO authenticated
USING (child_id = auth.uid() OR sender_parent_id = auth.uid());

CREATE POLICY feedback_read_related
ON public.hydration_feedback FOR SELECT TO authenticated
USING (author_id = auth.uid() OR public.can_access_student(student_id));

CREATE POLICY feedback_insert_author
ON public.hydration_feedback FOR INSERT TO authenticated
WITH CHECK (author_id = auth.uid() AND public.can_access_student(student_id));

CREATE POLICY feedback_update_author
ON public.hydration_feedback FOR UPDATE TO authenticated
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

CREATE POLICY surveys_read_active
ON public.surveys FOR SELECT TO authenticated
USING (is_active);

CREATE POLICY survey_questions_read_active
ON public.survey_questions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.surveys
  WHERE surveys.id = survey_questions.survey_id AND surveys.is_active
));

CREATE POLICY education_materials_read_published
ON public.education_materials FOR SELECT TO authenticated
USING (
  is_published
  AND (
    public.current_user_role() IS DISTINCT FROM 'student'
    OR EXISTS (
      SELECT 1
      FROM public.student_profiles
      WHERE student_profiles.id = auth.uid()
        AND student_profiles.study_group = 'intervention'
    )
  )
);

CREATE POLICY survey_responses_read_accessible
ON public.survey_responses FOR SELECT TO authenticated
USING (
  respondent_id = auth.uid()
  OR (student_id IS NOT NULL AND public.can_access_student(student_id))
);

CREATE POLICY survey_responses_insert_self
ON public.survey_responses FOR INSERT TO authenticated
WITH CHECK (
  respondent_id = auth.uid()
  AND (student_id IS NULL OR student_id = auth.uid())
);

CREATE POLICY survey_responses_update_self
ON public.survey_responses FOR UPDATE TO authenticated
USING (respondent_id = auth.uid())
WITH CHECK (respondent_id = auth.uid());

CREATE POLICY survey_answers_read_accessible
ON public.survey_answers FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.survey_responses response
  WHERE response.id = survey_answers.response_id
    AND (
      response.respondent_id = auth.uid()
      OR (response.student_id IS NOT NULL AND public.can_access_student(response.student_id))
    )
));

CREATE POLICY survey_answers_insert_self
ON public.survey_answers FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.survey_responses response
  WHERE response.id = survey_answers.response_id
    AND response.respondent_id = auth.uid()
));

CREATE POLICY teacher_students_read_related
ON public.teacher_students FOR SELECT TO authenticated
USING (teacher_id = auth.uid() OR student_id = auth.uid());

CREATE POLICY teacher_students_insert_teacher
ON public.teacher_students FOR INSERT TO authenticated
WITH CHECK (
  teacher_id = auth.uid()
  AND public.current_user_role() = 'teacher'
  AND public.can_access_student(student_id)
);

CREATE POLICY teacher_students_delete_teacher
ON public.teacher_students FOR DELETE TO authenticated
USING (teacher_id = auth.uid());
