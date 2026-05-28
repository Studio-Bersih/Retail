CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"request_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coupons" (
	"id" text PRIMARY KEY NOT NULL,
	"kode" text NOT NULL,
	"nama" text NOT NULL,
	"kategori" text NOT NULL,
	"kode_member" text,
	"outlet_ids" jsonb,
	"status" text DEFAULT 'Active' NOT NULL,
	"tanggal_mulai" text NOT NULL,
	"tanggal_berakhir" text,
	"min_transaksi" numeric(15, 0) DEFAULT '0' NOT NULL,
	"kuota_total" integer DEFAULT 0 NOT NULL,
	"kuota_per_member" integer DEFAULT 0 NOT NULL,
	"butuh_otorisasi" boolean DEFAULT false NOT NULL,
	"syarat_ketentuan" text,
	"effects" jsonb NOT NULL,
	"code_type" text DEFAULT 'Standard' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "coupons_kode_unique" UNIQUE("kode")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"item_type" text NOT NULL,
	"price_level1" numeric(15, 0) DEFAULT '0' NOT NULL,
	"price_level2" numeric(15, 0) DEFAULT '0' NOT NULL,
	"price_level3" numeric(15, 0) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "items_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "kupon_code_pool" (
	"id" text PRIMARY KEY NOT NULL,
	"kupon_kode" text NOT NULL,
	"code" text NOT NULL,
	"kode_member" text,
	"used_at" text,
	"transaction_id" text,
	CONSTRAINT "kupon_code_pool_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "kupon_log" (
	"id" text PRIMARY KEY NOT NULL,
	"kode_kupon" text NOT NULL,
	"id_transaksi" text,
	"kode_member" text,
	"nip_kasir" text NOT NULL,
	"nip_otorisasi" text,
	"nilai_potongan" numeric(15, 0) NOT NULL,
	"cart_mutations" jsonb NOT NULL,
	"total_sebelum" numeric(15, 0) NOT NULL,
	"total_sesudah" numeric(15, 0) NOT NULL,
	"outlet" text NOT NULL,
	"log_type" text NOT NULL,
	"timestamp" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"whatsapp" text,
	"birthdate" text,
	"address" text,
	"points" integer DEFAULT 0 NOT NULL,
	"is_premium" boolean DEFAULT false NOT NULL,
	"last_transaction_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"item_id" text NOT NULL,
	"qty" integer NOT NULL,
	"price" numeric(15, 0) NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"user_id" text NOT NULL,
	"member_id" text,
	"subtotal" numeric(15, 0) NOT NULL,
	"kupon" jsonb,
	"additional_costs" jsonb DEFAULT '{"packaging":0,"transport":0,"modification":0}'::jsonb NOT NULL,
	"total" numeric(15, 0) NOT NULL,
	"deposit" numeric(15, 0) DEFAULT '0' NOT NULL,
	"remaining" numeric(15, 0) DEFAULT '0' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"due_date" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outlet_stock" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"pre_adj_delta" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outlets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"phone" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promos" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"discount_type" text NOT NULL,
	"discount_value" numeric(15, 0) NOT NULL,
	"min_transaction" numeric(15, 0) DEFAULT '0' NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "promos_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "pt_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"reviewed_by" text,
	"reason" text NOT NULL,
	"old_snapshot" jsonb NOT NULL,
	"new_snapshot" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "shift_counts" (
	"id" text PRIMARY KEY NOT NULL,
	"shift_id" text NOT NULL,
	"payment_method" text NOT NULL,
	"expected_amount" numeric(15, 0) NOT NULL,
	"actual_amount" numeric(15, 0) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"opening_balance" numeric(15, 0) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" text PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"outlet_id" text NOT NULL,
	"delta" integer NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_items" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"item_id" text NOT NULL,
	"qty" integer NOT NULL,
	"price" numeric(15, 0) NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_id" text NOT NULL,
	"method" text NOT NULL,
	"amount" numeric(15, 0) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	CONSTRAINT "transaction_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"outlet_id" text NOT NULL,
	"user_id" text NOT NULL,
	"member_id" text,
	"mode" text NOT NULL,
	"subtotal" numeric(15, 0) NOT NULL,
	"kupon" jsonb,
	"additional_costs" jsonb DEFAULT '{"packaging":0,"transport":0,"modification":0}'::jsonb NOT NULL,
	"total" numeric(15, 0) NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"outlet_id" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kupon_code_pool" ADD CONSTRAINT "kupon_code_pool_kupon_kode_coupons_kode_fk" FOREIGN KEY ("kupon_kode") REFERENCES "public"."coupons"("kode") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kupon_code_pool" ADD CONSTRAINT "kupon_code_pool_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlet_stock" ADD CONSTRAINT "outlet_stock_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlet_stock" ADD CONSTRAINT "outlet_stock_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_requests" ADD CONSTRAINT "pt_requests_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_requests" ADD CONSTRAINT "pt_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_requests" ADD CONSTRAINT "pt_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_counts" ADD CONSTRAINT "shift_counts_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_items" ADD CONSTRAINT "transaction_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_payments" ADD CONSTRAINT "transaction_payments_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "outlet_stock_item_outlet_idx" ON "outlet_stock" USING btree ("item_id","outlet_id");