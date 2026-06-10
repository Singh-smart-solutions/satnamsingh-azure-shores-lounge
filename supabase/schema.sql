-- ════════════════════════════════════════════════════════════════════════════
-- Azure Shores — 5-Star Hotel Beach & Pool Lounge Ordering System
-- Supabase Database Schema Script
-- ════════════════════════════════════════════════════════════════════════════

-- Drop tables if they exist to start fresh
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS drinks_menu CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS locations CASCADE;

-- ── 1. LOCATIONS ─────────────────────────────────────────────────────────────
CREATE TABLE locations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. SESSIONS ──────────────────────────────────────────────────────────────
CREATE TABLE sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  guest_name      TEXT NOT NULL,
  room_number     TEXT,
  daycation_code  TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  ended_at        TIMESTAMPTZ
);

-- Ensure a UNIQUE partial index on location_id where is_active is true
-- This guarantees a sunbed cannot have duplicate active sessions
CREATE UNIQUE INDEX idx_sessions_location_active 
  ON sessions(location_id) 
  WHERE (is_active = TRUE);

-- ── 3. DRINKS MENU ───────────────────────────────────────────────────────────
CREATE TABLE drinks_menu (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name     TEXT NOT NULL,
  category      TEXT NOT NULL CHECK (category IN ('Champagne', 'Cocktails', 'Juices')),
  price         NUMERIC(10,2) NOT NULL,
  description   TEXT,
  image_url     TEXT,
  is_available  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. ORDERS & ORDER ITEMS ──────────────────────────────────────────────────
CREATE TABLE orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  location_id           UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  original_location_id  UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  guest_name            TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'delivered')),
  special_notes         TEXT,
  total                 NUMERIC(10,2) DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  delivered_at          TIMESTAMPTZ
);

CREATE TABLE order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  drink_id      UUID NOT NULL REFERENCES drinks_menu(id) ON DELETE RESTRICT,
  item_name     TEXT NOT NULL,
  price         NUMERIC(10,2) NOT NULL,
  quantity      INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  subtotal      NUMERIC(10,2) NOT NULL
);

-- ── 5. INDEXES FOR PERFORMANCE ───────────────────────────────────────────────
CREATE INDEX idx_sessions_active ON sessions(is_active) WHERE (is_active = TRUE);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_session ON orders(session_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ── 6. ROW LEVEL SECURITY (Permissive for pilot/MVP) ─────────────────────────
ALTER TABLE locations    DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions     DISABLE ROW LEVEL SECURITY;
ALTER TABLE drinks_menu  DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders       DISABLE ROW LEVEL SECURITY;
ALTER TABLE order_items  DISABLE ROW LEVEL SECURITY;

-- ── 7. ENABLE REALTIME ───────────────────────────────────────────────────────
BEGIN;
  -- Remove tables if they are already in the publication
  ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS orders, sessions, locations;
  
  -- Add tables to realtime publication
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
  ALTER PUBLICATION supabase_realtime ADD TABLE locations;
COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- SEED DATA
-- ════════════════════════════════════════════════════════════════════════════

-- Pre-seed Locations
INSERT INTO locations (label, status) VALUES
  ('Sunbed 1', 'available'),
  ('Sunbed 2', 'available'),
  ('Sunbed 3', 'available'),
  ('Sunbed 4', 'available'),
  ('Sunbed 5', 'available'),
  ('Sunbed 6', 'available'),
  ('Sunbed 7', 'available'),
  ('Sunbed 8', 'available'),
  ('Sunbed 9', 'available'),
  ('Sunbed 10', 'available'),
  ('Sunbed 11', 'available'),
  ('Sunbed 12', 'available'),
  ('Sunbed 13', 'available'),
  ('Sunbed 14', 'available'),
  ('Sunbed 15', 'occupied'),  -- Pre-seeded as occupied for test check
  ('Sunbed 16', 'available'),
  ('Sunbed 17', 'available'),
  ('Sunbed 18', 'available'),
  ('Sunbed 19', 'available'),
  ('Sunbed 20', 'available'),
  ('Sunbed 21', 'available'),
  ('Sunbed 22', 'available'),
  ('Sunbed 23', 'available'),
  ('Sunbed 24', 'available'),
  ('Sunbed 25', 'available'),
  ('Cabana 1', 'available'),
  ('Cabana 2', 'available'),
  ('Cabana 3', 'available'),
  ('Cabana 4', 'available'),
  ('Cabana 5', 'available');

-- Pre-seed Drinks Menu (Ultra-Luxury Selection)
INSERT INTO drinks_menu (item_name, category, price, description, image_url, is_available) VALUES
  -- Champagne
  ('Dom Pérignon 2015', 'Champagne', 85.00, 'Prestige cuvée Champagne with notes of stone fruit and toasted brioche.', 'https://images.unsplash.com/photo-1550985616-10810253b84d?w=600&q=80', true),
  ('Veuve Clicquot Rosé', 'Champagne', 38.00, 'Bright rosé Champagne featuring ripe wild strawberry notes.', 'https://images.unsplash.com/photo-1547595628-c61a29f496f0?w=600&q=80', true),
  ('Moët & Chandon Impérial', 'Champagne', 32.00, 'Vibrant NV Brut Champagne distinguished by a bright fruitiness.', 'https://images.unsplash.com/photo-1582819509237-d5b75f20ff7a?w=600&q=80', true),
  
  -- Cocktails
  ('Paloma Blanca', 'Cocktails', 26.00, 'Tequila blanco, pink grapefruit soda, fresh lime, agave, sea salt rim.', 'https://images.unsplash.com/photo-1536935338788-846bb9981813?w=600&q=80', true),
  ('Azure Negroni', 'Cocktails', 28.00, 'A light blue twist with Roku gin, sweet vermouth, blue Curaçao.', 'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600&q=80', true),
  ('Riviera Spritz', 'Cocktails', 24.00, 'Aperol, Prosecco, club soda, orange wheel, fresh rosemary.', 'https://images.unsplash.com/photo-1546171753-97d7676e4602?w=600&q=80', true),
  ('Passion Fruit Mojito', 'Cocktails', 25.00, 'White rum, fresh passion fruit pulp, mint leaves, lime juice, club soda.', 'https://images.unsplash.com/photo-1551538827-9c037cb4f32a?w=600&q=80', true),
  
  -- Juices
  ('Watermelon Infusion', 'Juices', 12.00, 'Fresh pressed cold watermelon juice with a hint of organic mint.', 'https://images.unsplash.com/photo-1600271886742-f049cd451bba?w=600&q=80', true),
  ('Mango-Lime Elixir', 'Juices', 12.00, 'Chilled organic mango purée balanced with fresh squeezed key lime juice.', 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=600&q=80', true),
  ('Cucumber-Mint Refresher', 'Juices', 12.00, 'Crisp cucumber juice, green apple, elderflower, fresh garden mint.', 'https://images.unsplash.com/photo-1548839140-29a749e1cf4d?w=600&q=80', true);
