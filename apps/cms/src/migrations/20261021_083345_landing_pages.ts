import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_landing_pages_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__landing_pages_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "landing_pages_bullets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "landing_pages_benefits" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "landing_pages" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"eyebrow" varchar,
  	"heading" varchar,
  	"intro" varchar,
  	"image_id" integer,
  	"mobile_image_id" integer,
  	"trust_heading" varchar,
  	"cta_heading" varchar,
  	"cta_body" varchar,
  	"cta_button_label" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_image_id" integer,
  	"seo_canonical" varchar,
  	"seo_noindex" boolean DEFAULT false,
  	"slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_landing_pages_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_landing_pages_v_version_bullets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landing_pages_v_version_benefits" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_landing_pages_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_name" varchar,
  	"version_eyebrow" varchar,
  	"version_heading" varchar,
  	"version_intro" varchar,
  	"version_image_id" integer,
  	"version_mobile_image_id" integer,
  	"version_trust_heading" varchar,
  	"version_cta_heading" varchar,
  	"version_cta_body" varchar,
  	"version_cta_button_label" varchar,
  	"version_seo_title" varchar,
  	"version_seo_description" varchar,
  	"version_seo_image_id" integer,
  	"version_seo_canonical" varchar,
  	"version_seo_noindex" boolean DEFAULT false,
  	"version_slug" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__landing_pages_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "landing_pages_id" integer;
  ALTER TABLE "landing_pages_bullets" ADD CONSTRAINT "landing_pages_bullets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landing_pages_benefits" ADD CONSTRAINT "landing_pages_benefits_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_mobile_image_id_media_id_fk" FOREIGN KEY ("mobile_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_seo_image_id_media_id_fk" FOREIGN KEY ("seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landing_pages_v_version_bullets" ADD CONSTRAINT "_landing_pages_v_version_bullets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landing_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landing_pages_v_version_benefits" ADD CONSTRAINT "_landing_pages_v_version_benefits_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_landing_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_landing_pages_v" ADD CONSTRAINT "_landing_pages_v_parent_id_landing_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."landing_pages"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landing_pages_v" ADD CONSTRAINT "_landing_pages_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landing_pages_v" ADD CONSTRAINT "_landing_pages_v_version_mobile_image_id_media_id_fk" FOREIGN KEY ("version_mobile_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_landing_pages_v" ADD CONSTRAINT "_landing_pages_v_version_seo_image_id_media_id_fk" FOREIGN KEY ("version_seo_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "landing_pages_bullets_order_idx" ON "landing_pages_bullets" USING btree ("_order");
  CREATE INDEX "landing_pages_bullets_parent_id_idx" ON "landing_pages_bullets" USING btree ("_parent_id");
  CREATE INDEX "landing_pages_benefits_order_idx" ON "landing_pages_benefits" USING btree ("_order");
  CREATE INDEX "landing_pages_benefits_parent_id_idx" ON "landing_pages_benefits" USING btree ("_parent_id");
  CREATE INDEX "landing_pages_image_idx" ON "landing_pages" USING btree ("image_id");
  CREATE INDEX "landing_pages_mobile_image_idx" ON "landing_pages" USING btree ("mobile_image_id");
  CREATE INDEX "landing_pages_seo_seo_image_idx" ON "landing_pages" USING btree ("seo_image_id");
  CREATE UNIQUE INDEX "landing_pages_slug_idx" ON "landing_pages" USING btree ("slug");
  CREATE INDEX "landing_pages_updated_at_idx" ON "landing_pages" USING btree ("updated_at");
  CREATE INDEX "landing_pages_created_at_idx" ON "landing_pages" USING btree ("created_at");
  CREATE INDEX "landing_pages__status_idx" ON "landing_pages" USING btree ("_status");
  CREATE INDEX "_landing_pages_v_version_bullets_order_idx" ON "_landing_pages_v_version_bullets" USING btree ("_order");
  CREATE INDEX "_landing_pages_v_version_bullets_parent_id_idx" ON "_landing_pages_v_version_bullets" USING btree ("_parent_id");
  CREATE INDEX "_landing_pages_v_version_benefits_order_idx" ON "_landing_pages_v_version_benefits" USING btree ("_order");
  CREATE INDEX "_landing_pages_v_version_benefits_parent_id_idx" ON "_landing_pages_v_version_benefits" USING btree ("_parent_id");
  CREATE INDEX "_landing_pages_v_parent_idx" ON "_landing_pages_v" USING btree ("parent_id");
  CREATE INDEX "_landing_pages_v_version_version_image_idx" ON "_landing_pages_v" USING btree ("version_image_id");
  CREATE INDEX "_landing_pages_v_version_version_mobile_image_idx" ON "_landing_pages_v" USING btree ("version_mobile_image_id");
  CREATE INDEX "_landing_pages_v_version_seo_version_seo_image_idx" ON "_landing_pages_v" USING btree ("version_seo_image_id");
  CREATE INDEX "_landing_pages_v_version_version_slug_idx" ON "_landing_pages_v" USING btree ("version_slug");
  CREATE INDEX "_landing_pages_v_version_version_updated_at_idx" ON "_landing_pages_v" USING btree ("version_updated_at");
  CREATE INDEX "_landing_pages_v_version_version_created_at_idx" ON "_landing_pages_v" USING btree ("version_created_at");
  CREATE INDEX "_landing_pages_v_version_version__status_idx" ON "_landing_pages_v" USING btree ("version__status");
  CREATE INDEX "_landing_pages_v_created_at_idx" ON "_landing_pages_v" USING btree ("created_at");
  CREATE INDEX "_landing_pages_v_updated_at_idx" ON "_landing_pages_v" USING btree ("updated_at");
  CREATE INDEX "_landing_pages_v_latest_idx" ON "_landing_pages_v" USING btree ("latest");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_landing_pages_fk" FOREIGN KEY ("landing_pages_id") REFERENCES "public"."landing_pages"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_landing_pages_id_idx" ON "payload_locked_documents_rels" USING btree ("landing_pages_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "landing_pages_bullets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "landing_pages_benefits" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "landing_pages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_landing_pages_v_version_bullets" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_landing_pages_v_version_benefits" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_landing_pages_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "landing_pages_bullets" CASCADE;
  DROP TABLE "landing_pages_benefits" CASCADE;
  DROP TABLE "landing_pages" CASCADE;
  DROP TABLE "_landing_pages_v_version_bullets" CASCADE;
  DROP TABLE "_landing_pages_v_version_benefits" CASCADE;
  DROP TABLE "_landing_pages_v" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_landing_pages_fk";
  
  DROP INDEX "payload_locked_documents_rels_landing_pages_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "landing_pages_id";
  DROP TYPE "public"."enum_landing_pages_status";
  DROP TYPE "public"."enum__landing_pages_v_version_status";`)
}
