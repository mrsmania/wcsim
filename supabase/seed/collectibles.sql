-- GENERATED FILE - do not edit by hand.
-- Source: src/data/squads.ts + STICKER_TIERS, via scripts/gen-collectibles.ts.
-- Regenerate with `npm run gen:collectibles` after any rating or tier change;
-- `npm run checks` fails while this file and the dataset disagree.
--
-- rows: 81 (58 legendary / 18 iconic / 5 monumental)
-- checksum: 8d81d15037435996
--
-- Idempotent: upserts the catalogue, and marks anything no longer collectible as
-- inactive rather than deleting it, so a sticker somebody already owns keeps its
-- row (album_stickers references this table).

begin;

create temporary table collectibles_seed (
  player_id   text primary key,
  tier        text not null,
  elo         integer not null,
  name        text not null,
  squad_id    text not null,
  nation_code text not null,
  year        integer not null
) on commit drop;

insert into collectibles_seed
  (player_id, tier, elo, name, squad_id, nation_code, year)
values
  ('arg-1990-10', 'legendary', 92, 'Diego Maradona', 'arg-1990', 'ARG', 1990),
  ('arg-1998-9', 'legendary', 91, 'Gabriel Batistuta', 'arg-1998', 'ARG', 1998),
  ('arg-2010-10', 'iconic', 93, 'Lionel Messi', 'arg-2010', 'ARG', 2010),
  ('arg-2014-10', 'iconic', 95, 'Lionel Messi', 'arg-2014', 'ARG', 2014),
  ('arg-2018-10', 'iconic', 94, 'Lionel Messi', 'arg-2018', 'ARG', 2018),
  ('arg-2022-10', 'monumental', 99, 'Lionel Messi', 'arg-2022', 'ARG', 2022),
  ('bel-1994-1', 'legendary', 90, 'Michel Preud''homme', 'bel-1994', 'BEL', 1994),
  ('bel-2018-1', 'legendary', 90, 'Thibaut Courtois', 'bel-2018', 'BEL', 2018),
  ('bel-2018-10', 'legendary', 92, 'Eden Hazard', 'bel-2018', 'BEL', 2018),
  ('bel-2018-7', 'iconic', 93, 'Kevin De Bruyne', 'bel-2018', 'BEL', 2018),
  ('bel-2022-1', 'iconic', 93, 'Thibaut Courtois', 'bel-2022', 'BEL', 2022),
  ('bel-2022-7', 'iconic', 94, 'Kevin De Bruyne', 'bel-2022', 'BEL', 2022),
  ('bra-1994-11', 'iconic', 96, 'Romário', 'bra-1994', 'BRA', 1994),
  ('bra-1994-7', 'legendary', 90, 'Bebeto', 'bra-1994', 'BRA', 1994),
  ('bra-1998-10', 'legendary', 90, 'Rivaldo', 'bra-1998', 'BRA', 1998),
  ('bra-1998-9', 'iconic', 96, 'Ronaldo', 'bra-1998', 'BRA', 1998),
  ('bra-2002-10', 'iconic', 93, 'Rivaldo', 'bra-2002', 'BRA', 2002),
  ('bra-2002-11', 'iconic', 93, 'Ronaldinho', 'bra-2002', 'BRA', 2002),
  ('bra-2002-2', 'legendary', 90, 'Cafu', 'bra-2002', 'BRA', 2002),
  ('bra-2002-6', 'legendary', 92, 'Roberto Carlos', 'bra-2002', 'BRA', 2002),
  ('bra-2002-9', 'monumental', 98, 'Ronaldo', 'bra-2002', 'BRA', 2002),
  ('bra-2006-9', 'legendary', 90, 'Ronaldo', 'bra-2006', 'BRA', 2006),
  ('bra-2014-10', 'legendary', 92, 'Neymar', 'bra-2014', 'BRA', 2014),
  ('bra-2014-3', 'legendary', 90, 'Thiago Silva', 'bra-2014', 'BRA', 2014),
  ('bra-2018-10', 'legendary', 91, 'Neymar', 'bra-2018', 'BRA', 2018),
  ('bra-2022-1', 'legendary', 91, 'Alisson', 'bra-2022', 'BRA', 2022),
  ('bra-2022-10', 'iconic', 93, 'Neymar', 'bra-2022', 'BRA', 2022),
  ('bra-2022-20', 'legendary', 90, 'Vinícius Júnior', 'bra-2022', 'BRA', 2022),
  ('bul-1994-8', 'legendary', 90, 'Hristo Stoichkov', 'bul-1994', 'BUL', 1994),
  ('cro-1998-9', 'legendary', 91, 'Davor Šuker', 'cro-1998', 'CRO', 1998),
  ('cro-2018-10', 'legendary', 92, 'Luka Modrić', 'cro-2018', 'CRO', 2018),
  ('cro-2022-10', 'legendary', 92, 'Luka Modrić', 'cro-2022', 'CRO', 2022),
  ('eng-2022-9', 'legendary', 91, 'Harry Kane', 'eng-2022', 'ENG', 2022),
  ('esp-2010-1', 'legendary', 90, 'Iker Casillas', 'esp-2010', 'ESP', 2010),
  ('esp-2010-6', 'iconic', 93, 'Andrés Iniesta', 'esp-2010', 'ESP', 2010),
  ('esp-2010-7', 'legendary', 91, 'David Villa', 'esp-2010', 'ESP', 2010),
  ('esp-2010-8', 'iconic', 94, 'Xavi', 'esp-2010', 'ESP', 2010),
  ('esp-2014-6', 'legendary', 90, 'Andrés Iniesta', 'esp-2014', 'ESP', 2014),
  ('esp-2018-15', 'legendary', 92, 'Sergio Ramos', 'esp-2018', 'ESP', 2018),
  ('esp-2018-3', 'legendary', 90, 'Gerard Piqué', 'esp-2018', 'ESP', 2018),
  ('esp-2018-5', 'legendary', 90, 'Sergio Busquets', 'esp-2018', 'ESP', 2018),
  ('esp-2018-6', 'legendary', 91, 'Andrés Iniesta', 'esp-2018', 'ESP', 2018),
  ('esp-2022-16', 'legendary', 90, 'Rodri', 'esp-2022', 'ESP', 2022),
  ('fra-1998-10', 'iconic', 95, 'Zinedine Zidane', 'fra-1998', 'FRA', 1998),
  ('fra-2002-10', 'legendary', 92, 'Zinedine Zidane', 'fra-2002', 'FRA', 2002),
  ('fra-2006-10', 'monumental', 97, 'Zinedine Zidane', 'fra-2006', 'FRA', 2006),
  ('fra-2018-10', 'legendary', 90, 'Kylian Mbappé', 'fra-2018', 'FRA', 2018),
  ('fra-2018-7', 'legendary', 90, 'Antoine Griezmann', 'fra-2018', 'FRA', 2018),
  ('fra-2022-10', 'monumental', 97, 'Kylian Mbappé', 'fra-2022', 'FRA', 2022),
  ('fra-2022-7', 'legendary', 90, 'Antoine Griezmann', 'fra-2022', 'FRA', 2022),
  ('ger-1990-10', 'legendary', 92, 'Lothar Matthäus', 'ger-1990', 'GER', 1990),
  ('ger-2002-1', 'iconic', 96, 'Oliver Kahn', 'ger-2002', 'GER', 2002),
  ('ger-2002-13', 'legendary', 91, 'Michael Ballack', 'ger-2002', 'GER', 2002),
  ('ger-2014-1', 'monumental', 97, 'Manuel Neuer', 'ger-2014', 'GER', 2014),
  ('ger-2014-13', 'legendary', 91, 'Thomas Müller', 'ger-2014', 'GER', 2014),
  ('ger-2014-16', 'legendary', 91, 'Philipp Lahm', 'ger-2014', 'GER', 2014),
  ('ger-2014-18', 'legendary', 90, 'Toni Kroos', 'ger-2014', 'GER', 2014),
  ('ger-2018-8', 'legendary', 92, 'Toni Kroos', 'ger-2018', 'GER', 2018),
  ('ita-1990-2', 'legendary', 90, 'Franco Baresi', 'ita-1990', 'ITA', 1990),
  ('ita-1994-10', 'legendary', 92, 'Roberto Baggio', 'ita-1994', 'ITA', 1994),
  ('ita-1994-6', 'legendary', 90, 'Franco Baresi', 'ita-1994', 'ITA', 1994),
  ('ita-1998-10', 'legendary', 90, 'Alessandro Del Piero', 'ita-1998', 'ITA', 1998),
  ('ita-1998-3', 'legendary', 92, 'Paolo Maldini', 'ita-1998', 'ITA', 1998),
  ('ita-2002-1', 'legendary', 90, 'Gianluigi Buffon', 'ita-2002', 'ITA', 2002),
  ('ita-2006-1', 'iconic', 95, 'Gianluigi Buffon', 'ita-2006', 'ITA', 2006),
  ('ita-2006-10', 'legendary', 90, 'Francesco Totti', 'ita-2006', 'ITA', 2006),
  ('ita-2006-21', 'legendary', 91, 'Andrea Pirlo', 'ita-2006', 'ITA', 2006),
  ('ita-2006-5', 'iconic', 96, 'Fabio Cannavaro', 'ita-2006', 'ITA', 2006),
  ('ned-1990-9', 'legendary', 90, 'Marco van Basten', 'ned-1990', 'NED', 1990),
  ('ned-1998-8', 'legendary', 91, 'Dennis Bergkamp', 'ned-1998', 'NED', 1998),
  ('ned-2010-10', 'legendary', 90, 'Wesley Sneijder', 'ned-2010', 'NED', 2010),
  ('ned-2014-11', 'legendary', 90, 'Arjen Robben', 'ned-2014', 'NED', 2014),
  ('ned-2022-4', 'legendary', 90, 'Virgil van Dijk', 'ned-2022', 'NED', 2022),
  ('pol-2018-9', 'legendary', 90, 'Robert Lewandowski', 'pol-2018', 'POL', 2018),
  ('pol-2022-9', 'legendary', 91, 'Robert Lewandowski', 'pol-2022', 'POL', 2022),
  ('por-2010-7', 'legendary', 90, 'Cristiano Ronaldo', 'por-2010', 'POR', 2010),
  ('por-2014-7', 'legendary', 91, 'Cristiano Ronaldo', 'por-2014', 'POR', 2014),
  ('por-2018-7', 'iconic', 93, 'Cristiano Ronaldo', 'por-2018', 'POR', 2018),
  ('rou-1994-10', 'legendary', 90, 'Gheorghe Hagi', 'rou-1994', 'ROU', 1994),
  ('uru-2010-10', 'legendary', 91, 'Diego Forlán', 'uru-2010', 'URU', 2010),
  ('uru-2014-9', 'legendary', 90, 'Luis Suárez', 'uru-2014', 'URU', 2014);

insert into collectibles
  (player_id, tier, elo, name, squad_id, nation_code, year, active)
select player_id, tier, elo, name, squad_id, nation_code, year, true
from collectibles_seed
on conflict (player_id) do update set
  tier        = excluded.tier,
  elo         = excluded.elo,
  name        = excluded.name,
  squad_id    = excluded.squad_id,
  nation_code = excluded.nation_code,
  year        = excluded.year,
  active      = true;

-- A rating tweak can drop someone out of the collectible bands. Retire them (no new
-- copies can be earned) without breaking the albums that already hold them.
update collectibles c
   set active = false
 where c.active
   and not exists (select 1 from collectibles_seed s where s.player_id = c.player_id);

-- Economy constants the server validates against, mirrored from src/config.ts so they
-- cannot drift independently.
insert into economy_constants (key, value) values
  ('trade_cost_legendary', 10),
  ('trade_cost_iconic', 20),
  ('trade_cost_monumental', 50),
  ('max_swaps_per_run', 2)
on conflict (key) do update set value = excluded.value;

commit;
