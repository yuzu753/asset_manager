create table if not exists products (
  product_id text primary key,
  name text not null unique,
  category text not null default 'Uncategorized',
  currency text not null default 'JPY',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists valuations (
  date date not null,
  product_id text not null references products(product_id) on delete cascade,
  amount numeric not null,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (date, product_id)
);
