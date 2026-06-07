-- ════════════════════════════════════════════════════════════════════════════
-- Azure Shores — Beach & Pool Lounge System
-- Run this entire file in: Supabase Dashboard → SQL Editor → New Query
-- ════════════════════════════════════════════════════════════════════════════

-- ── TABLES ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL UNIQUE,
  type        TEXT NOT NULL DEFAULT 'sunbed',    -- sunbed | lounger | cabana | table
  zone        TEXT NOT NULL DEFAULT 'Beach',     -- Beach | Pool | Terrace
  status      TEXT NOT NULL DEFAULT 'available', -- available | occupied
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS access_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  label       TEXT,
  used        BOOLEAN DEFAULT FALSE,
  used_by     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_name           TEXT NOT NULL,
  guest_type           TEXT NOT NULL,              -- inhouse | daycation
  room_number          TEXT,
  access_code          TEXT,
  location_id          UUID NOT NULL REFERENCES locations(id),
  previous_location_id UUID REFERENCES locations(id),
  status               TEXT NOT NULL DEFAULT 'active', -- active | ended | force_ended
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  ended_at             TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS menu_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  price       NUMERIC(10,2) NOT NULL,
  image_url   TEXT,
  in_stock    BOOLEAN DEFAULT TRUE,
  featured    BOOLEAN DEFAULT FALSE,
  sort_order  INTEGER DEFAULT 0,
  modifiers   JSONB DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           UUID NOT NULL REFERENCES sessions(id),
  location_id          UUID NOT NULL REFERENCES locations(id),
  original_location_id UUID NOT NULL REFERENCES locations(id),
  guest_name           TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'pending', -- pending | preparing | delivered | cancelled
  special_notes        TEXT,
  total                NUMERIC(10,2) DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  delivered_at         TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id   UUID NOT NULL REFERENCES menu_items(id),
  item_name      TEXT NOT NULL,
  item_price     NUMERIC(10,2) NOT NULL,
  quantity       INTEGER DEFAULT 1,
  modifiers      JSONB DEFAULT '[]'::jsonb,
  subtotal       NUMERIC(10,2) NOT NULL
);

-- ── INDEXES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_location_status ON sessions(location_id, status);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ── ROW LEVEL SECURITY (permissive for pilot — tighten in production) ────────
ALTER TABLE locations         DISABLE ROW LEVEL SECURITY;
ALTER TABLE access_codes      DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions          DISABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories   DISABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items        DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders            DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items       DISABLE ROW LEVEL SECURITY;

-- ── REALTIME ─────────────────────────────────────────────────────────────────
-- Enable Postgres Realtime for live staff/manager updates
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE locations;

-- ════════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ════════════════════════════════════════════════════════════════════════════

-- ── Locations ────────────────────────────────────────────────────────────────
INSERT INTO locations (name, type, zone) VALUES
  ('Sunbed 1','sunbed','Beach'),('Sunbed 2','sunbed','Beach'),('Sunbed 3','sunbed','Beach'),
  ('Sunbed 4','sunbed','Beach'),('Sunbed 5','sunbed','Beach'),('Sunbed 6','sunbed','Beach'),
  ('Sunbed 7','sunbed','Beach'),('Sunbed 8','sunbed','Beach'),('Sunbed 9','sunbed','Beach'),
  ('Sunbed 10','sunbed','Beach'),('Sunbed 11','sunbed','Beach'),('Sunbed 12','sunbed','Beach'),
  ('Sunbed 13','sunbed','Beach'),('Sunbed 14','sunbed','Beach'),('Sunbed 15','sunbed','Beach'),
  ('Sunbed 16','sunbed','Beach'),('Sunbed 17','sunbed','Beach'),('Sunbed 18','sunbed','Beach'),
  ('Sunbed 19','sunbed','Beach'),('Sunbed 20','sunbed','Beach'),('Sunbed 21','sunbed','Beach'),
  ('Sunbed 22','sunbed','Beach'),('Sunbed 23','sunbed','Beach'),('Sunbed 24','sunbed','Beach'),
  ('Sunbed 25','sunbed','Beach'),('Sunbed 26','sunbed','Beach'),('Sunbed 27','sunbed','Beach'),
  ('Sunbed 28','sunbed','Beach'),('Sunbed 29','sunbed','Beach'),('Sunbed 30','sunbed','Beach'),
  ('Pool Lounger 1','lounger','Pool'),('Pool Lounger 2','lounger','Pool'),
  ('Pool Lounger 3','lounger','Pool'),('Pool Lounger 4','lounger','Pool'),
  ('Pool Lounger 5','lounger','Pool'),('Pool Lounger 6','lounger','Pool'),
  ('Pool Lounger 7','lounger','Pool'),('Pool Lounger 8','lounger','Pool'),
  ('Pool Lounger 9','lounger','Pool'),('Pool Lounger 10','lounger','Pool'),
  ('Pool Lounger 11','lounger','Pool'),('Pool Lounger 12','lounger','Pool'),
  ('Cabana 1','cabana','Beach'),('Cabana 2','cabana','Beach'),('Cabana 3','cabana','Beach'),
  ('Cabana 4','cabana','Beach'),('Cabana 5','cabana','Beach'),('Cabana 6','cabana','Beach'),
  ('Terrace Table 1','table','Terrace'),('Terrace Table 2','table','Terrace'),
  ('Terrace Table 3','table','Terrace'),('Terrace Table 4','table','Terrace')
ON CONFLICT (name) DO NOTHING;

-- ── Menu Categories ───────────────────────────────────────────────────────────
INSERT INTO menu_categories (id, name, sort_order) VALUES
  ('cat-0001-0000-0000-000000000001', 'Spirits & Aperitifs', 1),
  ('cat-0001-0000-0000-000000000002', 'Signature Cocktails', 2),
  ('cat-0001-0000-0000-000000000003', 'Bubbles & Champagne', 3),
  ('cat-0001-0000-0000-000000000004', 'Wine',                4),
  ('cat-0001-0000-0000-000000000005', 'Non-Alcoholic',       5),
  ('cat-0001-0000-0000-000000000006', 'Light Bites',         6)
ON CONFLICT (id) DO NOTHING;

-- ── Menu Items ────────────────────────────────────────────────────────────────
INSERT INTO menu_items (category_id, name, description, price, image_url, featured, sort_order, modifiers) VALUES
  -- Spirits
  ('cat-0001-0000-0000-000000000001','Hendrick''s Gin & Tonic','Cucumber, rose petals, premium tonic',22,'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&q=80',true,1,'[{"label":"Premium Spirit Upgrade","price":12},{"label":"Extra Garnish","price":0}]'),
  ('cat-0001-0000-0000-000000000001','Single Malt Scotch','Glenfiddich 18yr, served neat or on the rocks',38,'https://images.unsplash.com/photo-1527281400683-1aae777175f8?w=600&q=80',true,2,'[{"label":"Upgrade to 21yr","price":18},{"label":"On The Rocks","price":0}]'),
  ('cat-0001-0000-0000-000000000001','Grey Goose Vodka','Served with choice of mixer',24,'https://images.unsplash.com/photo-1598373182133-52452f7691ef?w=600&q=80',false,3,'[{"label":"Soda Water","price":0},{"label":"Cranberry","price":0},{"label":"Orange Juice","price":0}]'),
  -- Cocktails
  ('cat-0001-0000-0000-000000000002','Paloma Blanca','Tequila blanco, pink grapefruit, agave, salted rim',26,'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600&q=80',true,1,'[{"label":"Spicy Rim","price":0},{"label":"No Salt","price":0},{"label":"Low Sugar","price":0}]'),
  ('cat-0001-0000-0000-000000000002','Azure Negroni','Campari, Roku gin, sweet vermouth, orange peel',28,'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600&q=80',true,2,'[{"label":"Extra Bitter","price":0},{"label":"No Ice","price":0}]'),
  ('cat-0001-0000-0000-000000000002','Riviera Spritz','Aperol, Prosecco, soda, blood orange',24,'https://images.unsplash.com/photo-1546171753-97d7676e4602?w=600&q=80',true,3,'[{"label":"No Added Sugar","price":0},{"label":"Extra Prosecco","price":4}]'),
  ('cat-0001-0000-0000-000000000002','Passion Fruit Mojito','Rum, passion fruit, fresh mint, lime',25,'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=600&q=80',false,4,'[{"label":"No Sugar","price":0},{"label":"Extra Mint","price":0},{"label":"Virgin (No Alcohol)","price":-8}]'),
  ('cat-0001-0000-0000-000000000002','Lychee Martini','Vodka, lychee liqueur, fresh lime, rose water',27,'https://images.unsplash.com/photo-1575023782549-62ca0d244b39?w=600&q=80',false,5,'[{"label":"Dry","price":0},{"label":"Extra Lychee","price":0}]'),
  -- Bubbles
  ('cat-0001-0000-0000-000000000003','Moët & Chandon Impérial','NV Brut Champagne, 150ml',32,'https://images.unsplash.com/photo-1582819509237-d5b75f20ff7a?w=600&q=80',true,1,'[{"label":"Upgrade to Rosé","price":8}]'),
  ('cat-0001-0000-0000-000000000003','Dom Pérignon 2015','150ml prestige cuvée',85,'https://images.unsplash.com/photo-1550985616-10810253b84d?w=600&q=80',true,2,'[]'),
  ('cat-0001-0000-0000-000000000003','Veuve Clicquot Rosé','NV Rosé Champagne, 150ml',38,'https://images.unsplash.com/photo-1547595628-c61a29f496f0?w=600&q=80',false,3,'[]'),
  -- Wine
  ('cat-0001-0000-0000-000000000004','Whispering Angel Rosé','Provence, France — glass 175ml',22,'https://images.unsplash.com/photo-1474722883778-792e7990302f?w=600&q=80',true,1,'[{"label":"Upgrade to Bottle","price":68}]'),
  ('cat-0001-0000-0000-000000000004','Sauvignon Blanc','Cloudy Bay, Marlborough NZ — glass 175ml',19,'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&q=80',false,2,'[{"label":"Upgrade to Bottle","price":58}]'),
  -- Non-Alcoholic
  ('cat-0001-0000-0000-000000000005','Seedlip Garden Spritz','Non-alcoholic distilled spirit, cucumber, pea, spearmint',16,'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&q=80',true,1,'[{"label":"Extra Ice","price":0},{"label":"No Added Sugar","price":0}]'),
  ('cat-0001-0000-0000-000000000005','Fresh Pressed Juices','Watermelon, Mango-Lime, or Cucumber-Mint',12,'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&q=80',false,2,'[{"label":"Watermelon","price":0},{"label":"Mango-Lime","price":0},{"label":"Cucumber-Mint","price":0}]'),
  ('cat-0001-0000-0000-000000000005','Still or Sparkling Water','Evian 750ml',8,'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=600&q=80',false,3,'[{"label":"Still","price":0},{"label":"Sparkling","price":0}]'),
  -- Light Bites
  ('cat-0001-0000-0000-000000000006','Chilled Seafood Platter','King prawn, smoked salmon, lemon aioli, focaccia',48,'https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=600&q=80',true,1,'[{"label":"Allergen Note","price":0,"type":"text"}]'),
  ('cat-0001-0000-0000-000000000006','Truffle Parmesan Fries','Hand-cut, shaved parmesan, truffle oil',18,'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=600&q=80',false,2,'[{"label":"Extra Truffle","price":3},{"label":"No Parmesan (Vegan)","price":0}]'),
  ('cat-0001-0000-0000-000000000006','Mezze Selection','Hummus, baba ganoush, labneh, warm pita',24,'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80',false,3,'[{"label":"Gluten Free Bread","price":2},{"label":"Dietary Note","price":0,"type":"text"}]');

-- ── Access Codes ──────────────────────────────────────────────────────────────
INSERT INTO access_codes (code, label) VALUES
  ('AZURE2024', 'General Daycation'),
  ('RIVIERA10', 'Premium Daycation'),
  ('BEACH88',   'Event Guest'),
  ('SUNSET55',  'Influencer Pass'),
  ('WAVE2024',  'General Daycation')
ON CONFLICT (code) DO NOTHING;
