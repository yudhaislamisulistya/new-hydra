


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."content_type" AS ENUM (
    'article',
    'video',
    'infographic'
);


ALTER TYPE "public"."content_type" OWNER TO "postgres";


CREATE TYPE "public"."gender_type" AS ENUM (
    'male',
    'female'
);


ALTER TYPE "public"."gender_type" OWNER TO "postgres";


CREATE TYPE "public"."question_type" AS ENUM (
    'text',
    'multiple_choice',
    'scale'
);


ALTER TYPE "public"."question_type" OWNER TO "postgres";


CREATE TYPE "public"."target_audience" AS ENUM (
    'student',
    'parent',
    'all'
);


ALTER TYPE "public"."target_audience" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'student',
    'parent',
    'admin',
    'teacher'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (
    id,
    role,
    full_name,
    email,
    username
  )
  values (
    new.id,
    case
      when coalesce(new.raw_user_meta_data->>'role', 'student') in ('student', 'parent', 'admin', 'teacher')
        then (new.raw_user_meta_data->>'role')::public.user_role
      else 'student'::public.user_role
    end,
    nullif(trim(coalesce(new.raw_user_meta_data->>'full_name', '')), ''),
    new.email,
    coalesce(
      nullif(lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', ''), '\s+', '', 'g')), ''),
      split_part(coalesce(new.email, concat('user_', substr(new.id::text, 1, 8))), '@', 1)
    )
  )
  on conflict (id) do update
  set
    role = excluded.role,
    full_name = excluded.full_name,
    email = excluded.email,
    username = excluded.username;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."child_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "child_id" "uuid" NOT NULL,
    "sender_parent_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "text" DEFAULT 'reminder'::"text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."child_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "checkin_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "xp_earned" integer DEFAULT 20 NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "daily_checkins_xp_earned_chk" CHECK (("xp_earned" >= 0))
);


ALTER TABLE "public"."daily_checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."education_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "content" "text" NOT NULL,
    "type" "public"."content_type" DEFAULT 'article'::"public"."content_type" NOT NULL,
    "media_url" "text",
    "target_audience" "public"."target_audience" DEFAULT 'all'::"public"."target_audience",
    "created_by" "uuid",
    "is_published" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "survey_id" "uuid"
);


ALTER TABLE "public"."education_materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hydration_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "target_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "feedback_type" "text" DEFAULT 'follow_up'::"text" NOT NULL,
    "message" "text" NOT NULL,
    "related_log_id" "uuid",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."hydration_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hydration_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid" NOT NULL,
    "amount_ml" integer NOT NULL,
    "drink_type" "text" DEFAULT 'water'::"text",
    "logged_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."hydration_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parent_children" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "parent_id" "uuid" NOT NULL,
    "child_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."parent_children" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."parent_profiles" (
    "id" "uuid" NOT NULL,
    "education_level" "text",
    "occupation" "text",
    "gender" "public"."gender_type",
    "age_years" integer,
    "income_category" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "income_reference" "text",
    "income_amount" numeric(12,2),
    CONSTRAINT "parent_profiles_age_years_chk" CHECK ((("age_years" IS NULL) OR ("age_years" >= 17))),
    CONSTRAINT "parent_profiles_income_amount_chk" CHECK ((("income_amount" IS NULL) OR ("income_amount" >= (0)::numeric))),
    CONSTRAINT "parent_profiles_income_category_chk" CHECK ((("income_category" IS NULL) OR ("income_category" = ANY (ARRAY['umr'::"text", 'tidak_umr'::"text"])))),
    CONSTRAINT "parent_profiles_income_reference_chk" CHECK ((("income_reference" IS NULL) OR ("income_reference" = ANY (ARRAY['umk_banyumas_2026'::"text", 'ump_jateng_2026'::"text"]))))
);


ALTER TABLE "public"."parent_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "public"."user_role" DEFAULT 'student'::"public"."user_role" NOT NULL,
    "full_name" "text",
    "email" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "username" "text" NOT NULL,
    CONSTRAINT "profiles_username_length_chk" CHECK (("char_length"("username") >= 3))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schools" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "city" "text",
    "province" "text",
    "postal_code" "text",
    "contact_person" "text",
    "phone" "text",
    "created_by" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."schools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."student_profiles" (
    "id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "birth_date" "date",
    "gender" "public"."gender_type",
    "weight_kg" numeric(5,2),
    "height_cm" numeric(5,2),
    "daily_water_target_ml" integer DEFAULT 1500,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "student_code" "text",
    "school_id" "uuid",
    "class_level" integer,
    "child_order" integer,
    CONSTRAINT "student_profiles_child_order_chk" CHECK ((("child_order" IS NULL) OR ("child_order" >= 1))),
    CONSTRAINT "student_profiles_class_level_chk" CHECK ((("class_level" IS NULL) OR ("class_level" = ANY (ARRAY[5, 6]))))
);


ALTER TABLE "public"."student_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_answers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "response_id" "uuid" NOT NULL,
    "question_id" "uuid" NOT NULL,
    "answer_text" "text",
    "selected_option" "text",
    "scale_value" integer
);


ALTER TABLE "public"."survey_answers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_questions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "survey_id" "uuid" NOT NULL,
    "question_text" "text" NOT NULL,
    "question_type" "public"."question_type" NOT NULL,
    "options" "jsonb",
    "order_number" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "correct_answer" "text"
);


ALTER TABLE "public"."survey_questions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."survey_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "survey_id" "uuid" NOT NULL,
    "respondent_id" "uuid" NOT NULL,
    "student_id" "uuid",
    "submitted_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "answers" "jsonb"
);


ALTER TABLE "public"."survey_responses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."surveys" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "target_role" "public"."user_role" DEFAULT 'student'::"public"."user_role",
    "is_active" boolean DEFAULT true,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "survey_type" "text" DEFAULT 'survey'::"text" NOT NULL,
    "randomize_questions" boolean DEFAULT false NOT NULL,
    "randomize_options" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."surveys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teacher_profiles" (
    "id" "uuid" NOT NULL,
    "school_id" "uuid",
    "employee_number" "text",
    "full_title" "text",
    "gender" "public"."gender_type",
    "phone" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."teacher_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teacher_students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "teacher_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."teacher_students" OWNER TO "postgres";


ALTER TABLE ONLY "public"."child_notifications"
    ADD CONSTRAINT "child_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_unique" UNIQUE ("student_id", "checkin_date");



ALTER TABLE ONLY "public"."education_materials"
    ADD CONSTRAINT "education_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hydration_feedback"
    ADD CONSTRAINT "hydration_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hydration_logs"
    ADD CONSTRAINT "hydration_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_children"
    ADD CONSTRAINT "parent_children_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."parent_children"
    ADD CONSTRAINT "parent_children_unique" UNIQUE ("parent_id", "child_id");



ALTER TABLE ONLY "public"."parent_profiles"
    ADD CONSTRAINT "parent_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_student_code_key" UNIQUE ("student_code");



ALTER TABLE ONLY "public"."survey_answers"
    ADD CONSTRAINT "survey_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_questions"
    ADD CONSTRAINT "survey_questions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."surveys"
    ADD CONSTRAINT "surveys_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teacher_profiles"
    ADD CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teacher_students"
    ADD CONSTRAINT "teacher_students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teacher_students"
    ADD CONSTRAINT "teacher_students_unique" UNIQUE ("teacher_id", "student_id");



CREATE INDEX "child_notifications_child_id_idx" ON "public"."child_notifications" USING "btree" ("child_id", "created_at" DESC);



CREATE INDEX "child_notifications_parent_id_idx" ON "public"."child_notifications" USING "btree" ("sender_parent_id", "created_at" DESC);



CREATE INDEX "daily_checkins_student_date_idx" ON "public"."daily_checkins" USING "btree" ("student_id", "checkin_date" DESC);



CREATE INDEX "hydration_feedback_author_idx" ON "public"."hydration_feedback" USING "btree" ("author_id", "created_at" DESC);



CREATE INDEX "hydration_feedback_student_date_idx" ON "public"."hydration_feedback" USING "btree" ("student_id", "target_date" DESC);



CREATE UNIQUE INDEX "profiles_username_unique_idx" ON "public"."profiles" USING "btree" ("lower"("username"));



CREATE INDEX "schools_name_idx" ON "public"."schools" USING "btree" ("lower"("name"));



CREATE INDEX "student_profiles_class_level_idx" ON "public"."student_profiles" USING "btree" ("class_level");



CREATE INDEX "student_profiles_school_id_idx" ON "public"."student_profiles" USING "btree" ("school_id");



CREATE INDEX "teacher_profiles_school_id_idx" ON "public"."teacher_profiles" USING "btree" ("school_id");



CREATE INDEX "teacher_students_student_id_idx" ON "public"."teacher_students" USING "btree" ("student_id");



CREATE INDEX "teacher_students_teacher_id_idx" ON "public"."teacher_students" USING "btree" ("teacher_id");



CREATE OR REPLACE TRIGGER "set_timestamp_hydration_feedback" BEFORE UPDATE ON "public"."hydration_feedback" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_parent_profiles" BEFORE UPDATE ON "public"."parent_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_schools" BEFORE UPDATE ON "public"."schools" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_timestamp_teacher_profiles" BEFORE UPDATE ON "public"."teacher_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."child_notifications"
    ADD CONSTRAINT "child_notifications_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."child_notifications"
    ADD CONSTRAINT "child_notifications_sender_parent_id_fkey" FOREIGN KEY ("sender_parent_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."education_materials"
    ADD CONSTRAINT "education_materials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."education_materials"
    ADD CONSTRAINT "education_materials_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hydration_feedback"
    ADD CONSTRAINT "hydration_feedback_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hydration_feedback"
    ADD CONSTRAINT "hydration_feedback_related_log_id_fkey" FOREIGN KEY ("related_log_id") REFERENCES "public"."hydration_logs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hydration_feedback"
    ADD CONSTRAINT "hydration_feedback_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hydration_logs"
    ADD CONSTRAINT "hydration_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_children"
    ADD CONSTRAINT "parent_children_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "public"."student_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_children"
    ADD CONSTRAINT "parent_children_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."parent_profiles"
    ADD CONSTRAINT "parent_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schools"
    ADD CONSTRAINT "schools_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."student_profiles"
    ADD CONSTRAINT "student_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."survey_answers"
    ADD CONSTRAINT "survey_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."survey_questions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_answers"
    ADD CONSTRAINT "survey_answers_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."survey_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_questions"
    ADD CONSTRAINT "survey_questions_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_respondent_id_fkey" FOREIGN KEY ("respondent_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."survey_responses"
    ADD CONSTRAINT "survey_responses_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "public"."surveys"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."surveys"
    ADD CONSTRAINT "surveys_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teacher_profiles"
    ADD CONSTRAINT "teacher_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teacher_profiles"
    ADD CONSTRAINT "teacher_profiles_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."teacher_students"
    ADD CONSTRAINT "teacher_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."student_profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teacher_students"
    ADD CONSTRAINT "teacher_students_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher_profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Admin can view all hydration_logs" ON "public"."hydration_logs" FOR SELECT USING ((( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'admin'::"public"."user_role"));



CREATE POLICY "Admin can view all profiles" ON "public"."profiles" FOR SELECT USING ((( SELECT "profiles_1"."role"
   FROM "public"."profiles" "profiles_1"
  WHERE ("profiles_1"."id" = "auth"."uid"())) = 'admin'::"public"."user_role"));



CREATE POLICY "Admin can view all student_profiles" ON "public"."student_profiles" FOR SELECT USING ((( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'admin'::"public"."user_role"));



CREATE POLICY "Admin has full access to education materials" ON "public"."education_materials" USING ((( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'admin'::"public"."user_role"));



CREATE POLICY "Admin has full access to survey_questions" ON "public"."survey_questions" USING ((( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'admin'::"public"."user_role"));



CREATE POLICY "Admin has full access to surveys" ON "public"."surveys" USING ((( SELECT "profiles"."role"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())) = 'admin'::"public"."user_role"));



CREATE POLICY "Users can insert own responses" ON "public"."survey_responses" FOR INSERT WITH CHECK (("auth"."uid"() = "respondent_id"));



CREATE POLICY "Users can view own responses" ON "public"."survey_responses" FOR SELECT USING (("auth"."uid"() = "respondent_id"));



CREATE POLICY "children_can_update_their_notifications" ON "public"."child_notifications" FOR UPDATE TO "authenticated" USING (("child_id" = "auth"."uid"())) WITH CHECK (("child_id" = "auth"."uid"()));



CREATE POLICY "children_can_view_their_notifications" ON "public"."child_notifications" FOR SELECT TO "authenticated" USING (("child_id" = "auth"."uid"()));



CREATE POLICY "parents_can_insert_notifications_for_their_children" ON "public"."child_notifications" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."parent_children" "pc"
  WHERE (("pc"."parent_id" = "auth"."uid"()) AND ("pc"."child_id" = "child_notifications"."child_id")))) AND ("sender_parent_id" = "auth"."uid"())));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON TABLE "public"."child_notifications" TO "anon";
GRANT ALL ON TABLE "public"."child_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."child_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."daily_checkins" TO "anon";
GRANT ALL ON TABLE "public"."daily_checkins" TO "authenticated";
GRANT ALL ON TABLE "public"."daily_checkins" TO "service_role";



GRANT ALL ON TABLE "public"."education_materials" TO "anon";
GRANT ALL ON TABLE "public"."education_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."education_materials" TO "service_role";



GRANT ALL ON TABLE "public"."hydration_feedback" TO "anon";
GRANT ALL ON TABLE "public"."hydration_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."hydration_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."hydration_logs" TO "anon";
GRANT ALL ON TABLE "public"."hydration_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."hydration_logs" TO "service_role";



GRANT ALL ON TABLE "public"."parent_children" TO "anon";
GRANT ALL ON TABLE "public"."parent_children" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_children" TO "service_role";



GRANT ALL ON TABLE "public"."parent_profiles" TO "anon";
GRANT ALL ON TABLE "public"."parent_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."parent_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."schools" TO "anon";
GRANT ALL ON TABLE "public"."schools" TO "authenticated";
GRANT ALL ON TABLE "public"."schools" TO "service_role";



GRANT ALL ON TABLE "public"."student_profiles" TO "anon";
GRANT ALL ON TABLE "public"."student_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."student_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."survey_answers" TO "anon";
GRANT ALL ON TABLE "public"."survey_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_answers" TO "service_role";



GRANT ALL ON TABLE "public"."survey_questions" TO "anon";
GRANT ALL ON TABLE "public"."survey_questions" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_questions" TO "service_role";



GRANT ALL ON TABLE "public"."survey_responses" TO "anon";
GRANT ALL ON TABLE "public"."survey_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."survey_responses" TO "service_role";



GRANT ALL ON TABLE "public"."surveys" TO "anon";
GRANT ALL ON TABLE "public"."surveys" TO "authenticated";
GRANT ALL ON TABLE "public"."surveys" TO "service_role";



GRANT ALL ON TABLE "public"."teacher_profiles" TO "anon";
GRANT ALL ON TABLE "public"."teacher_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."teacher_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."teacher_students" TO "anon";
GRANT ALL ON TABLE "public"."teacher_students" TO "authenticated";
GRANT ALL ON TABLE "public"."teacher_students" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
