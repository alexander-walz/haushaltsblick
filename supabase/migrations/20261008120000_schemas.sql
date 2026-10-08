-- Sieben Schemas laut Konzept Abschnitt 7. Nach außen sichtbar ist nur api (config.toml).
create schema if not exists raw;
create schema if not exists core;
create schema if not exists mart;
create schema if not exists semantic;
create schema if not exists ops;
create schema if not exists audit;
create schema if not exists api;

revoke all on schema raw, core, mart, semantic, ops, audit from anon, authenticated;
